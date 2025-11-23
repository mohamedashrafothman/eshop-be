import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body, ValidationChain } from "express-validator";
import createError from "http-errors";
import httpStatus, { HttpStatus } from "http-status";
import mongoose, { ClientSession, PaginateOptions } from "mongoose";
import multer, { FileFilterCallback } from "multer";
import IPaymentMethod, { PAYMENT_METHODS } from "../interfaces/PaymentMethod.interface";
import Attachment, { IAttachmentDocument } from "../models/Attachment";
import PaymentMethod, { IPaymentMethodDocument } from "../models/PaymentMethod";
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
				body("method")
					.trim()
					.escape()
					.notEmpty()
					.withMessage("Method is required!")
					.custom((method: IPaymentMethod["method"]) => {
						if (!PAYMENT_METHODS.includes(method))
							throw new Error(`Invalid method: ${method}`);
						return true;
					}),
				body("description")
					.trim()
					.escape()
					.notEmpty()
					.withMessage("Description is required!")
					.isLength({ max: 1000 })
					.withMessage("Description must be at most 1000 characters long!"),
				body("icon").notEmpty().withMessage("You must add an icon!"),
			];
		case "update":
			return [
				body("method")
					.optional()
					.trim()
					.escape()
					.notEmpty()
					.withMessage("Method is required!")
					.custom((method: IPaymentMethod["method"]) => {
						if (!PAYMENT_METHODS.includes(method))
							throw new Error(`Invalid method: ${method}`);
						return true;
					}),
				body("description")
					.optional()
					.trim()
					.escape()
					.notEmpty()
					.withMessage("Description is required!")
					.isLength({ max: 1000 })
					.withMessage("Description must be at most 1000 characters long!"),
				body("icon").optional().notEmpty().withMessage("You must add an icon!"),
			];
		default:
			return [];
	}
};

