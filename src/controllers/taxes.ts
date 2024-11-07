import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body, ValidationChain } from "express-validator";
import createError from "http-errors";
import httpStatus, { HttpStatus } from "http-status";
import mongoose, { ClientSession, PaginateOptions } from "mongoose";
import isMongoId from "validator/lib/isMongoId";
import ITax from "../interfaces/Tax.interface";
import Tax, { ITaxDocument } from "../models/Tax";
import {
	formatResponseObject,
	FormatResponseObjectType,
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
					.optional()
					.notEmpty()
					.withMessage("You must supply a description!")
					.isLength({ max: 1000 }),
				body("rate")
					.isFloat({ min: 0 })
					.withMessage("Rate must be greater than or equal to 0!")
					.notEmpty()
					.withMessage("Rate is required!"),
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
					.isLength({ max: 1000 }),
				body("rate")
					.optional()
					.isFloat({ min: 0 })
					.withMessage("Rate must be greater than or equal to 0!")
					.notEmpty()
					.withMessage("Rate is required!"),
			];
		default:
			return [];
	}
};

/**
 * @summary Creates a new tax entry in the database.
 * @description Handles the creation of a new tax entity using the data provided in the request body.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.body - The payload containing details for the new tax entity.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {void} 201 - Success response with the created tax entity.
 *   * @property {Object} entities.data - The newly created tax entity.
 *   * @property {Array} flashes - Success message for tax creation.
 * @throws {Error} 500 - Returns an error if any issue occurs during the creation process or if the transaction fails.
 */
