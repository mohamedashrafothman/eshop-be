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
					.isMongoId()
					.withMessage("Invalid country id!")
					.notEmpty()
					.withMessage("You must supply a parent!"),
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
				body("parent")
					.optional()
					.isMongoId()
					.withMessage("Invalid country id!")
					.notEmpty()
					.withMessage("You must supply a parent!"),
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
 * @summary Creates a new category.
 * @description Handles the creation of a new category in the system.
 * Optionally uploads and attaches a icon image if provided in the request.
 * If a icon image is provided, it will be uploaded and linked to the category.
 * The category is then saved to the database. A success message is set upon successful creation.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.body - The data for creating a new category. Optionally includes a `icon` file for category image.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {void} 201 - Success response with the newly created category data.
 *   * @property {Object} entities.data - The created category object.
 *   * @property {Array} flashes - Success message for category creation.
 * @throws {Error} 500 - Returns an error if the category or icon creation fails.
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
					...(req.body.parent ? { parent: req.body.parent } : {}),
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
	if (req.body?.parent && createdCategory[0]?._id) {
		// Add the created category to the parent category's children
		// and if there was an error, return the error and end the request
		const [updatedParentCategoryError] = await to(
			Category.updateOne(
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
 * @summary Retrieves a paginated list of categories.
 * @description Fetches categories based on query parameters. Supports filtering by name,
 * description, and deletion status. Also includes pagination and sorting options. If the user is an
 * admin or super admin, deleted categories can also be included in the results.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.query - The query parameters for filtering and pagination.
 * @param {String} [req.query.sort] - The field to sort by.
 * @param {Number} [req.query.page] - The page number to retrieve.
 * @param {Number} [req.query.limit] - The number of categories to retrieve per page.
 * @param {String} [req.query.offset] - The number of categories to skip.
 * @param {String} [req.query.pagination] - Enable or disable pagination.
 * @param {String} [req.query.q] - Search term for filtering categories by name or description.
 * @param {Boolean} [req.query.deleted] - Flag to include deleted categories.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with paginated categories and metadata.
 *   * @property {Array} entities.data - List of retrieved category objects.
 *   * @property {Object} entities.meta.pagination - Pagination metadata (total docs, page, etc.).
 *   * @property {Array} entities.meta.sort - Available sort options for the categories.
 * @throws {Error} 500 - Returns an error if the category retrieval fails.
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
			}
		>
	>,
	res: Response<FormatResponseObjectType<ICategoryDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Check if user logged in
	if (req.isUnauthenticated() || !req.user) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	// Destructure the query parameters (req.query) into
	// q (search term), deleted (include deleted countries)
	const { q, deleted } = req.query || {};

	// Check if the query includes a deleted flag
	const isFilterByDeletedAllowed: boolean =
		"deleted" in req.query &&
		[vars.auth.roles.superAdmin, vars.auth.roles.admin].includes(req.user.role || "");

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
				parent: { $size: 0 },
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
 * @summary Retrieves a single category by identifier.
 * @description Fetches a category based on the provided identifier, which can be either a slug or an ObjectId.
 * Handles errors and returns the category data if found.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.params - URL parameters for the request.
 * @param {String} req.params.category - The category identifier, either a slug or an ObjectId.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with the category data.
 *   * @property {Object} entities.data - The retrieved category object.
 * @throws {Error} 500 - Returns an error if the category retrieval fails.
 * @throws {Error} 404 - Returns an error if no category is found.
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

	// Attempt to retrieve a category from the database with the given ID or slug,
	// and if there was an error or no category was found, return the error and end the request
	const [categoryError, category] = await to(
		Category.findOneWithDeleted({
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
 * @summary Updates an existing category by its identifier.
 * @description This endpoint updates a category's details, including its thumbnail, images, category, and category. The category can be identified by a slug or MongoDB ObjectId. If images or thumbnails are provided, the old ones are replaced. The method also updates related category and category associations if specified.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.params - URL parameters for the request.
 * @param {String} req.params.category - The category identifier, either a slug or an ObjectId.
 * @param {Object} req.body - The request body containing the category data.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with the updated category details.
 *    * @property {Object} entities - Contains the updated category data.
 *    * @property {Object} entities.data - The updated category.
 * @throws {Error} 500 - Internal server error if there's a problem updating the category.
 * @throws {Error} 404 - Category not found.
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
			deleteFileFromDisk(categoryAttachment.path);
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
	if (req.body?.parent) {
		// Find the category associated with the parent
		const [parentCategoryError, parentCategory] = await to(
			Category.findOne({ _id: req.body.parent }).session(session)
		);
		if (parentCategoryError || !parentCategory) {
			handleTransactionError(session);
			return next(parentCategoryError);
		}
	}

	// Merge the request body data into the existing category object
	category = Object.assign(category, {
		...(req.body?.name && { name: req.body.name }),
		...(req.body?.description && { description: req.body.description }),
		...(req.body?.parent && { parent: req.body.parent }),
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
 * @summary Deletes a single category by its ID or slug.
 * @description This method deletes a category from the database using the provided slug or MongoDB object ID.
 * The category is soft-deleted by marking it as deleted, ensuring it can be restored if needed.
 * The method handles errors and returns a success response when the deletion is successful.
 *
 * @param {Object} req - Express request object.
 * @param {String} req.params.category - The ID or slug of the category to delete.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response indicating the category was deleted.
 * @throws {Error} 404 - If no category is found with the provided identifier.
 * @throws {Error} 500 - If an error occurs during the deletion process.
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
 * @summary Restores a single category by its ID or slug.
 * @description This method restores a category that was previously soft-deleted from the database.
 * The method handles errors and returns a success response when the category is successfully restored.
 *
 * @param {Object} req - Express request object.
 * @param {String} req.params.category - The ID or slug of the category to restore.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response indicating the category was restored.
 * @throws {Error} 404 - If no category is found with the provided identifier.
 * @throws {Error} 500 - If an error occurs during the restore process.
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
