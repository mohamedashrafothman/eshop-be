import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body, ValidationChain } from "express-validator";
import createError from "http-errors";
import httpStatus, { HttpStatus } from "http-status";
import mongoose, { ClientSession, PaginateOptions } from "mongoose";
import multer, { FileFilterCallback } from "multer";
import isMongoId from "validator/lib/isMongoId";
import ICategory from "../interfaces/Category.interface";
import Attachment, { IAttachmentDocument } from "../models/Attachment";
import Category, { ICategoryDocument } from "../models/Category";
import StorageEngine from "../services/storage";
import {
	deleteFileFromDisk,
	formatResponseObject,
	FormatResponseObjectType,
	handleFileToUpload,
	handleTransactionError,
	isObject,
	type SortItemType,
} from "../utils/helpers";
import vars from "../utils/vars";

/**
 * Validates the input fields based on the method provided.
 */
export const validator = (method: "create" | "update"): ValidationChain[] => {
	switch (method) {
		case "create":
			return [
				body("name")
					.trim()
					.escape()
					.notEmpty()
					.withMessage("You must supply a name!")
					.isLength({ max: 100 })
					.withMessage("Name must be at most 100 characters long!"),
				body("description")
					.trim()
					.escape()
					.notEmpty()
					.withMessage("You must supply a description!")
					.isLength({ max: 1000 })
					.withMessage("Description must be at most 100 characters long!"),
				body("icon").notEmpty().withMessage("You must add an icon!"),
				body("parent")
					.optional()
					.isArray({ min: 1 })
					.withMessage("Parent must be a non-empty array of IDs.")
					.custom((arr: string[]) => arr.every((id) => isMongoId(id)))
					.withMessage("Each parent ID must be a valid UUID."),
			];
		case "update":
			return [
				body("name")
					.trim()
					.escape()
					.optional()
					.notEmpty()
					.withMessage("You must supply a name!")
					.isLength({ max: 100 })
					.withMessage("Name must be at most 100 characters long!"),
				body("description")
					.trim()
					.escape()
					.optional()
					.notEmpty()
					.withMessage("You must supply a description!")
					.isLength({ max: 1000 })
					.withMessage("Description must be at most 100 characters long!"),
				body("icon").optional().notEmpty().withMessage("Icon can't be empty!"),
				body("parent").optional(),
			];
		default:
			return [];
	}
};

/**
 * @summary Uploads a category icon image.
 * @description Handles the uploading of a category's icon image. The image is validated to be of type "image", and the upload is restricted to files with a maximum size defined in the configuration.
 * The uploaded image is resized to be square, and the quality is set to 50%. The file name is hashed to ensure uniqueness.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.file - The uploaded file object containing details about the icon image.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response indicating the icon was uploaded successfully.
 *   * @property {Object} req.body.icon - The uploaded icon file data.
 *   * @throws {Error} 400 - Returns an error if the file type is invalid or the file size exceeds the limit.
 */
export const uploadCategoryIcon = async (
	req: Request,
	res: Response,
	next: NextFunction
): Promise<void> => {
	const storageEngine = new StorageEngine({
		accept: ["image"],
		square: true,
		quality: 50,
		fileHashName: true,
		uploadPath: `${vars.storage.uploadPath}/categories`,
		uploadBasePath: "",
	});

	const imageUpload = multer({
		storage: storageEngine,
		limits: { files: 1, fileSize: 1024 * 1024 * Number(vars.storage.allowedFileSizeInMB) },
		fileFilter: (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
			// supported image file mimetype
			const isFileTypeValid = storageEngine.options.accept.some((item) =>
				file.mimetype.startsWith(item)
			);

			// throw error for invalid files
			if (!isFileTypeValid) return cb(Error("That fileType isn't allowed!"));

			// allow supported image files
			cb(null, true);
		},
	});

	imageUpload.single("icon")(req, res, async (err) => {
		if (err) return next(err);
		if (req.file) req.body.icon = req.file;
		next();
	});
};