/**
 * @summary Uploads a payment method icon image.
 * @description Handles the uploading of a payment method's icon image.
 * The image is validated to be of type "image", and the upload is restricted to files
 * with a maximum size defined in the configuration.
 * The uploaded image is resized to be square, and the quality is set to 50%.
 * The file name is hashed to ensure uniqueness.
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
export const uploadPaymentMethodIcon = async (
	req: Request,
	res: Response,
	next: NextFunction
): Promise<void> => {
	const storageEngine = new StorageEngine({
		accept: ["image"],
		square: true,
		quality: 50,
		fileHashName: true,
		uploadPath: `${vars.storage.uploadPath}/payment-methods`,
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
 * /v1/payment-methods:
 *   post:
 *     summary: Create a new payment method
 *     description: Creates a new payment method with an icon. Admin/SuperAdmin only.
 *     tags: [Payment-Methods]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - method
 *               - description
 *               - icon
 *             properties:
 *               method:
 *                 type: string
 *                 description: Name of the payment method
 *                 enum: [card, cash]
 *                 example: card
 *               description:
 *                 type: string
 *                 description: Description of the payment method
 *                 example: Credit or debit card payment
 *               icon:
 *                 type: string
 *                 format: binary
 *                 description: Icon image file
 *     responses:
 *       201:
 *         description: Payment method created successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     entities:
 *                       type: object
 *                       properties:
 *                         data:
 *                           $ref: '#/components/schemas/Payment-Methods'
 *                         flashes:
 *                           $ref: '#/components/schemas/Flash'
 *       400:
 *         description: Bad Request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       422:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const postNewPaymentMethod = async (
	req: Request<
		{},
		FormatResponseObjectType<IPaymentMethodDocument, HttpStatus["CREATED"]>,
		Pick<IPaymentMethod, "method" | "description"> & { icon?: Express.Multer.File }
	>,
	res: Response<FormatResponseObjectType<IPaymentMethodDocument, HttpStatus["CREATED"]>>,
	next: NextFunction
): Promise<void> => {
	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	// Create variables to hold the created payment method and attachment
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

	// Create a new payment method from the request body data, and if there was an error,
	// return the error and end the request
	const [createdPaymentMethodError, createdPaymentMethod] = await to(
		PaymentMethod.create(
			[
				{
					method: req.body.method,
					...(req.body?.description && { description: req.body.description }),
					...(createdAttachment &&
						createdAttachment?.[0]?._id && { icon: createdAttachment[0]._id }),
				},
			],
			{ session }
		)
	);
	if (createdPaymentMethodError) {
		handleTransactionError(session);
		return next(createdPaymentMethodError);
	}

	// Commit the transaction
	await session.commitTransaction();
	session.endSession();

	// Set a flash message to indicate that the payment method was created successfully,
	// and return the created payment method in the response
	req.flash("success", "Payment method created successfully.");
	res.status(httpStatus.CREATED).json(
		formatResponseObject({
			status: httpStatus.CREATED,
			entities: { data: createdPaymentMethod[0] },
			flashes: req.flash(),
		})
	);
};

/**
 * @openapi
 * /v1/payment-methods:
 *   get:
 *     summary: Get a list of payment methods
 *     description: Retrieves a paginated list of payment methods. Supports filtering by search term (q) and deleted status (admin only).
 *     tags: [Payment-Methods]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *         description: Sort field
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search term (matches method, description)
 *       - in: query
 *         name: deleted
 *         schema:
 *           type: boolean
 *         description: Include deleted payment methods (Admin/SuperAdmin only)
 *     responses:
 *       200:
 *         description: List of payment methods retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     entities:
 *                       type: object
 *                       properties:
 *                         data:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/Payment-Methods'
 *                         meta:
 *                           $ref: '#/components/schemas/Meta'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const getPaymentMethods = async (
	req: Request<
		{},
		FormatResponseObjectType<IPaymentMethodDocument, HttpStatus["OK"]>,
		{},
		Partial<
			Pick<PaginateOptions, "sort" | "page" | "limit" | "offset" | "pagination"> & {
				q?: string;
				deleted?: boolean | number;
			}
		>
	>,
	res: Response<FormatResponseObjectType<IPaymentMethodDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Destructure the query parameters (req.query) into
	// q (search term), deleted (include deleted payment methods) and query (pagination & sorting options)
	const { q, deleted } = req.query || {};

	// Check if the query includes a deleted flag
	const isFilterByDeletedAllowed: boolean =
		"deleted" in req.query &&
		Boolean(
			req.user &&
				req.user.role &&
				[vars.auth.roles.superAdmin, vars.auth.roles.admin].includes(req.user.role)
		);

	// List of fields to search for the query term
	const querySearchFields: string[] = ["method", "description"];

	// List of sort options
	const sort: SortItemType<"method" | "createdAt">[] = [
		{ name: "Method A-Z", value: { method: 1 } },
		{ name: "Method Z-A", value: { method: -1 } },
		{ name: "Created Date Ascending", value: { createdAt: 1 } },
		{ name: "Created Date Descending", value: { createdAt: -1 } },
	];

	// Attempt to retrieve the payment methods using the given query and pagination options,
	// and if there was an error, return the error and end the request
	const [paginatedPaymentMethodsError, paginatedPaymentMethods] = await to(
		PaymentMethod.paginate<IPaymentMethodDocument>(
			{
				// If the query includes a search term, filter payment methods by method or description
				...((q && {
					$or: querySearchFields.map((item) => ({
						[item]: { $regex: String(q).toLowerCase() || "", $options: "i" },
					})),
				}) ||
					{}),
				// If the query includes a deleted flag, include deleted payment methods
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
	if (paginatedPaymentMethodsError) return next(paginatedPaymentMethodsError);

	// Destructure the paginated payment methods into the list of payment methods (docs) and pagination metadata
	const { docs, ...pagination } = paginatedPaymentMethods;

	// Return the list of payment methods, pagination metadata, and sort options in the response
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
 * @openapi
 * /v1/payment-methods/{method}:
 *   get:
 *     summary: Get a single payment method
 *     description: Retrieves a single payment method by its ID. Admin/SuperAdmin only.
 *     tags: [Payment-Methods]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: method
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment Method ID
 *         example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: Payment method retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     entities:
 *                       type: object
 *                       properties:
 *                         data:
 *                           $ref: '#/components/schemas/Payment-Methods'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       404:
 *         description: Payment method not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const getSinglePaymentMethod = async (
	req: Request<
		{ method: string },
		FormatResponseObjectType<IPaymentMethodDocument, HttpStatus["OK"]>
	>,
	res: Response<FormatResponseObjectType<IPaymentMethodDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Retrieve the payment method ID from the request parameters
	const { method: paymentMethodIdentifier } = req.params || {};

	// Attempt to retrieve a payment method from the database with the given ID,
	// and if there was an error or no payment method was found, return the error and end the request
	const [paymentMethodError, paymentMethod] = await to(
		PaymentMethod.findOneWithDeleted({ _id: paymentMethodIdentifier })
	);
	if (paymentMethodError || !paymentMethod) return next(paymentMethodError);

	// Return the retrieved payment method in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, entities: { data: paymentMethod } })
	);
};

/**
 * @openapi
 * /v1/payment-methods/{method}:
 *   patch:
 *     summary: Update a single payment method
 *     description: Updates a payment method's details and icon. Admin/SuperAdmin only.
 *     tags: [Payment-Methods]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: method
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment Method ID
 *         example: 507f1f77bcf86cd799439011
 *     requestBody:
 *       required: false
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               method:
 *                 type: string
 *                 description: Name of the payment method
 *                 enum: [card, cash]
 *               description:
 *                 type: string
 *                 description: Description of the payment method
 *               icon:
 *                 type: string
 *                 format: binary
 *                 description: Icon image file
 *     responses:
 *       200:
 *         description: Payment method updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     entities:
 *                       type: object
 *                       properties:
 *                         data:
 *                           $ref: '#/components/schemas/Payment-Methods'
 *                         flashes:
 *                           $ref: '#/components/schemas/Flash'
 *       400:
 *         description: Bad Request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       404:
 *         description: Payment method not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       422:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const updateSinglePaymentMethod = async (
	req: Request<
		{ method: string },
		FormatResponseObjectType<IPaymentMethodDocument, HttpStatus["OK"]>,
		Partial<Pick<IPaymentMethod, "method" | "description">> & { icon?: Express.Multer.File }
	>,
	res: Response<FormatResponseObjectType<IPaymentMethodDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	// Extract payment method identifier from request parameters
	const { method: paymentMethodIdentifier } = req.params || {};

	// Attempt to find the payment method by ID, and if there is an error or no payment method is found,
	// pass the error to the next middleware
	let [paymentMethodError, paymentMethod] = await to(
		PaymentMethod.findOneWithDeleted({ _id: paymentMethodIdentifier }).session(session)
	);
	if (paymentMethodError || !paymentMethod) {
		handleTransactionError(session);
		return next(paymentMethodError);
	}

	// Create variables to hold the created payment method and attachment
	let createdAttachmentError: Error | null = null;
	let createdAttachment: IAttachmentDocument[] | undefined;

	// Check if icon exists in the request body.
	if (req.body?.icon) {
		// Find the attachment associated with the paymentMethod
		const [paymentMethodAttachmentError, paymentMethodAttachment] = await to(
			Attachment.findOne({ _id: paymentMethod.icon?._id || paymentMethod.icon }).session(
				session
			)
		);
		if (paymentMethodAttachmentError) {
			handleTransactionError(session);
			return next(paymentMethodAttachmentError);
		}

		// If the attachment exists, delete it, and delete the file from disk
		if (paymentMethodAttachment?._id) {
			const [deletedPaymentMethodAttachmentError] = await to(
				Attachment.deleteOne({ _id: paymentMethodAttachment._id }).session(session)
			);
			if (deletedPaymentMethodAttachmentError) {
				handleTransactionError(session);
				return next(deletedPaymentMethodAttachmentError);
			}

			// delete file from disk if it exists
			const [deleteFileFromDiskError] = await to(
				deleteFileFromDisk(paymentMethodAttachment.path)
			);
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

	// Merge the request body data into the existing payment method object
	paymentMethod = Object.assign(paymentMethod, {
		...(req.body?.method && { method: req.body.method }),
		...(req.body?.description && { description: req.body.description }),
		...(createdAttachment?.[0]?._id ? { icon: createdAttachment[0]._id } : {}),
	});

	// Save the updated payment method object to the database, and if there is an error during saving,
	// pass the error to the next middleware
	const [saveError, newPaymentMethod] = await to(paymentMethod.save({ session }));
	if (saveError) {
		handleTransactionError(session);
		return next(saveError);
	}

	// Commit the transaction
	await session.commitTransaction();
	session.endSession();

	// Flash success message and return the updated payment method data in the response
	req.flash("success", "Successfully updated.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: newPaymentMethod },
			flashes: req.flash(),
		})
	);
};

/**
 * @openapi
 * /v1/payment-methods/{method}:
 *   delete:
 *     summary: Delete a single payment method
 *     description: Soft deletes a single payment method by its ID. Admin/SuperAdmin only.
 *     tags: [Payment-Methods]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: method
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment Method ID
 *         example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: Payment method deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     flashes:
 *                       $ref: '#/components/schemas/Flash'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       404:
 *         description: Payment method not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const deleteSinglePaymentMethod = async (
	req: Request<{ method: string }, FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
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

	// Extract the payment method identifier from request parameters
	const { method: paymentMethodIdentifier } = req.params || {};

	// Attempt to find the payment method by its ID, and if there is an error or no payment method is found,
	// pass the error to the next middleware
	const [paymentMethodError, paymentMethod] = await to(
		PaymentMethod.findOne({ _id: paymentMethodIdentifier })
	);
	if (paymentMethodError || !paymentMethod) return next(paymentMethodError);

	// Attempt to soft-delete the found payment method, and if there is an error during the deletion,
	// pass the error to the next middleware
	const [deletePaymentMethodError] = await to(
		PaymentMethod.deleteById(paymentMethod._id, req.user._id)
	);
	if (deletePaymentMethodError) return next(deletePaymentMethodError);

	// Flash success message and respond with success status
	req.flash("success", "Successfully Deleted.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};

/**
 * @openapi
 * /v1/payment-methods/{method}/restore:
 *   patch:
 *     summary: Restore a single payment method
 *     description: Restores a soft-deleted payment method by its ID. Admin/SuperAdmin only.
 *     tags: [Payment-Methods]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: method
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment Method ID
 *         example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: Payment method restored successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     flashes:
 *                       $ref: '#/components/schemas/Flash'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       404:
 *         description: Payment method not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const restoreSinglePaymentMethod = async (
	req: Request<{ method: string }, FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Extract the payment method identifier from request parameters
	const { method: paymentMethodIdentifier } = req.params || {};

	// Create a query to find the payment method by its ID
	const singlePaymentMethodQuery = {
		_id: paymentMethodIdentifier, // find the payment method by its ID
		deleted: true, // only find soft-deleted countries
	};

	// Attempt to find the payment method by its ID, and if there is an error or no payment method is found,
	// pass the error to the next middleware
	const [paymentMethodError, paymentMethod] = await to(
		PaymentMethod.findOneWithDeleted(singlePaymentMethodQuery)
	);
	if (paymentMethodError || !paymentMethod) return next(paymentMethodError);

	// Attempt to restore the found payment method, and if there is an error during the restoration,
	// pass the error to the next middleware
	const [restorePaymentMethodError] = await to(PaymentMethod.restore(singlePaymentMethodQuery));
	if (restorePaymentMethodError) return next(restorePaymentMethodError);

	// Flash success message and respond with success status
	req.flash("success", "Successfully Restored.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};
