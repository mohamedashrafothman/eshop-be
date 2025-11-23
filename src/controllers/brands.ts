import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body, ValidationChain } from "express-validator";
import createError from "http-errors";
import httpStatus, { HttpStatus } from "http-status";
import mongoose, { ClientSession, PaginateOptions } from "mongoose";
import multer, { FileFilterCallback } from "multer";
import isMongoId from "validator/lib/isMongoId";
import IBrand from "../interfaces/Brand.interface";
import Attachment, { IAttachmentDocument } from "../models/Attachment";
import Brand, { IBrandDocument } from "../models/Brand";
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
					.optional()
					.notEmpty()
					.withMessage("You must supply a description!")
					.isLength({ max: 1000 })
					.withMessage("Description must be at most 1000 characters long!"),
				body("logo").notEmpty().withMessage("You must add an logo!"),
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
					.withMessage("Name must be at most 100 characters long!"),
				body("logo").optional().notEmpty().withMessage("Logo can't be empty!"),
			];
		default:
			return [];
	}
};

/**
 * @summary Uploads a brand logo image.
 * @description Handles the uploading of a brand's logo image. The image is validated to be of type "image", and the upload is restricted to files with a maximum size defined in the configuration.
 * The uploaded image is resized to be square, and the quality is set to 50%. The file name is hashed to ensure uniqueness.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.file - The uploaded file object containing details about the logo image.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response indicating the logo was uploaded successfully.
 *   * @property {Object} req.body.logo - The uploaded logo file data.
 *   * @throws {Error} 400 - Returns an error if the file type is invalid or the file size exceeds the limit.
 */
