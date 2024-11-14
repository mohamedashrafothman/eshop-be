import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body, ValidationChain } from "express-validator";
import createError from "http-errors";
import httpStatus, { HttpStatus } from "http-status";
import { PaginateOptions } from "mongoose";
import isMongoId from "validator/lib/isMongoId";
import IShippingMethod from "../interfaces/ShippingMethod.interface";
import ShippingMethod, { IShippingMethodDocument } from "../models/ShippingMethod";
import Zone from "../models/Zone";
import { type FormatResponseObjectType, formatResponseObject } from "../utils/helpers";
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
				body("rate")
					.isFloat({ min: 0 })
					.withMessage("Rate must be greater than or equal to 0!")
					.notEmpty()
					.withMessage("Rate is required!"),
				body("deliveryTime.min")
					.isFloat({ min: 0 })
					.withMessage("Minimum delivery time must be greater than or equal to 0!")
					.notEmpty()
					.withMessage("Minimum delivery time is required!"),
				body("deliveryTime.max")
					.optional()
					.isFloat({ min: 0 })
					.withMessage("Maximum delivery time must be greater than or equal to 0!")
					.notEmpty()
					.withMessage("Maximum delivery time is required!"),
				body("zone")
					.trim()
					.escape()
					.isMongoId()
					.withMessage("Invalid zone id!")
					.notEmpty()
					.withMessage("You must supply a zone id!"),
			];
		case "update":
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
				body("rate")
					.optional()
					.isFloat({ min: 0 })
					.withMessage("Rate must be greater than or equal to 0!")
					.notEmpty()
					.withMessage("Rate is required!"),
				body("deliveryTime.min")
					.optional()
					.isFloat({ min: 0 })
					.withMessage("Minimum delivery time must be greater than or equal to 0!")
					.notEmpty()
					.withMessage("Minimum delivery time is required!"),
				body("deliveryTime.max")
					.optional()
					.isFloat({ min: 0 })
					.withMessage("Maximum delivery time must be greater than or equal to 0!")
					.notEmpty()
					.withMessage("Maximum delivery time is required!"),
				body("zone")
					.optional()
					.trim()
					.escape()
					.isMongoId()
					.withMessage("Invalid zone id!")
					.notEmpty()
					.withMessage("You must supply a zone id!"),
			];
		default:
			return [];
	}
};

/**
 * @summary Creates a new shipping method.
 * @description This function handles the creation of a new shipping method using the data provided in the request body.
 * It uses the ShippingMethod model to create a new entry in the database. If successful, it sets a flash message and
 * returns the created shipping method in the response. If an error occurs, it forwards the error to the next middleware.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.body - The payload containing details for the new shipping method.
 * @param {String} req.body.name - The name of the shipping method.
 * @param {Number} req.body.rate - The rate of the shipping method.
 * @param {Object} req.body.deliveryTime - The delivery time object with min and max values.
 * @param {String} req.body.zone - The ID of the zone associated with the shipping method.
 * @param {String} [req.body.description] - The description of the shipping method (optional).
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {void} 201 - Success response with the created shipping method entity.
 * @throws {Error} - Returns an error if the creation process fails.
 */
