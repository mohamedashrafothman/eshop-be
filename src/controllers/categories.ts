import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body, ValidationChain } from "express-validator";
import httpStatus from "http-status";
import mongoose, { ClientSession } from "mongoose";
import multer, { FileFilterCallback } from "multer";
import isMongoId from "validator/lib/isMongoId";
import Attachment, { IAttachmentDocument } from "../models/Attachment";
import Category from "../models/Category";
import StorageEngine from "../services/storage";
import {
	deleteFileFromDisk,
	formatResponseObject,
	handleFileToUpload,
	handleTransactionError,
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
 * Optionally uploads and attaches a icon image if provided in the request. If a icon image is provided,
 * it will be uploaded and linked to the category. The category is then saved to the database.
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
export const postNewCategory = async (req: Request, res: Response, next: NextFunction) => {
	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	let createdAttachmentError: Error | null = null;
	let createdAttachment: IAttachmentDocument[] | undefined;
	if (req.body?.icon) {
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

	const [createdCategoryError, createdCategory] = await to(
		Category.create(
			[
				{
					...(req.body || {}),
					...(createdAttachment?.[0]?._id ? { icon: createdAttachment[0]._id } : {}),
				},
			],
			{ session }
		)
	);
	if (createdCategoryError) {
		handleTransactionError(session);
		return next(createdCategoryError);
	}

	if (req.body?.parent && createdCategory?.[0]?._id) {
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
 * description, and deletion status. Also includes pagination and sorting options.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.query - The query parameters for filtering and pagination.
 * @param {String} [req.query.q] - Search term for filtering categories by name or description.
 * @param {Boolean} [req.query.deleted] - Flag to include deleted categories.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with paginated categories and metadata.
 *   * @property {Array} entities.data - List of retrieved brand objects.
 *   * @property {Object} entities.meta.pagination - Pagination metadata (total docs, page, etc.).
 *   * @property {Array} entities.meta.sort - Available sort options for the categories.
 * @throws {Error} 500 - Returns an error if the brand retrieval fails.
 */
export const getCategories = async (req: Request, res: Response, next: NextFunction) => {
	const { q, deleted, ...query } = req.query || {};
	const isFilterByDeletedAllowed = "deleted" in req.query;
	const querySearchFields = ["name", "description"];
	const sort = [
		{ name: "Name A-Z", value: { name: 1 } },
		{ name: "Name Z-A", value: { name: -1 } },
		{ name: "Created Date Ascending", value: { createdAt: 1 } },
		{ name: "Created Date Descending", value: { createdAt: -1 } },
	];

	const [paginatedCategoriesError, paginatedCategories] = await to(
		Category.paginate(
			{
				...((q && {
					$or: querySearchFields.map((item) => ({
						[item]: { $regex: String(q).toLowerCase() || "", $options: "i" },
					})),
				}) ||
					{}),
				...(([vars.auth.roles.superAdmin, vars.auth.roles.admin].includes(
					req.user?.role || ""
				) &&
					isFilterByDeletedAllowed && { deleted: Boolean(deleted) }) ||
					{}),
				parent: { $size: 0 },
			},
			{ ...query }
		)
	);
	if (paginatedCategoriesError) return next(paginatedCategoriesError);

	const { docs, ...pagination } = paginatedCategories;

	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: {
				data: [...(docs || [])],
				meta: { pagination, sort },
			},
		})
	);
};

/**
 * @summary Retrieves a single category by identifier.
 * @description Fetches a category based on the provided identifier, which can be either
 * a slug or an ObjectId. Handles errors and returns the category data if found.
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
export const getSingleCategory = async (req: Request, res: Response, next: NextFunction) => {
	const { category: categoryIdentifier } = req.params || {};
	const [categoryError, category] = await to(
		Category.findOneWithDeleted({
			$or: [
				{ slug: categoryIdentifier },
				...(isMongoId(categoryIdentifier) ? [{ _id: categoryIdentifier }] : []),
			],
		})
	);
	if (categoryError) return next(categoryError);
	if (!category) return next();

	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, entities: { data: category } })
	);
};

/**
 * @summary Updates a single category by identifier.
 * @description Updates a category based on the provided identifier, which can be a slug or an ObjectId.
 * Handles icon updates by replacing existing icons and manages file deletions. Returns the updated
 * category data upon success.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.params - URL parameters for the request.
 * @param {String} req.params.category - The category identifier, either a slug or an ObjectId.
 * @param {Object} req.body - The data to update the category with.
 * @param {Object} [req.body.icon] - Optional icon data to update the category's icon.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with the updated category data.
 *   * @property {Object} entities.data - The updated category object.
 *   * @property {String} flashes.success - Success message after the update.
 * @throws {Error} 500 - Returns an error if any issue occurs during the update process.
 * @throws {Error} 404 - Returns an error if the category is not found.
 */
export const updateSingleCategory = async (req: Request, res: Response, next: NextFunction) => {
	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	const { category: categoryIdentifier } = req.params || {};
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

	let createdAttachmentError: Error | null = null;
	let createdAttachment: IAttachmentDocument[] | undefined;
	if (req.body?.icon) {
		const [categoryAttachmentError, categoryAttachment] = await to(
			Attachment.findOne({ _id: category?.icon?._id || category?.icon }).session(session)
		);
		if (categoryAttachmentError) {
			handleTransactionError(session);
			return next(categoryAttachmentError);
		}

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

	category = Object.assign(category, {
		...(req?.body || {}),
		...(createdAttachment?.[0]?._id ? { icon: createdAttachment[0]._id } : {}),
	});
	if (!category) {
		handleTransactionError(session);
		return next();
	}

	const [saveError, newCategory] = await to(category.save({ session }));
	if (saveError) {
		handleTransactionError(session);
		return next(saveError);
	}

	// Commit the transaction
	await session.commitTransaction();
	session.endSession();

	req.flash("success", "successfully updated.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: { ...(newCategory?.toJSON() || {}) } },
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Deletes a single category by identifier.
 * @description Deletes a category based on the provided identifier, which can be a slug or an ObjectId.
 * Upon successful deletion, returns a success message.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.params - URL parameters for the request.
 * @param {String} req.params.category - The category identifier, either a slug or an ObjectId.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with a flash message.
 *   * @property {String} flashes.success - Success message indicating the category was successfully deleted.
 * @throws {Error} 500 - Returns an error if any issue occurs during the deletion process.
 * @throws {Error} 404 - Returns an error if the category is not found.
 */
export const deleteSingleCategory = async (req: Request, res: Response, next: NextFunction) => {
	const { category: categoryIdentifier } = req.params || {};
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

	const [deleteCategoryError] = await to(Category.deleteById(category._id, req?.user?._id));
	if (deleteCategoryError) return next(deleteCategoryError);

	req.flash("success", "Successfully Deleted.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Restores a single category by identifier.
 * @description Restores a category that has been soft-deleted, based on the provided identifier,
 * which can be a slug or an ObjectId. Upon successful restoration, returns a success message.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.params - URL parameters for the request.
 * @param {String} req.params.category - The category identifier, either a slug or an ObjectId.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with a flash message.
 *   * @property {String} flashes.success - Success message indicating the category was successfully restored.
 * @throws {Error} 500 - Returns an error if any issue occurs during the restoration process.
 * @throws {Error} 404 - Returns an error if the category is not found or if the category was not soft-deleted.
 */
export const restoreSingleCategory = async (req: Request, res: Response, next: NextFunction) => {
	const { category: categoryIdentifier } = req.params || {};
	const singleCategoryQuery = {
		$or: [
			{ slug: categoryIdentifier },
			...(isMongoId(categoryIdentifier) ? [{ _id: categoryIdentifier }] : []),
		],
		deleted: true,
	};

	const [categoryError, category] = await to(Category.findOneWithDeleted(singleCategoryQuery));
	if (categoryError) return next(categoryError);
	if (!category) return next();

	const [restoreCategoryError] = await to(Category.restore(singleCategoryQuery));
	if (restoreCategoryError) return next(restoreCategoryError);

	req.flash("success", "Successfully Restored.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};