export const uploadBrandLogo = async (
	req: Request,
	res: Response,
	next: NextFunction
): Promise<void> => {
	const storageEngine = new StorageEngine({
		accept: ["image"],
		square: true,
		quality: 50,
		fileHashName: true,
		uploadPath: `${vars.storage.uploadPath}/brands`,
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

	imageUpload.single("logo")(req, res, async (err) => {
		if (err) return next(err);
		if (req.file) req.body.logo = req.file;
		next();
	});
};

/**
 * @openapi
 * /v1/brands:
 *   post:
 *     summary: Creates a new brand.
 *     description: Creates a brand with name, description, and logo. Admin/SuperAdmin only.
 *     tags:
 *       - Brands
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
 *               - logo
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 maxLength: 1000
 *               logo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       "201":
 *         description: Brand created successfully.
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
 *                       $ref: '#/components/schemas/Brands'
 *                 flashes:
 *                   type: object
 *       "400":
 *         description: Invalid file or data.
 *       "401":
 *         description: Unauthorized.
 *       "500":
 *         description: Internal Server Error.
 */
export const postNewBrand = async (
	req: Request<
		{},
		FormatResponseObjectType<IBrandDocument, HttpStatus["CREATED"]>,
		Pick<IBrand, "name" | "description"> & { logo?: Express.Multer.File }
	>,
	res: Response<FormatResponseObjectType<IBrandDocument, HttpStatus["CREATED"]>>,
	next: NextFunction
): Promise<void> => {
	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	// create variables to hold the created brand and attachment
	let createdAttachmentError: Error | null = null;
	let createdAttachment: IAttachmentDocument[] | undefined;

	// Check if logo exists in the request body.
	if (req.body?.logo) {
		// Create a new attachment from the request body logo, and if there was an error,
		// return the error and end the request
		[createdAttachmentError, createdAttachment] = await to(
			Attachment.create(
				[
					handleFileToUpload(
						req.body.logo,
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

	// Create a new brand from the request body data, and if there was an error,
	// return the error and end the request
	const [createdBrandError, createdBrand] = await to(
		Brand.create(
			[
				{
					name: req.body.name,
					...(req.body.description ? { description: req.body.description } : {}),
					...(createdAttachment?.length &&
						createdAttachment[0]?._id && { logo: createdAttachment[0]._id }),
				},
			],
			{ session }
		)
	);
	if (createdBrandError) {
		handleTransactionError(session);
		return next(createdBrandError);
	}

	// Commit the transaction
	await session.commitTransaction();
	session.endSession();

	// Set a flash message to indicate that the brand was created successfully,
	// and return the created brand in the response
	req.flash("success", "Brand created successfully.");
	res.status(httpStatus.CREATED).json(
		formatResponseObject({
			status: httpStatus.CREATED,
			entities: { data: createdBrand[0] },
			flashes: req.flash(),
		})
	);
};

/**
 * @openapi
 * /v1/brands:
 *   get:
 *     summary: Retrieves a paginated list of brands.
 *     description: Fetches brands with filtering and pagination.
 *     tags:
 *       - Brands
 *     security:
 *       - bearerAuth: []
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
 *     responses:
 *       "200":
 *         description: List of brands.
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
 *                         $ref: '#/components/schemas/Brands'
 *                     meta:
 *                       type: object
 *                       properties:
 *                         pagination:
 *                           type: object
 *       "401":
 *         description: Unauthorized.
 *       "500":
 *         description: Internal Server Error.
 */
export const getBrands = async (
	req: Request<
		{},
		FormatResponseObjectType<IBrandDocument, HttpStatus["OK"]>,
		{},
		Partial<
			Pick<PaginateOptions, "sort" | "page" | "limit" | "offset" | "pagination"> & {
				q?: string;
				deleted?: boolean | number;
			}
		>
	>,
	res: Response<FormatResponseObjectType<IBrandDocument, HttpStatus["OK"]>>,
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

	// Attempt to retrieve the brands using the given query and pagination options,
	// and if there was an error, return the error and end the request
	const [paginatedBrandsError, paginatedBrands] = await to(
		Brand.paginate<IBrandDocument>(
			{
				// If the query includes a search term, filter brands by name or code
				...((q && {
					$or: querySearchFields.map((item) => ({
						[item]: { $regex: String(q).toLowerCase() || "", $options: "i" },
					})),
				}) ||
					{}),
				// If the query includes a deleted flag, include deleted brands
				...((isFilterByDeletedAllowed && { deleted: Boolean(deleted) }) || {}),
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
	if (paginatedBrandsError) return next(paginatedBrandsError);

	// Destructure the paginated brands into the list of brands (docs) and pagination metadata
	const { docs, ...pagination } = paginatedBrands;

	// Return the list of brands, pagination metadata, and sort options in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: [...(docs || [])], meta: { pagination, sort } },
		})
	);
};

/**
 * @openapi
 * /v1/brands/{brand}:
 *   get:
 *     summary: Retrieves a single brand.
 *     description: Fetches a brand by ID or slug. Admin/SuperAdmin only.
 *     tags:
 *       - Brands
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: brand
 *         required: true
 *         schema:
 *           type: string
 *         description: Brand ID or slug.
 *     responses:
 *       "200":
 *         description: Brand details.
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
 *                       $ref: '#/components/schemas/Brands'
 *       "401":
 *         description: Unauthorized.
 *       "404":
 *         description: Brand not found.
 *       "500":
 *         description: Internal Server Error.
 */
export const getSingleBrand = async (
	req: Request<{ brand: string }, FormatResponseObjectType<IBrandDocument, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<IBrandDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Retrieve the brand ID or slug from the request parameters
	const { brand: brandIdentifier } = req.params || {};

	// Attempt to retrieve a brand from the database with the given ID or slug,
	// and if there was an error or no brand was found, return the error and end the request
	const [brandError, brand] = await to(
		Brand.findOneWithDeleted({
			$or: [
				{ slug: brandIdentifier },
				...(isMongoId(brandIdentifier) ? [{ _id: brandIdentifier }] : []),
			],
		})
	);
	if (brandError || !brand) return next(brandError);

	// Return the retrieved brand in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, entities: { data: brand } })
	);
};

/**
 * @openapi
 * /v1/brands/{brand}:
 *   patch:
 *     summary: Updates a single brand.
 *     description: Updates brand details and logo. Admin/SuperAdmin only.
 *     tags:
 *       - Brands
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: brand
 *         required: true
 *         schema:
 *           type: string
 *         description: Brand ID or slug.
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
 *               logo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       "200":
 *         description: Brand updated successfully.
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
 *                       $ref: '#/components/schemas/Brands'
 *                 flashes:
 *                   type: object
 *       "401":
 *         description: Unauthorized.
 *       "404":
 *         description: Brand not found.
 *       "500":
 *         description: Internal Server Error.
 */
export const updateSingleBrand = async (
	req: Request<
		{ brand: string },
		FormatResponseObjectType<IBrandDocument, HttpStatus["OK"]>,
		Partial<Pick<IBrand, "name" | "description">> & { logo?: Express.Multer.File }
	>,
	res: Response<FormatResponseObjectType<IBrandDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	// Retrieve the brand ID or slug from the request parameters
	const { brand: brandIdentifier } = req.params || {};

	// Attempt to retrieve a brand from the database with the given ID or slug,
	// and if there was an error or no brand was found, return the error and end the request
	let [brandError, brand] = await to(
		Brand.findOneWithDeleted({
			$or: [
				{ slug: brandIdentifier },
				...(isMongoId(brandIdentifier) ? [{ _id: brandIdentifier }] : []),
			],
		}).session(session)
	);
	if (brandError || !brand) {
		handleTransactionError(session);
		return next(brandError);
	}

	// create variables to hold the created brand and attachment
	let createdAttachmentError: Error | null = null;
	let createdAttachment: IAttachmentDocument[] | undefined;
	// Check if logo exists in the request body.
	if (req.body?.logo) {
		// Find the attachment associated with the brand
		const [brandAttachmentError, brandAttachment] = await to(
			Attachment.findOne({ _id: brand?.logo }).session(session)
		);
		if (brandAttachmentError) {
			handleTransactionError(session);
			return next(brandAttachmentError);
		}

		// If the attachment exists, delete it, and delete the file from disk
		if (brandAttachment?._id) {
			const [deletedBrandAttachmentError] = await to(
				Attachment.deleteOne({ _id: brandAttachment._id }).session(session)
			);
			if (deletedBrandAttachmentError) {
				handleTransactionError(session);
				return next(deletedBrandAttachmentError);
			}

			// delete file from disk if it exists
			const [deleteFileFromDiskError] = await to(deleteFileFromDisk(brandAttachment.path));
			if (deleteFileFromDiskError) {
				handleTransactionError(session);
				return next(deleteFileFromDiskError);
			}
		}

		// Create a new attachment from the request body logo, and if there was an error,
		// return the error and end the request
		[createdAttachmentError, createdAttachment] = await to(
			Attachment.create(
				[
					handleFileToUpload(
						req.body.logo,
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

	// Merge the request body data into the existing brand object
	brand = Object.assign(brand, {
		...(req.body.name && { name: req.body.name }),
		...(req.body.description && { description: req.body.description }),
		...(createdAttachment && createdAttachment?.[0]?._id && { logo: createdAttachment[0]._id }),
	});

	// If the brand is not found, pass control to the next middleware
	if (!brand) {
		handleTransactionError(session);
		return next();
	}

	// Save the updated brand object to the database, and if there is an error during saving,
	// pass the error to the next middleware
	const [saveError, newBrand] = await to(brand.save({ session }));
	if (saveError) {
		handleTransactionError(session);
		return next(saveError);
	}

	// Commit the transaction
	await session.commitTransaction();
	session.endSession();

	// Flash success message and return the updated brand data in the response
	req.flash("success", "successfully updated.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: newBrand },
			flashes: req.flash(),
		})
	);
};

/**
 * @openapi
 * /v1/brands/{brand}:
 *   delete:
 *     summary: Deletes a single brand.
 *     description: Soft-deletes a brand. Admin/SuperAdmin only.
 *     tags:
 *       - Brands
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: brand
 *         required: true
 *         schema:
 *           type: string
 *         description: Brand ID or slug.
 *     responses:
 *       "200":
 *         description: Brand deleted successfully.
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
 *         description: Brand not found.
 *       "500":
 *         description: Internal Server Error.
 */
export const deleteSingleBrand = async (
	req: Request<{ brand: string }, FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	console.log("brand:", req.params);
	// Check if user logged in
	if (
		req.isUnauthenticated() ||
		!req.user ||
		![vars.auth.roles.superAdmin, vars.auth.roles.admin].includes(req.user.role)
	) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	// Extract the brand identifier from request parameters
	const { brand: brandIdentifier } = req.params || {};

	// Attempt to find the brand by its ID or slug, and if there is an error or no brand is found,
	// pass the error to the next middleware
	const [brandError, brand] = await to(
		Brand.findOne({
			$or: [
				{ slug: brandIdentifier },
				...(isMongoId(brandIdentifier) ? [{ _id: brandIdentifier }] : []),
			],
		})
	);
	if (brandError || !brand) return next(brandError);

	// Attempt to soft-delete the found brand, and if there is an error during the deletion,
	// pass the error to the next middleware
	const [deleteBrandError] = await to(Brand.deleteById(brand._id, req.user._id));
	if (deleteBrandError) return next(deleteBrandError);

	// Flash success message and respond with success status
	req.flash("success", "Successfully Deleted.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};

/**
 * @openapi
 * /v1/brands/{brand}/restore:
 *   patch:
 *     summary: Restores a single brand.
 *     description: Restores a soft-deleted brand. SuperAdmin only.
 *     tags:
 *       - Brands
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: brand
 *         required: true
 *         schema:
 *           type: string
 *         description: Brand ID or slug.
 *     responses:
 *       "200":
 *         description: Brand restored successfully.
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
 *         description: Brand not found.
 *       "500":
 *         description: Internal Server Error.
 */
export const restoreSingleBrand = async (
	req: Request<{ brand: string }, FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Extract the brand identifier from request parameters
	const { brand: brandIdentifier } = req.params || {};

	// Create a query to find the brand by its ID or slug
	const singleBrandQuery = {
		$or: [
			{ slug: brandIdentifier }, // search by slug
			...(isMongoId(brandIdentifier) ? [{ _id: brandIdentifier }] : []), // search by ID
		],
		deleted: true, // only find soft-deleted countries
	};

	// Attempt to find the brand by its ID or slug, and if there is an error or no brand is found,
	// pass the error to the next middleware
	const [brandError, brand] = await to(Brand.findOneWithDeleted(singleBrandQuery));
	if (brandError || !brand) return next(brandError);

	// Attempt to restore the found brand, and if there is an error during the restoration,
	// pass the error to the next middleware
	const [restoreBrandError] = await to(Brand.restore(singleBrandQuery));
	if (restoreBrandError) return next(restoreBrandError);

	// Flash success message and respond with success status
	req.flash("success", "Successfully Restored.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};