/**
 * @openapi
 * /v1/categories:
 *   post:
 *     summary: Creates a new category.
 *     description: Creates a category with name, description, icon, and optional parent. Admin/SuperAdmin only.
 *     tags:
 *       - Categories
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - description
 *               - icon
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 maxLength: 1000
 *               icon:
 *                 type: string
 *                 format: binary
 *               parent:
 *                 type: array
 *                 items:
 *                   type: string
 *                   description: Parent Category ID
 *     responses:
 *       "201":
 *         description: Category created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 201
 *                 entities:
 *                   type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Categories'
 *                 flashes:
 *                   type: object
 *       "400":
 *         description: Invalid file or data.
 *       "401":
 *         description: Unauthorized.
 *       "500":
 *         description: Internal Server Error.
 */
export const postNewCategory = async (
	req: Request<
		{},
		FormatResponseObjectType<ICategoryDocument, HttpStatus["CREATED"]>,
		Pick<ICategory, "name" | "description" | "parent"> & { icon?: Express.Multer.File }
	>,
	res: Response<FormatResponseObjectType<ICategoryDocument, HttpStatus["CREATED"]>>,
	next: NextFunction
): Promise<void> => {
	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	// create variables to hold the created category and attachment
	let createdAttachmentError: Error | null = null;
	let createdAttachment: IAttachmentDocument[] | undefined;

	// Check if icon exists in the request body.
	if (req.body?.icon) {
		// Create a new attachment from the request body icon, and if there was an error,
		// return the error and end the request
		[createdAttachmentError, createdAttachment] = await to(
			Attachment.create(
				[
					handleFileToUpload(
						req.body.icon,
						`${req.protocol}://${req.hostname}${req.app.get("port") ? `:${req.app.get("port")}` : ""}`
					),
				],
				{ session }
			)
		);
		if (createdAttachmentError) {
			handleTransactionError(session);
			return next(createdAttachmentError);
		}
	}

	// Create a new category from the request body data, and if there was an error,
	// return the error and end the request
	const [createdCategoryError, createdCategory] = await to(
		Category.create(
			[
				{
					name: req.body.name,
					description: req.body.description,
					...(req.body?.parent && req.body?.parent.length
						? { parent: req.body.parent }
						: {}),
					...(createdAttachment?.length &&
						createdAttachment[0]?._id && { icon: createdAttachment[0]._id }),
				},
			],
			{ session }
		)
	);
	if (createdCategoryError) {
		handleTransactionError(session);
		return next(createdCategoryError);
	}

	// Check if parent category exists in the request body.
	if (req.body?.parent && req.body?.parent.length && createdCategory[0]?._id) {
		// Add the created category to the parent category's children
		// and if there was an error, return the error and end the request
		const [updatedParentCategoryError] = await to(
			Category.updateManyWithDeleted(
				{ _id: req.body.parent },
				{ $addToSet: { children: createdCategory[0]._id } }
			).session(session)
		);
		if (updatedParentCategoryError) {
			handleTransactionError(session);
			return next(updatedParentCategoryError);
		}
	}

	// Commit the transaction
	await session.commitTransaction();
	session.endSession();

	// Set a flash message to indicate that the category was created successfully,
	// and return the created category in the response
	req.flash("success", "Category created successfully.");
	res.status(httpStatus.CREATED).json(
		formatResponseObject({
			status: httpStatus.CREATED,
			entities: { data: createdCategory[0] },
			flashes: req.flash(),
		})
	);
};

/**
 * @openapi
 * /v1/categories:
 *   get:
 *     summary: Retrieves a paginated list of categories.
 *     description: Fetches categories with filtering and pagination.
 *     tags:
 *       - Categories
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search query.
 *       - in: query
 *         name: deleted
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: firstLevelOnly
 *         schema:
 *           type: boolean
 *     responses:
 *       "200":
 *         description: List of categories.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 entities:
 *                   type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Categories'
 *                     meta:
 *                       type: object
 *                       properties:
 *                         pagination:
 *                           type: object
 *       "500":
 *         description: Internal Server Error.
 */
