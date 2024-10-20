import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body, ValidationChain } from "express-validator";
import httpStatus, { HttpStatus } from "http-status";
import { PaginateOptions } from "mongoose";
import isMongoId from "validator/lib/isMongoId";
import IState from "../interfaces/State.interface";
import Country from "../models/Country";
import State, { IStateDocument } from "../models/State";
import { formatResponseObject, type FormatResponseObjectType } from "../utils/helpers";

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
				body("code")
					.trim()
					.escape()
					.notEmpty()
					.withMessage("You must supply a code!")
					.isLength({ max: 3, min: 1 })
					.withMessage("Code must be at most 100 characters long!"),
				body("country")
					.trim()
					.escape()
					.isMongoId()
					.withMessage("Invalid country id!")
					.notEmpty()
					.withMessage("You must supply a country id!"),
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
				body("code")
					.trim()
					.escape()
					.optional()
					.notEmpty()
					.withMessage("You must supply a code!")
					.isLength({ max: 3, min: 1 })
					.withMessage("Code must be at most 100 characters long!"),
				body("country")
					.trim()
					.escape()
					.optional()
					.isMongoId()
					.withMessage("Invalid country id!")
					.notEmpty()
					.withMessage("You must supply a country id!"),
			];
		default:
			return [];
	}
};

/**
 * @summary Creates a new state.
 * @description Creates a new state, returning the created state.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.body - State data.
 * @param {String} req.body.name - The name of the state, ex: "New York".
 * @param {String} req.body.code - The code of the state, ex: "NY".
 * @param {String} req.body.country - The ID of the country that the state belongs to.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 201 - Created response with the newly created state.
 *   * @property {Object} entities.data - The created state object.
 */
