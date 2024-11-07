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
 * @summary Creates a new payment method.
 * @description Handles the creation of a new payment method in the system.
 * Optionally uploads and attaches a icon image if provided in the request.
 * If a icon image is provided, it will be uploaded and linked to the payment method.
 * The payment method is then saved to the database. A success message is set upon successful creation.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.body - The data for creating a new payment method. Optionally includes a `icon` file for payment method image.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {void} 201 - Success response with the newly created payment method data.
 *   * @property {Object} entities.data - The created payment method object.
 *   * @property {Array} flashes - Success message for payment method creation.
 * @throws {Error} 500 - Returns an error if the payment method or icon creation fails.
 */
export const postNewPaymentMethod = async (
	req: Request<
		{},
		FormatResponseObjectType<IPaymentMethodDocument, HttpStatus["CREATED"]>,
		Omit<IPaymentMethod, "icon"> & { icon?: Express.Multer.File }
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
					...(createdAttachment?.length && createdAttachment[0]?._id
						? { icon: createdAttachment[0]._id }
						: {}),
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
 * @summary Retrieves a paginated list of payment methods.
 * @description Fetches payment methods from the database based on query parameters.
 * Supports filtering by method name or description, and includes options for pagination
 * and sorting. Deleted payment methods can also be included if specified in the query.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.query - Query parameters for filtering and pagination.
 * @param {String} [req.query.sort] - The field to sort by.
 * @param {Number} [req.query.page] - The page number to retrieve.
 * @param {Number} [req.query.limit] - The number of payment methods to retrieve per page.
 * @param {String} [req.query.offset] - The number of payment methods to skip.
 * @param {String} [req.query.pagination] - Enable or disable pagination.
 * @param {String} [req.query.q] - Search term for filtering payment methods by method or description.
 * @param {Boolean} [req.query.deleted] - Flag to include deleted payment methods.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with a list of payment methods, pagination metadata, and sort options.
 * @throws {Error} 500 - Returns an error if any issue occurs during the retrieval process.
 */
export const getPaymentMethods = async (
	req: Request<
		{},
		FormatResponseObjectType<IPaymentMethodDocument, HttpStatus["OK"]>,
		{},
		Pick<PaginateOptions, "sort" | "page" | "limit" | "offset" | "pagination"> & {
			q?: string;
			deleted?: boolean | number;
		}
	>,
	res: Response<FormatResponseObjectType<IPaymentMethodDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Destructure the query parameters (req.query) into
	// q (search term), deleted (include deleted payment methods) and query (pagination & sorting options)
	const { q, deleted } = req.query || {};

	// Check if the query includes a deleted flag
	const isFilterByDeletedAllowed: boolean = "deleted" in req.query;

	// List of fields to search for the query term
	const querySearchFields: string[] = ["method", "description"];

	// List of sort options
	const sort: { name: string; value: object }[] = [
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
				...("page" in req.query && { page: req.query.page }),
				...("limit" in req.query && { limit: req.query.limit }),
				...("offset" in req.query && { offset: req.query.offset }),
				...("pagination" in req.query && { pagination: req.query.pagination }),
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
 * @summary Retrieves a single payment method by ID.
 * @description Fetches a single payment method from the database with the given ID,
 * and if there was an error or no payment method was found, returns the error and ends the request.
 *
 * @param {Object} req - Express request object containing the payment method ID in the parameters.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with the retrieved payment method.
 * @throws {Error} 404 - Returns an error if the payment method was not found.
 * @throws {Error} 500 - Returns an error if any other issue occurs during the retrieval process.
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
 * @summary Updates a single payment method by ID.
 * @description Updates a single payment method in the database with the given ID,
 * and if there was an error or no payment method was found, returns the error and ends the request.
 * If the request body contains an icon file, it will be uploaded and linked to the payment method.
 * The payment method is then saved to the database. A success message is set upon successful update.
 *
 * @param {Object} req - Express request object containing the payment method ID in the parameters,
 * and the updated payment method data in the request body.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with the updated payment method data.
 * @throws {Error} 404 - Returns an error if the payment method was not found.
 * @throws {Error} 500 - Returns an error if any other issue occurs during the update process.
 */
export const updateSinglePaymentMethod = async (
	req: Request<
		{ method: string },
		FormatResponseObjectType<IPaymentMethodDocument, HttpStatus["OK"]>,
		Partial<Omit<IPaymentMethod, "icon">> & { icon?: Express.Multer.File }
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
			deleteFileFromDisk(paymentMethodAttachment.path);
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
 * @summary Deletes a single payment method.
 * @description This function retrieves a payment method by its ID and if found, soft-deletes the payment method.
 * If the payment method is not found, it returns a 404 error. If there is an error during the deletion,
 * it passes the error to the next middleware.
 *
 * @param {Request} req - Express request object containing the payment method ID in the parameters.
 * @param {Response} res - Express response object.
 * @param {NextFunction} next - Express next middleware function to handle errors.
 *
 * @returns {void} 200 - Success response with a success message.
 * @throws {Error} 404 - Returns an error if the payment method is not found.
 * @throws {Error} - Returns an error if there is an issue during the deletion process.
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
 * @summary Restores a single soft-deleted payment method.
 * @description This function retrieves a soft-deleted payment method by its ID and if found, restores the payment method.
 * If the payment method is not found, it returns a 404 error. If there is an error during the restoration,
 * it passes the error to the next middleware.
 *
 * @param {Request} req - Express request object containing the payment method ID in the parameters.
 * @param {Response} res - Express response object.
 * @param {NextFunction} next - Express next middleware function to handle errors.
 *
 * @returns {void} 200 - Success response with a success message.
 * @throws {Error} 404 - Returns an error if the payment method is not found.
 * @throws {Error} - Returns an error if there is an issue during the restoration process.
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