export const getCategories = async (
	req: Request<
		{},
		FormatResponseObjectType<ICategoryDocument, HttpStatus["OK"]>,
		{},
		Partial<
			Pick<PaginateOptions, "sort" | "page" | "limit" | "offset" | "pagination"> & {
				q?: string;
				deleted?: boolean | number;
				firstLevelOnly?: boolean | number;
			}
		>
	>,
	res: Response<FormatResponseObjectType<ICategoryDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Destructure the query parameters (req.query) into
	// q (search term), deleted (include deleted countries), firstLevelOnly (include first level categories)
	const { q, deleted, firstLevelOnly } = req.query || {};

	// Check if the query includes a deleted flag
	const isFilterByDeletedAllowed: boolean =
		"deleted" in req.query &&
		Boolean(
			req?.user &&
				[vars.auth.roles.superAdmin, vars.auth.roles.admin].includes(req.user.role || "")
		);

	// Check if the query includes a firstLevelOnly flag
	const isFilterByFirstLevelOnlyAllowed: boolean = "firstLevelOnly" in req.query;

	// List of fields to search for the query term
	const querySearchFields: string[] = ["name", "description"];

	// List of sort options
	const sort: SortItemType<"name" | "createdAt">[] = [
		{ name: "Name A-Z", value: { name: 1 } },
		{ name: "Name Z-A", value: { name: -1 } },
		{ name: "Created Date Ascending", value: { createdAt: 1 } },
		{ name: "Created Date Descending", value: { createdAt: -1 } },
	];

	// Attempt to retrieve the categories using the given query and pagination options,
	// and if there was an error, return the error and end the request
	const [paginatedCategoriesError, paginatedCategories] = await to(
		Category.paginate<ICategoryDocument>(
			{
				// If the query includes a search term, filter categories by name or code
				...((q && {
					$or: querySearchFields.map((item) => ({
						[item]: { $regex: String(q).toLowerCase() || "", $options: "i" },
					})),
				}) ||
					{}),
				// If the query includes a deleted flag, include deleted categories
				...((isFilterByDeletedAllowed && { deleted: Boolean(deleted) }) || {}),
				// get just the parent categories.
				...(isFilterByFirstLevelOnlyAllowed &&
				firstLevelOnly !== undefined &&
				Boolean(+firstLevelOnly) === true
					? { parent: { $size: 0 } }
					: {}),
			},
			// Use the query parameters for pagination and sorting
			{
				...("sort" in req.query && { sort: req.query.sort }),
				...("page" in req.query && { page: Number(req.query.page) }),
				...("limit" in req.query && { limit: Number(req.query.limit) }),
				...("offset" in req.query && { offset: Number(req.query.offset) }),
				...("pagination" in req.query && { pagination: Boolean(req.query.pagination) }),
			}
		)
	);
	if (paginatedCategoriesError) return next(paginatedCategoriesError);

	// Destructure the paginated categories into the list of categories (docs) and pagination metadata
	const { docs, ...pagination } = paginatedCategories;

	// Return the list of categories, pagination metadata, and sort options in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: [...(docs || [])], meta: { pagination, sort } },
		})
	);
};

/**
 * @openapi
 * /v1/categories/{category}:
 *   get:
 *     summary: Retrieves a single category.
 *     description: Fetches a category by ID or slug.
 *     tags:
 *       - Categories
 *     parameters:
 *       - in: path
 *         name: category
 *         required: true
 *         schema:
 *           type: string
 *         description: Category ID or slug.
 *     responses:
 *       "200":
 *         description: Category details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 entities:
 *                   type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Categories'
 *       "404":
 *         description: Category not found.
 *       "500":
 *         description: Internal Server Error.
 */
export const getSingleCategory = async (
	req: Request<
		{ category: string },
		FormatResponseObjectType<ICategoryDocument, HttpStatus["OK"]>
	>,
	res: Response<FormatResponseObjectType<ICategoryDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Retrieve the category ID or slug from the request parameters
	const { category: categoryIdentifier } = req.params || {};

	// Attempt to retrieve the category using the given identifier, and if there was an error,
	// return the error
	const findMethodName =
		req.user &&
		req.user.role &&
		[vars.auth.roles.superAdmin, vars.auth.roles.admin].includes(req.user.role)
			? "findOneWithDeleted"
			: "findOne";
	const [categoryError, category] = await to(
		Category[findMethodName]({
			$or: [
				{ slug: categoryIdentifier },
				...(isMongoId(categoryIdentifier) ? [{ _id: categoryIdentifier }] : []),
			],
		})
	);
	if (categoryError || !category) return next(categoryError);

	// Return the retrieved category in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, entities: { data: category } })
	);
};