export const postNewState = async (
	req: Request<{}, FormatResponseObjectType<IStateDocument, HttpStatus["CREATED"]>, IState>,
	res: Response<FormatResponseObjectType<IStateDocument, HttpStatus["CREATED"]>>,
	next: NextFunction
) => {
	// Attempt to find the country the state belongs to,
	// If the country is not found or there is an error, pass the error to the next middleware
	const [countryError, country] = await to(Country.findById({ _id: req.body.country }));
	if (countryError || !country) return next(countryError);

	// Attempt to create the new state
	// If there is an error creating the state, pass the error to the next middleware
	const [createdStateError, createdState] = await to(
		State.create({ name: req.body.name, code: req.body.code, country: country._id })
	);
	if (createdStateError) return next(createdStateError);

	// Flash success message and return the created state in the response
	req.flash("success", "State created successfully.");
	res.status(httpStatus.CREATED).json(
		formatResponseObject({
			status: httpStatus.CREATED,
			entities: { data: createdState },
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Retrieves a paginated list of states.
 * @description Fetches states based on query parameters. Supports filtering by name,
 * code, and deletion status. Also includes pagination and sorting options.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.query - The query parameters for filtering and pagination.
 * @param {String} [req.query.sort] - The field to sort by.
 * @param {Number} [req.query.page] - The page number to retrieve.
 * @param {Number} [req.query.limit] - The number of states to retrieve per page.
 * @param {String} [req.query.offset] - The number of states to skip.
 * @param {String} [req.query.pagination] - Enable or disable pagination.
 * @param {String} [req.query.q] - Search term for filtering states by name or code.
 * @param {Boolean} [req.query.deleted] - Flag to include deleted states.
 * @param {String} [req.query.country] - The ID of the country that the states belong to.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with paginated states and metadata.
 *   * @property {Array} entities.data - List of retrieved state objects.
 *   * @property {Object} entities.meta.pagination - Pagination metadata (total docs, page, etc.).
 *   * @property {Array} entities.meta.sort - Available sort options for the states.
 * @throws {Error} 404 - Returns an error if any data are't found.
 * @throws {Error} 500 - Returns an error if the state retrieval fails.
 */
export const getStates = async (
	req: Request<
		{},
		FormatResponseObjectType<IStateDocument, HttpStatus["OK"]>,
		{},
		Pick<PaginateOptions, "sort" | "page" | "limit" | "offset" | "pagination"> & {
			q?: string;
			deleted?: boolean | number;
			country?: string;
		}
	>,
	res: Response<FormatResponseObjectType<IStateDocument, HttpStatus["OK"]>>,
	next: NextFunction
) => {
	// Destructure the query parameters (req.query) into
	// q (search term), deleted (include deleted countries), country (id of country), and query (pagination & sorting options)
	const { q, deleted, country } = req.query || {};

	// Check if the query includes a deleted flag
	const isFilteredByDeleted: boolean = "deleted" in req.query;

	// Check if the query includes a country id
	const isFilteredByCountry: boolean = "country" in req.query;

	// List of fields to search for the query term
	const querySearchFields: string[] = ["name", "code"];

	// List of sort options
	const sort: { name: string; value: object }[] = [
		{ name: "Name A-Z", value: { name: 1 } },
		{ name: "Name Z-A", value: { name: -1 } },
		{ name: "Created Date Ascending", value: { createdAt: 1 } },
		{ name: "Created Date Descending", value: { createdAt: -1 } },
	];

	// Attempt to retrieve the states using the given query and pagination options,
	// and if there was an error, return the error and end the request
	const [paginatedStatesError, paginatedStates] = await to(
		State.paginate<IStateDocument>(
			{
				// If the query includes a search term, filter states by name or code
				...((q && {
					$or: querySearchFields.map((item) => ({
						[item]: { $regex: String(q).toLowerCase() || "", $options: "i" },
					})),
				}) ||
					{}),
				// If the query includes a deleted flag, include deleted states
				...((isFilteredByDeleted && { deleted: Boolean(deleted) }) || {}),
				// If the query includes a country id, filter states by country
				...((isFilteredByCountry && { country }) || {}),
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
	if (paginatedStatesError) return next(paginatedStatesError);

	// Destructure the paginated states into the list of states (docs) and pagination metadata
	const { docs, ...pagination } = paginatedStates;

	// Return the list of states, pagination metadata, and sort options in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: [...(docs || [])], meta: { pagination, sort } },
		})
	);
};

/**
 * @summary Retrieves a single state.
 * @description Fetches a state based on the provided slug or ID.
 * Handles errors and returns the state data if found.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.params - URL parameters for the request.
 * @param {String} req.params.state - The state identifier, either a slug or an ObjectId.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with the state data.
 *   * @property {Object} entities.data - The retrieved state object.
 * @throws {Error} 404 - Returns an error if no state is found.
 * @throws {Error} 500 - Returns an error if the state retrieval fails.
 */
export const getSingleState = async (
	req: Request<{ state: string }, FormatResponseObjectType<IStateDocument, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<IStateDocument, HttpStatus["OK"]>>,
	next: NextFunction
) => {
	// Retrieve the state ID or slug from the request parameters
	const { state: stateIdentifier } = req.params || {};

	// Attempt to retrieve a state from the database with the given ID or slug,
	// and if there was an error or no state was found, return the error and end the request
	const [stateError, state] = await to(
		State.findOneWithDeleted({
			$or: [
				{ slug: stateIdentifier }, // search by slug
				...((isMongoId(stateIdentifier) && [{ _id: stateIdentifier }]) || []), // search by ID
			],
		})
	);
	if (stateError || !state) return next(stateError);

	// Return the retrieved state in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, entities: { data: state } })
	);
};

/**
 * @summary Updates a single state.
 * @description Updates a state based on the provided ID or slug.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.params - URL parameters for the request.
 * @param {String} req.params.state - The state identifier, either a slug or an ObjectId.
 * @param {Object} req.body - Update data for the state.
 * @param {String} [req.body.name] - The updated name of the state.
 * @param {String} [req.body.code] - The updated code of the state.
 * @param {String} [req.body.country] - The updated ID of the country that the state belongs to.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with the updated state data.
 *   * @property {Object} entities.data - The updated state object.
 * @throws {Error} 404 - Returns an error if any data not found.
 * @throws {Error} 500 - Returns an error if there is an issue during the update process.
 */
export const updateSingleState = async (
	req: Request<
		{ state: string },
		FormatResponseObjectType<IStateDocument, HttpStatus["OK"]>,
		Partial<IState>
	>,
	res: Response<FormatResponseObjectType<IStateDocument, HttpStatus["OK"]>>,
	next: NextFunction
) => {
	// Attempt to find the country the state belongs to if country id exists in the request body,
	// If the country is not found or there is an error, pass the error to the next middleware
	if (req.body?.country) {
		const [countryError, country] = await to(Country.findById({ _id: req.body.country }));
		if (countryError || !country) return next(countryError);
	}

	// Extract state identifier from request parameters
	const { state: stateIdentifier } = req.params || {};

	// Attempt to find the state by ID or slug, and if there is an error or no state is found,
	// pass the error to the next middleware
	let [stateError, state] = await to(
		State.findOneWithDeleted({
			$or: [
				{ slug: stateIdentifier }, // search by slug
				...(isMongoId(stateIdentifier) ? [{ _id: stateIdentifier }] : []), // search by ID
			],
		})
	);
	if (stateError || !state) return next(stateError);

	// Merge the request body data into the existing state object
	state = Object.assign(state, {
		...(req.body?.name && { name: req.body.name }),
		...(req.body?.code && { code: req.body.code }),
		...(req.body?.country && { country: req.body.country }),
	});

	// If the state is not found, pass control to the next middleware
	if (!state) return next();

	// Save the updated state object to the database, and if there is an error during saving,
	// pass the error to the next middleware
	const [saveError, newState] = await to(state.save());
	if (saveError) return next(saveError);

	// Flash success message and return the updated state data in the response
	req.flash("success", "Successfully updated.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: newState },
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Deletes a single state.
 * @description This method deletes a state from the database using the provided slug or MongoDB object ID.
 * The state is soft-deleted by marking it as deleted, ensuring it can be restored if needed.
 * The method handles errors and returns a success response when the deletion is successful.
 *
 * @param {Object} req - Express request object.
 * @param {String} req.params.state - The ID or slug of the state to delete.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response indicating the state was deleted.
 * @throws {Error} 404 - If no state is found with the provided identifier.
 * @throws {Error} 500 - If an error occurs during the deletion process.
 */
export const deleteSingleState = async (
	req: Request<{ state: string }, FormatResponseObjectType<IStateDocument, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<IStateDocument, HttpStatus["OK"]>>,
	next: NextFunction
) => {
	// Extract the state identifier from request parameters
	const { state: stateIdentifier } = req.params || {};

	// Attempt to find the state by its ID or slug, and if there is an error or no state is found,
	// pass the error to the next middleware
	const [stateError, state] = await to(
		State.findOne({
			$or: [
				{ slug: stateIdentifier }, // search by slug
				...(isMongoId(stateIdentifier) ? [{ _id: stateIdentifier }] : []), // search by ID
			],
		})
	);
	if (stateError || !state) return next(stateError);

	// Attempt to soft-delete the found state, and if there is an error during the deletion,
	// pass the error to the next middleware
	const [deleteStateError] = await to(State.deleteById(state._id, req?.user?._id));
	if (deleteStateError) return next(deleteStateError);

	// Flash success message and respond with success status
	req.flash("success", "Successfully Deleted.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};

/**
 * @summary Restores a single state by its ID or slug.
 * @description This method restores a state that was previously soft-deleted from the database.
 * The method handles errors and returns a success response when the state is successfully restored.
 *
 * @param {Object} req - Express request object.
 * @param {String} req.params.state - The ID or slug of the state to restore.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response indicating the state was restored.
 * @throws {Error} 404 - If no state is found with the provided identifier.
 * @throws {Error} 500 - If an error occurs during the restore process.
 */
export const restoreSingleState = async (
	req: Request<{ state: string }, FormatResponseObjectType<IStateDocument, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<IStateDocument, HttpStatus["OK"]>>,
	next: NextFunction
) => {
	// Extract the state identifier from request parameters
	const { state: stateIdentifier } = req.params || {};

	// Create a query to find the state by its ID or slug
	const singleStateQuery = {
		$or: [
			{ slug: stateIdentifier }, // search by slug
			...(isMongoId(stateIdentifier) ? [{ _id: stateIdentifier }] : []), // search by ID
		],
		deleted: true, // only find soft-deleted countries
	};

	// Attempt to find the state by its ID or slug, and if there is an error or no state is found,
	// pass the error to the next middleware
	const [stateError, state] = await to(State.findOneWithDeleted(singleStateQuery));
	if (stateError || !state) return next(stateError);

	// Attempt to restore the found state, and if there is an error during the restoration,
	// pass the error to the next middleware
	const [restoreStateError] = await to(State.restore(singleStateQuery));
	if (restoreStateError) return next(restoreStateError);

	// Flash success message and respond with success status
	req.flash("success", "Successfully Restored.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};