export const postNewTax = async (
	req: Request<{}, FormatResponseObjectType<ITaxDocument, HttpStatus["CREATED"]>, ITax>,
	res: Response<FormatResponseObjectType<ITaxDocument, HttpStatus["CREATED"]>>,
	next: NextFunction
): Promise<void> => {
	// Create a new tax from the request body data, and if there was an error,
	// return the error and end the request
	const [taxError, tax] = await to(Tax.create([req.body]));
	if (taxError) return next(taxError);

	// Set a flash message to indicate that the tax was created successfully,
	// and return the created tax in the response
	req.flash("success", "Tax created successfully.");
	res.status(httpStatus.CREATED).json(
		formatResponseObject({
			status: httpStatus.CREATED,
			entities: { data: tax[0] },
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Retrieves a paginated list of taxes.
 * @description Fetches taxes based on query parameters. Supports filtering by name,
 * description, and deletion status. Also includes pagination and sorting options.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.query - The query parameters for filtering and pagination.
 * @param {String} [req.query.sort] - The field to sort by.
 * @param {Number} [req.query.page] - The page number to retrieve.
 * @param {Number} [req.query.limit] - The number of states to retrieve per page.
 * @param {String} [req.query.offset] - The number of states to skip.
 * @param {String} [req.query.pagination] - Enable or disable pagination.
 * @param {String} [req.query.q] - Search term for filtering taxes by name or description.
 * @param {Boolean} [req.query.deleted] - Flag to include deleted taxes.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with paginated taxes and metadata.
 *   * @property {Array} entities.data - List of retrieved tax objects.
 *   * @property {Object} entities.meta.pagination - Pagination metadata (total docs, page, etc.).
 *   * @property {Array} entities.meta.sort - Available sort options for the taxes.
 * @throws {Error} 500 - Returns an error if the tax retrieval fails.
 */
export const getTaxes = async (
	req: Request<
		{},
		FormatResponseObjectType<ITaxDocument, HttpStatus["OK"]>,
		{},
		Pick<PaginateOptions, "sort" | "page" | "limit" | "offset" | "pagination"> & {
			q?: string;
			deleted?: boolean | number;
		}
	>,
	res: Response<FormatResponseObjectType<ITaxDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Destructure the query parameters (req.query) into
	// q (search term), deleted (include deleted countries), and query (pagination & sorting options)
	const { q, deleted } = req.query || {};

	// Check if the query includes a deleted flag
	const isFilterByDeletedAllowed = "deleted" in req.query;

	// List of fields to search for the query term
	const querySearchFields: string[] = ["name", "description"];

	// List of sort options
	const sort: { name: string; value: object }[] = [
		{ name: "Name A-Z", value: { name: 1 } },
		{ name: "Name Z-A", value: { name: -1 } },
		{ name: "Created Date Ascending", value: { createdAt: 1 } },
		{ name: "Created Date Descending", value: { createdAt: -1 } },
	];

	const [paginatedTaxesError, paginatedTaxes] = await to(
		Tax.paginate<ITaxDocument>(
			{
				// If the query includes a search term, filter taxes by name or code
				...((q && {
					$or: querySearchFields.map((item) => ({
						[item]: { $regex: String(q).toLowerCase() || "", $options: "i" },
					})),
				}) ||
					{}),
				// If the query includes a deleted flag, include deleted taxes
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
	if (paginatedTaxesError) return next(paginatedTaxesError);

	// Destructure the paginated taxes into the list of taxes (docs) and pagination metadata
	const { docs, ...pagination } = paginatedTaxes;

	// Return the list of taxes, pagination metadata, and sort options in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: [...(docs || [])], meta: { pagination, sort } },
		})
	);
};

/**
 * @summary Retrieves a single tax by identifier.
 * @description Fetches a tax based on the provided identifier, which can be either a slug or an ObjectId.
 * Handles errors and returns the tax data if found.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.params - URL parameters for the request.
 * @param {String} req.params.tax - The tax identifier, either a slug or an ObjectId.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with the tax data.
 *   * @property {Object} entities.data - The retrieved tax object.
 * @throws {Error} 500 - Returns an error if the tax retrieval fails.
 * @throws {Error} 404 - Returns an error if no tax is found.
 */
export const getSingleTax = async (
	req: Request<{ tax: string }, FormatResponseObjectType<ITaxDocument, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<ITaxDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Retrieve the tax ID or slug from the request parameters
	const { tax: taxIdentifier } = req.params || {};

	// Attempt to retrieve a tax from the database with the given ID or slug,
	// and if there was an error or no tax was found, return the error and end the request
	const [taxError, tax] = await to(
		Tax.findOneWithDeleted({
			$or: [
				{ slug: taxIdentifier },
				...(isMongoId(taxIdentifier) ? [{ _id: taxIdentifier }] : []),
			],
		})
	);
	if (taxError || !tax) return next(taxError);

	// Return the retrieved tax in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, entities: { data: tax } })
	);
};

/**
 * @summary Retrieves a single tax.
 * @description Fetches a single tax based on the provided tax ID or slug.
 *
 * @param {Object} req - Express request object.
 * @param {String} req.params.tax - The tax ID or slug.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with the retrieved tax.
 *   * @property {Object} entities.data - The retrieved tax object.
 * @throws {Error} 404 - Returns an error if the tax is not found.
 * @throws {Error} 500 - Returns an error if the tax retrieval fails.
 */
export const updateSingleTax = async (
	req: Request<
		{ tax: string },
		FormatResponseObjectType<ITaxDocument, HttpStatus["OK"]>,
		Partial<Omit<ITax, "logo">> & { logo?: Express.Multer.File }
	>,
	res: Response<FormatResponseObjectType<ITaxDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	// Retrieve the tax ID or slug from the request parameters
	const { tax: taxIdentifier } = req.params || {};

	// Attempt to retrieve a tax from the database with the given ID or slug,
	// and if there was an error or no tax was found, return the error and end the request
	let [taxError, tax] = await to(
		Tax.findOneWithDeleted({
			$or: [
				{ slug: taxIdentifier },
				...(isMongoId(taxIdentifier) ? [{ _id: taxIdentifier }] : []),
			],
		}).session(session)
	);
	if (taxError || !tax) {
		handleTransactionError(session);
		return next(taxError);
	}

	// Merge the request body data into the existing tax object
	tax = Object.assign(tax, req.body);

	// If the tax is not found, pass control to the next middleware
	if (!tax) {
		handleTransactionError(session);
		return next();
	}

	// Save the updated tax object to the database, and if there is an error during saving,
	// pass the error to the next middleware
	const [saveError, newTax] = await to(tax.save({ session }));
	if (saveError) {
		handleTransactionError(session);
		return next(saveError);
	}

	// Commit the transaction
	await session.commitTransaction();
	session.endSession();

	// Flash success message and return the updated tax data in the response
	req.flash("success", "successfully updated.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: newTax },
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Deletes a single tax by its ID or slug.
 * @description This method deletes a tax from the database using the provided slug or MongoDB object ID.
 * The tax is soft-deleted by marking it as deleted, ensuring it can be restored if needed.
 * The method handles errors and returns a success response when the deletion is successful.
 *
 * @param {Object} req - Express request object.
 * @param {String} req.params.tax - The ID or slug of the tax to delete.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response indicating the tax was deleted.
 * @throws {Error} 404 - If no tax is found with the provided identifier.
 * @throws {Error} 500 - If an error occurs during the deletion process.
 */
export const deleteSingleTax = async (
	req: Request<{ tax: string }, FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
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

	// Extract the tax identifier from request parameters
	const { tax: taxIdentifier } = req.params || {};

	// Attempt to find the tax by its ID or slug, and if there is an error or no tax is found,
	// pass the error to the next middleware
	const [taxError, tax] = await to(
		Tax.findOne({
			$or: [
				{ slug: taxIdentifier },
				...(isMongoId(taxIdentifier) ? [{ _id: taxIdentifier }] : []),
			],
		})
	);
	if (taxError || !tax) return next(taxError);

	// Attempt to soft-delete the found tax, and if there is an error during the deletion,
	// pass the error to the next middleware
	const [deleteTaxError] = await to(Tax.deleteById(tax._id, req.user._id));
	if (deleteTaxError) return next(deleteTaxError);

	// Flash success message and respond with success status
	req.flash("success", "Successfully Deleted.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};

/**
 * @summary Restores a single tax by its ID or slug.
 * @description This method restores a tax that was previously soft-deleted from the database.
 * The method handles errors and returns a success response when the tax is successfully restored.
 *
 * @param {Object} req - Express request object.
 * @param {String} req.params.tax - The ID or slug of the tax to restore.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response indicating the tax was restored.
 * @throws {Error} 404 - If no tax is found with the provided identifier.
 * @throws {Error} 500 - If an error occurs during the restore process.
 */
export const restoreSingleTax = async (
	req: Request<{ tax: string }, FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Extract the tax identifier from request parameters
	const { tax: taxIdentifier } = req.params || {};

	// Create a query to find the tax by its ID or slug
	const singleTaxQuery = {
		$or: [
			{ slug: taxIdentifier }, // search by slug
			...(isMongoId(taxIdentifier) ? [{ _id: taxIdentifier }] : []), // search by ID
		],
		deleted: true, // only find soft-deleted countries
	};

	// Attempt to find the tax by its ID or slug, and if there is an error or no tax is found,
	// pass the error to the next middleware
	const [taxError, tax] = await to(Tax.findOneWithDeleted(singleTaxQuery));
	if (taxError || !tax) return next(taxError);

	// Attempt to restore the found tax, and if there is an error during the restoration,
	// pass the error to the next middleware
	const [restoreTaxError] = await to(Tax.restore(singleTaxQuery));
	if (restoreTaxError) return next(restoreTaxError);

	// Flash success message and respond with success status
	req.flash("success", "Successfully Restored.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};