/**
 * @openapi
 * /v1/categories/{category}:
 *   patch:
 *     summary: Updates a single category.
 *     description: Updates category details and icon. Admin/SuperAdmin only.
 *     tags:
 *       - Categories
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: category
 *         required: true
 *         schema:
 *           type: string
 *         description: Category ID or slug.
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 maxLength: 1000
 *               icon:
 *                 type: string
 *                 format: binary
 *               parent:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       "200":
 *         description: Category updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 entities:
 *                   type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Categories'
 *                 flashes:
 *                   type: object
 *       "401":
 *         description: Unauthorized.
 *       "404":
 *         description: Category not found.
 *       "500":
 *         description: Internal Server Error.
 */
export const updateSingleCategory = async (
	req: Request<
		{ category: string },
		FormatResponseObjectType<ICategoryDocument, HttpStatus["OK"]>,
		Partial<Pick<ICategory, "name" | "description" | "parent">> & { icon?: Express.Multer.File }
	>,
	res: Response<FormatResponseObjectType<ICategoryDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	// Retrieve the category ID or slug from the request parameters
	const { category: categoryIdentifier } = req.params || {};
	const isParentPresentedInTheRequest = "parent" in req.body;
	const isParentValueIncluded =
		req.body?.parent && Array.isArray(req.body?.parent) && req.body?.parent.length > 0;

	// Attempt to retrieve a category from the database with the given ID or slug,
	// and if there was an error or no category was found, return the error and end the request
	let [categoryError, category] = await to(
		Category.findOneWithDeleted({
			$or: [
				{ slug: categoryIdentifier },
				...(isMongoId(categoryIdentifier) ? [{ _id: categoryIdentifier }] : []),
			],
		}).session(session)
	);
	if (categoryError || !category) {
		handleTransactionError(session);
		return next(categoryError);
	}

	// Create variables to hold the created category and attachment
	let createdAttachmentError: Error | null = null;
	let createdAttachment: IAttachmentDocument[] | undefined;

	// Check if icon exists in the request body.
	if (req.body?.icon) {
		// Find the attachment associated with the category
		const [categoryAttachmentError, categoryAttachment] = await to(
			Attachment.findOne({ _id: category.icon?._id || category.icon }).session(session)
		);
		if (categoryAttachmentError) {
			handleTransactionError(session);
			return next(categoryAttachmentError);
		}

		// If the attachment exists, delete it, and delete the file from disk
		if (categoryAttachment?._id) {
			const [deletedCategoryAttachmentError] = await to(
				Attachment.deleteOne({ _id: categoryAttachment._id }).session(session)
			);
			if (deletedCategoryAttachmentError) {
				handleTransactionError(session);
				return next(deletedCategoryAttachmentError);
			}

			// delete file from disk if it exists
			const [deleteFileFromDiskError] = await to(deleteFileFromDisk(categoryAttachment.path));
			if (deleteFileFromDiskError) {
				handleTransactionError(session);
				return next(deleteFileFromDiskError);
			}
		}

		// Create a new attachment from the request body icon, and if there was an error,
		// return the error and end the request
		[createdAttachmentError, createdAttachment] = await to(
			Attachment.create(
				[
					handleFileToUpload(
						req.body.icon,
						`${req.protocol}://${req.hostname}${req.app.get("port") ? `:${req.app.get("port")}` : ""}`
					),
				],
				{ session }
			)
		);
		if (createdAttachmentError) {
			handleTransactionError(session);
			return next(createdAttachmentError);
		}
	}

	// Check if parent exists.
	if (isParentPresentedInTheRequest) {
		const [removedParentCategoriesError] = await to(
			Category.updateManyWithDeleted(
				{
					_id: category.parent?.map((singleParent) =>
						!isObject(singleParent) ? singleParent : singleParent._id
					),
				},
				{ $pull: { children: category._id } }
			).session(session)
		);
		if (removedParentCategoriesError) {
			handleTransactionError(session);
			return next(removedParentCategoriesError);
		}

		if (isParentValueIncluded) {
			// Add the created category to the parent category's children
			// and if there was an error, return the error and end the request
			const [updatedParentCategoriesError] = await to(
				Category.updateManyWithDeleted(
					{ _id: req.body.parent },
					{ $addToSet: { children: category._id } }
				).session(session)
			);
			if (updatedParentCategoriesError) {
				handleTransactionError(session);
				return next(updatedParentCategoriesError);
			}
		}
	}

	// Merge the request body data into the existing category object
	category = Object.assign(category, {
		...(req.body?.name && { name: req.body.name }),
		...(req.body?.description && { description: req.body.description }),
		...(isParentPresentedInTheRequest && { parent: req.body?.parent || [] }),
		...(createdAttachment && createdAttachment?.[0]?._id && { icon: createdAttachment[0]._id }),
	});

	// Save the updated category object to the database, and if there is an error during saving,
	// pass the error to the next middleware
	const [saveError, newCategory] = await to(category.save({ session }));
	if (saveError) {
		handleTransactionError(session);
		return next(saveError);
	}

	// Commit the transaction
	await session.commitTransaction();
	session.endSession();

	// Flash success message and return the updated category data in the response
	req.flash("success", "successfully updated.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: newCategory },
			flashes: req.flash(),
		})
	);
};