export const postNewShippingMethod = async (
	req: Request<
		{},
		FormatResponseObjectType<IShippingMethodDocument, HttpStatus["CREATED"]>,
		IShippingMethod
	>,
	res: Response<FormatResponseObjectType<IShippingMethodDocument, HttpStatus["CREATED"]>>,
	next: NextFunction
): Promise<void> => {
	// Check if the zone ID provided in the request body exist in the database
	// and if there was an error, return the error and end the request
	// If the zone ID do not exist in the database, return an error
	const [zoneError, zone] = await to(Zone.findById({ _id: req.body.zone }));
	if (zoneError || !zone)
		return next(
			zoneError ||
				new Error(
					"Invalid zone ID provided. Please ensure all zone ID exist in the database."
				)
		);

	// Create a new shipping method from the request body data, and if there was an error,
	// return the error and end the request
	const [createdShippingMethodError, createdShippingMethod] = await to(
		ShippingMethod.create({
			name: req.body.name,
			rate: req.body.rate,
			deliveryTime: req.body.deliveryTime,
			zone: zone._id,
			...(req.body?.description && { description: req.body.description }),
		})
	);
	if (createdShippingMethodError) return next(createdShippingMethodError);

	// Set a flash message to indicate that the shipping method was created successfully,
	// and return the created shipping method in the response
	req.flash("success", "Shipping method created successfully.");
	res.status(httpStatus.CREATED).json(
		formatResponseObject({
			status: httpStatus.CREATED,
			entities: { data: createdShippingMethod },
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Retrieves a list of shipping methods based on filters and search criteria.
 * @description Fetches shipping methods from the database using various filters,
 * including search queries, zones, and deletion status. Supports pagination and sorting options.
 * If the user is an admin or super admin, deleted shipping methods can also be included in the results.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.query - Query parameters for filtering and sorting.
 * @param {String} [req.query.sort] - The field to sort by.
 * @param {Number} [req.query.page] - The page number to retrieve.
 * @param {Number} [req.query.limit] - The number of zones to retrieve per page.
 * @param {String} [req.query.offset] - The number of zones to skip.
 * @param {String} [req.query.pagination] - Enable or disable pagination.
 * @param {String} [req.query.q] - Search query to match against shipping method name and description.
 * @param {Boolean} [req.query.deleted] - Flag to include deleted shipping methods in the response.
 * @param {String} [req.query.zone] - The ID of the zone associated with the shipping methods.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with a list of shipping methods, pagination metadata, and sort options.
 * @throws {Error} 500 - Returns an error if any issue occurs during the retrieval process.
 */
export const getShippingMethods = async (
	req: Request<
		{},
		FormatResponseObjectType<IShippingMethodDocument, HttpStatus["OK"]>,
		{},
		Pick<PaginateOptions, "sort" | "page" | "limit" | "offset" | "pagination"> & {
			q?: string;
			deleted?: boolean | number;
			zone?: string;
		}
	>,
	res: Response<FormatResponseObjectType<IShippingMethodDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Destructure the query parameters (req.query) into
	// q (search term), deleted (include deleted shipping methods), zone (id of zone) and query (pagination & sorting options)
	const { q, deleted, zone } = req.query || {};

	// Check if the query includes a deleted flag
	const isFilterByDeletedAllowed: boolean =
		"deleted" in req.query &&
		Boolean(
			req.user &&
				req.user.role &&
				[vars.auth.roles.superAdmin, vars.auth.roles.admin].includes(req.user.role)
		);

	// Check if the query includes a zone
	const isFilterByZoneAllowed: boolean = "zone" in req.query;

	// List of fields to search for the query term
	const querySearchFields: string[] = ["name", "description"];

	// List of sort options
	const sort: { name: string; value: object }[] = [
		{ name: "Name A-Z", value: { name: 1 } },
		{ name: "Name Z-A", value: { name: -1 } },
		{ name: "Created Date Ascending", value: { createdAt: 1 } },
		{ name: "Created Date Descending", value: { createdAt: -1 } },
	];

	// Attempt to retrieve the shipping methods using the given query and pagination options,
	// and if there was an error, return the error and end the request
	const [paginatedShippingMethodsError, paginatedShippingMethods] = await to(
		ShippingMethod.paginate<IShippingMethodDocument>(
			{
				// If the query includes a search term, filter shipping methods by name or description
				...((q && {
					$or: querySearchFields.map((item) => ({
						[item]: { $regex: String(q).toLowerCase() || "", $options: "i" },
					})),
				}) ||
					{}),
				// If the query includes a deleted flag, include deleted shipping methods
				...((isFilterByDeletedAllowed && { deleted: Boolean(deleted) }) || {}),
				// If the query includes a zone, include zone shipping methods
				...((isFilterByZoneAllowed && { zone: Boolean(zone) }) || {}),
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
	if (paginatedShippingMethodsError) return next(paginatedShippingMethodsError);

	// Destructure the paginated shipping methods into the list of shipping methods (docs) and pagination metadata
	const { docs, ...pagination } = paginatedShippingMethods;

	// Return the list of shipping methods, pagination metadata, and sort options in the response
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
 * @summary Retrieves a single shipping method by its slug or ID.
 * @description This function fetches a shipping method record from the database using
 * either the shipping method slug or the MongoDB object ID. If the provided identifier
 * is a valid MongoDB ID, it will attempt to find the shipping method by its ID; otherwise,
 * it will search by the slug. It also accounts for deleted shipping method records.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.params - Route parameters.
 * @param {String} req.params.method - The slug or ID of the shipping method to retrieve.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with the retrieved shipping method data.
 *   * @property {Object} entities.data - The retrieved shipping method object.
 * @throws {Error} 404 - If no shipping method is found with the provided identifier.
 * @throws {Error} 500 - If an error occurs during the retrieval process.
 */
export const getSingleShippingMethod = async (
	req: Request<
		{ method: string },
		FormatResponseObjectType<IShippingMethodDocument, HttpStatus["OK"]>
	>,
	res: Response<FormatResponseObjectType<IShippingMethodDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Retrieve the shipping method ID or slug from the request parameters
	const { method: shippingMethodIdentifier } = req.params || {};

	// Attempt to retrieve a shipping method from the database with the given ID or slug,
	// and if there was an error or no shipping method was found, return the error and end the request
	const [shippingMethodError, shippingMethod] = await to(
		ShippingMethod.findOneWithDeleted({
			$or: [
				{ slug: shippingMethodIdentifier }, // search by slug
				...((isMongoId(shippingMethodIdentifier) && [{ _id: shippingMethodIdentifier }]) ||
					[]), // search by ID
			],
		})
	);
	if (shippingMethodError || !shippingMethod) return next(shippingMethodError);

	// Return the retrieved shipping method in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, entities: { data: shippingMethod } })
	);
};

/**
 * @summary Updates a shipping method.
 * @description This function retrieves a shipping method by ID or slug, and if it exists,
 * merges the provided request body data into the existing shipping method object and saves
 * the updated object to the database. It also checks if the zone ID provided in
 * the request body exists in the database and if not, returns an error.
 * If the user is not authenticated, it returns a 401 error.
 * If the shipping method or cart are not found, or if there is an error during the database
 * operations, it returns the respective error.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.params - Route parameters.
 * @param {String} req.params.method - The slug or ID of the shipping method to retrieve.
 * @param {Object} req.body - The payload containing details for the updated shipping method.
 * @param {String} req.body.name - The name of the shipping method (optional).
 * @param {String} req.body.description - The description of the shipping method (optional).
 * @param {Number} req.body.rate - The rate of the shipping method (optional).
 * @param {String} req.body.zone - The ID of the zone associated with the shipping method (optional).
 * @param {Object} req.body.deliveryTime - The delivery time object with min and max values (optional).
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with the updated shipping method data, success message, and error messages.
 *   * @property {Object} entities.data - The updated shipping method object.
 *   * @property {String[]} flashes - Success and error messages.
 * @throws {Error} 401 - Returns an error if the user is not authenticated.
 * @throws {Error} 404 - If no shipping method is found with the provided identifier.
 * @throws {Error} 500 - If an error occurs during the retrieval process.
 */
export const updateSingleShippingMethod = async (
	req: Request<
		{ method: string },
		FormatResponseObjectType<IShippingMethodDocument, HttpStatus["OK"]>,
		Partial<IShippingMethod>
	>,
	res: Response<FormatResponseObjectType<IShippingMethodDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Check if the zone ID provided in the request body exist in the database
	// and if there was an error, return the error and end the request
	// If the zone ID do not exist in the database, return an error
	if (req.body?.zone) {
		const [zoneError, zone] = await to(Zone.findById({ _id: req.body.zone }));
		if (zoneError || !zone)
			return next(
				zoneError ||
					new Error(
						"Invalid zone ID provided. Please ensure all zone ID exist in the database."
					)
			);
	}

	// Extract shipping method identifier from request parameters
	const { method: shippingMethodIdentifier } = req.params || {};

	// Attempt to find the shipping method by ID or slug, and if there is an error or no shipping method is found,
	// pass the error to the next middleware
	let [shippingMethodError, shippingMethod] = await to(
		ShippingMethod.findOneWithDeleted({
			$or: [
				{ slug: shippingMethodIdentifier }, // search by slug
				...(isMongoId(shippingMethodIdentifier) ? [{ _id: shippingMethodIdentifier }] : []), // search by ID
			],
		})
	);
	if (shippingMethodError || !shippingMethod) return next(shippingMethodError);

	// Merge the request body data into the existing shipping method object
	shippingMethod = Object.assign(shippingMethod, {
		...(req.body?.name && { name: req.body.name }),
		...(req.body?.description && { description: req.body.description }),
		...(req.body?.rate && { rate: req.body.rate }),
		...(req.body?.zone && { zone: req.body.zone }),
		...("deliveryTime" in req.body && {
			deliveryTime: {
				...((req.body.deliveryTime?.min || shippingMethod.deliveryTime.min) && {
					min: req.body.deliveryTime?.min || shippingMethod.deliveryTime.min,
				}),
				...((req.body.deliveryTime?.max || shippingMethod.deliveryTime.max) && {
					max: req.body.deliveryTime?.max || shippingMethod.deliveryTime.max,
				}),
			},
		}),
	});

	// Save the updated shipping method object to the database, and if there is an error during saving,
	// pass the error to the next middleware
	const [saveError, newShippingMethod] = await to(shippingMethod.save());
	if (saveError) return next(saveError);

	// Flash success message and return the updated shipping method data in the response
	req.flash("success", "Successfully updated.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: newShippingMethod },
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Deletes a single shipping method by its slug or ID.
 * @description This function first attempts to find a shipping method by its slug or ID. If the shipping method is found,
 * it then attempts to soft-delete the shipping method. If the deletion is successful, it flashes a success message and
 * responds with a success status.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.params - Route parameters.
 * @param {String} req.params.method - The slug or ID of the shipping method to delete.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {void}
 * @throws {Error} 404 - If no shipping method is found with the provided identifier.
 * @throws {Error} 500 - If an error occurs during the deletion process.
 */
export const deleteSingleShippingMethod = async (
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

	// Extract the shipping method identifier from request parameters
	const { method: shippingMethodIdentifier } = req.params || {};

	// Attempt to find the shipping method by its ID or slug, and if there is an error or no shipping method is found,
	// pass the error to the next middleware
	const [shippingMethodError, shippingMethod] = await to(
		ShippingMethod.findOne({
			$or: [
				{ slug: shippingMethodIdentifier }, // search by slug
				...(isMongoId(shippingMethodIdentifier) ? [{ _id: shippingMethodIdentifier }] : []), // search by ID
			],
		})
	);
	if (shippingMethodError || !shippingMethod) return next(shippingMethodError);

	// Attempt to soft-delete the found shipping method, and if there is an error during the deletion,
	// pass the error to the next middleware
	const [deleteShippingMethodError] = await to(
		ShippingMethod.deleteById(shippingMethod._id, req.user._id)
	);
	if (deleteShippingMethodError) return next(deleteShippingMethodError);

	// Flash success message and respond with success status
	req.flash("success", "Successfully Deleted.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};

/**
 * @summary Restore a single shipping method by its slug or ID.
 * @description This function first attempts to find a shipping method by its slug or ID. If the shipping method is found,
 * it then attempts to restore the shipping method. If the restoration is successful, it flashes a success message and
 * responds with a success status.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.params - Route parameters.
 * @param {String} req.params.method - The slug or ID of the shipping method to restore.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {void}
 * @throws {Error} 404 - If no shipping method is found with the provided identifier.
 * @throws {Error} 500 - If an error occurs during the restoration process.
 */
export const restoreSingleShippingMethod = async (
	req: Request<{ method: string }, FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Extract the shipping method identifier from request parameters
	const { method: shippingMethodIdentifier } = req.params || {};

	// Create a query to find the shipping method by its ID or slug
	const singleShippingMethodQuery = {
		$or: [
			{ slug: shippingMethodIdentifier }, // search by slug
			...(isMongoId(shippingMethodIdentifier) ? [{ _id: shippingMethodIdentifier }] : []), // search by ID
		],
		deleted: true, // only find soft-deleted countries
	};

	// Attempt to find the shipping method by its ID or slug, and if there is an error or no shipping method is found,
	// pass the error to the next middleware
	const [shippingMethodError, shippingMethod] = await to(
		ShippingMethod.findOneWithDeleted(singleShippingMethodQuery)
	);
	if (shippingMethodError || !shippingMethod) return next(shippingMethodError);

	// Attempt to restore the found shipping method, and if there is an error during the restoration,
	// pass the error to the next middleware
	const [restoreShippingMethodError] = await to(
		ShippingMethod.restore(singleShippingMethodQuery)
	);
	if (restoreShippingMethodError) return next(restoreShippingMethodError);

	// Flash success message and respond with success status
	req.flash("success", "Successfully Restored.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};