/**
 * @openapi
 * /v1/categories/{category}:
 *   delete:
 *     summary: Deletes a single category.
 *     description: Soft-deletes a category. Admin/SuperAdmin only.
 *     tags:
 *       - Categories
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: category
 *         required: true
 *         schema:
 *           type: string
 *         description: Category ID or slug.
 *     responses:
 *       "200":
 *         description: Category deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 flashes:
 *                   type: object
 *       "401":
 *         description: Unauthorized.
 *       "404":
 *         description: Category not found.
 *       "500":
 *         description: Internal Server Error.
 */
export const deleteSingleCategory = async (
	req: Request<{ category: string }, FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Check if user logged in
	if (
		req.isUnauthenticated() ||
		!req.user ||
		![vars.auth.roles.superAdmin, vars.auth.roles.admin].includes(req.user.role)
	) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	// Extract the category identifier from request parameters
	const { category: categoryIdentifier } = req.params || {};

	// Attempt to find the category by its ID or slug, and if there is an error or no category is found,
	// pass the error to the next middleware
	const [categoryError, category] = await to(
		Category.findOne({
			$or: [
				{ slug: categoryIdentifier },
				...(isMongoId(categoryIdentifier) ? [{ _id: categoryIdentifier }] : []),
			],
		})
	);
	if (categoryError) return next(categoryError);
	if (!category) return next();

	// Attempt to soft-delete the found category, and if there is an error during the deletion,
	// pass the error to the next middleware
	const [deleteCategoryError] = await to(Category.deleteById(category._id, req.user._id));
	if (deleteCategoryError) return next(deleteCategoryError);

	// Flash success message and respond with success status
	req.flash("success", "Successfully Deleted.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			flashes: req.flash(),
		})
	);
};

/**
 * @openapi
 * /v1/categories/{category}/restore:
 *   patch:
 *     summary: Restores a single category.
 *     description: Restores a soft-deleted category. SuperAdmin only.
 *     tags:
 *       - Categories
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: category
 *         required: true
 *         schema:
 *           type: string
 *         description: Category ID or slug.
 *     responses:
 *       "200":
 *         description: Category restored successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 flashes:
 *                   type: object
 *       "401":
 *         description: Unauthorized.
 *       "404":
 *         description: Category not found.
 *       "500":
 *         description: Internal Server Error.
 */
export const restoreSingleCategory = async (
	req: Request<{ category: string }, FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Extract the category identifier from request parameters
	const { category: categoryIdentifier } = req.params || {};

	// Create a query to find the category by its ID or slug
	const singleCategoryQuery = {
		$or: [
			{ slug: categoryIdentifier }, // search by slug
			...(isMongoId(categoryIdentifier) ? [{ _id: categoryIdentifier }] : []), // search by ID
		],
		deleted: true, // only find soft-deleted countries
	};

	// Attempt to find the category by its ID or slug, and if there is an error or no category is found,
	// pass the error to the next middleware
	const [categoryError, category] = await to(Category.findOneWithDeleted(singleCategoryQuery));
	if (categoryError || !category) return next(categoryError);

	// Attempt to restore the found category, and if there is an error during the restoration,
	// pass the error to the next middleware
	const [restoreCategoryError] = await to(Category.restore(singleCategoryQuery));
	if (restoreCategoryError) return next(restoreCategoryError);

	// Flash success message and respond with success status
	req.flash("success", "Successfully Restored.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};
