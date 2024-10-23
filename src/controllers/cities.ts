import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body, ValidationChain } from "express-validator";
import httpStatus, { HttpStatus } from "http-status";
import { PaginateOptions } from "mongoose";
import isMongoId from "validator/lib/isMongoId";
import ICity from "../interfaces/City.interface";
import City, { ICityDocument } from "../models/City";
import Country from "../models/Country";
import State from "../models/State";
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
				body("country")
					.trim()
					.escape()
					.isMongoId()
					.withMessage("Invalid country id!")
					.notEmpty()
					.withMessage("You must supply a country id!"),
				body("state")
					.trim()
					.escape()
					.isMongoId()
					.withMessage("Invalid state id!")
					.notEmpty()
					.withMessage("You must supply a state id!"),
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
				body("country")
					.trim()
					.escape()
					.optional()
					.isMongoId()
					.withMessage("Invalid country id!")
					.notEmpty()
					.withMessage("You must supply a country id!"),
				body("state")
					.trim()
					.escape()
					.optional()
					.isMongoId()
					.withMessage("Invalid state id!")
					.notEmpty()
					.withMessage("You must supply a state id!"),
			];
		default:
			return [];
	}
};

/**
 * @summary Creates a new city.
 * @description Creates a new city, returning the created city.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.body - City data.
 * @param {String} req.body.name - The name of the city, ex: "New York".
 * @param {String} req.body.country - The ID of the country that the city belongs to.
 * @param {String} req.body.state - The ID of the state that the city belongs to.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 201 - Created response with the newly created city.
 *   * @property {Object} entities.data - The created city object.
 */
export const postNewCity = async (
	req: Request<{}, FormatResponseObjectType<ICityDocument, HttpStatus["CREATED"]>, ICity>,
	res: Response<FormatResponseObjectType<ICityDocument, HttpStatus["CREATED"]>>,
	next: NextFunction
): Promise<void> => {
	// Attempt to find the country the city belongs to,
	// If the country is not found or there is an error, pass the error to the next middleware
	const [countryError, country] = await to(Country.findById({ _id: req.body.country }));
	if (countryError || !country) return next(countryError);

	// Attempt to find the state the city belongs to,
	// If the state is not found or there is an error, pass the error to the next middleware
	const [stateError, state] = await to(State.findById({ _id: req.body.state }));
	if (stateError || !state) return next(stateError);

	// Attempt to create the new city
	// If there is an error creating the city, pass the error to the next middleware
	const [createdCityError, createdCity] = await to(
		City.create({ name: req.body.name, country: country._id, state: state._id })
	);
	if (createdCityError) return next(createdCityError);

	// Flash success message and return the created city in the response
	req.flash("success", "City created successfully.");
	res.status(httpStatus.CREATED).json(
		formatResponseObject({
			status: httpStatus.CREATED,
			entities: { data: createdCity },
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Retrieves a paginated list of cities.
 * @description Fetches cities based on query parameters. Supports filtering by name,
 * and deletion status. Also includes pagination and sorting options.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.query - The query parameters for filtering and pagination.
 * @param {String} [req.query.sort] - The field to sort by.
 * @param {Number} [req.query.page] - The page number to retrieve.
 * @param {Number} [req.query.limit] - The number of cities to retrieve per page.
 * @param {String} [req.query.offset] - The number of cities to skip.
 * @param {String} [req.query.pagination] - Enable or disable pagination.
 * @param {Boolean} [req.query.deleted] - Flag to include deleted cities.
 * @param {String} [req.query.country] - The ID of the country that the cities belong to.
 * @param {String} [req.query.state] - The ID of the state that the cities belong to.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with paginated cities and metadata.
 *   * @property {Array} entities.data - List of retrieved state objects.
 *   * @property {Object} entities.meta.pagination - Pagination metadata (total docs, page, etc.).
 *   * @property {Array} entities.meta.sort - Available sort options for the cities.
 * @throws {Error} 404 - Returns an error if any data are't found.
 * @throws {Error} 500 - Returns an error if the state retrieval fails.
 */
export const getCities = async (
	req: Request<
		{},
		FormatResponseObjectType<ICityDocument, HttpStatus["OK"]>,
		{},
		Pick<PaginateOptions, "sort" | "page" | "limit" | "offset" | "pagination"> & {
			q?: string;
			deleted?: boolean | number;
			country?: string;
			state?: string;
		}
	>,
	res: Response<FormatResponseObjectType<ICityDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Destructure the query parameters (req.query) into
	// q (search term), deleted (include deleted countries), country (id of country), state (id of state), and query (pagination & sorting options)
	const { q, deleted, country, state, ...query } = req.query || {};

	// Check if the query includes a deleted flag
	const isFilterByDeletedAllowed: boolean = "deleted" in req.query;

	// Check if the query includes a country id
	const isFilterByCountryAllowed: boolean = "country" in req.query;

	// Check if the query includes a state id
	const isFilterByStateAllowed: boolean = "state" in req.query;

	// List of fields to search for the query term
	const querySearchFields: string[] = ["name"];

	// List of sort options
	const sort: { name: string; value: object }[] = [
		{ name: "Name A-Z", value: { name: 1 } },
		{ name: "Name Z-A", value: { name: -1 } },
		{ name: "Created Date Ascending", value: { createdAt: 1 } },
		{ name: "Created Date Descending", value: { createdAt: -1 } },
	];

	// Attempt to retrieve the cities using the given query and pagination options,
	// and if there was an error, return the error and end the request
	const [paginatedCitiesError, paginatedCities] = await to(
		City.paginate<ICityDocument>(
			{
				// If the query includes a search term, filter cities by name
				...((q && {
					$or: querySearchFields.map((item) => ({
						[item]: { $regex: String(q).toLowerCase() || "", $options: "i" },
					})),
				}) ||
					{}),
				// If the query includes a deleted flag, include deleted cities
				...((isFilterByDeletedAllowed && { deleted: Boolean(deleted) }) || {}),
				// If the query includes a country id, filter cities by country
				...((isFilterByCountryAllowed && { country }) || {}),
				// If the query includes a state id, filter cities by state
				...((isFilterByStateAllowed && { state }) || {}),
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
	if (paginatedCitiesError) return next(paginatedCitiesError);

	// Destructure the paginated cities into the list of cities (docs) and pagination metadata
	const { docs, ...pagination } = paginatedCities;

	// Return the list of cities, pagination metadata, and sort options in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: [...(docs || [])], meta: { pagination, sort } },
		})
	);
};

/**
 * @summary Retrieves a single city.
 * @description Fetches a city based on the provided slug or ID.
 * Handles errors and returns the city data if found.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.params - URL parameters for the request.
 * @param {String} req.params.city - The city identifier, either a slug or an ObjectId.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with the city data.
 *   * @property {Object} entities.data - The retrieved city object.
 * @throws {Error} 404 - Returns an error if no city is found.
 * @throws {Error} 500 - Returns an error if the city retrieval fails.
 */
export const getSingleCity = async (
	req: Request<{ city: string }, FormatResponseObjectType<ICityDocument, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<ICityDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Retrieve the city ID or slug from the request parameters
	const { city: cityIdentifier } = req.params || {};

	// Attempt to retrieve a city from the database with the given ID or slug,
	// and if there was an error or no city was found, return the error and end the request
	const [cityError, city] = await to(
		City.findOneWithDeleted({
			$or: [
				{ slug: cityIdentifier }, // search by slug
				...((isMongoId(cityIdentifier) && [{ _id: cityIdentifier }]) || []), // search by ID
			],
		})
	);
	if (cityError || !city) return next(cityError);

	// Return the retrieved city in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, entities: { data: city } })
	);
};

/**
 * @summary Updates a single city.
 * @description Updates a city based on the provided ID or slug.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.params - URL parameters for the request.
 * @param {String} req.params.city - The city identifier, either a slug or an ObjectId.
 * @param {Object} req.body - Update data for the city.
 * @param {String} [req.body.name] - The updated name of the city.
 * @param {String} [req.body.country] - The updated ID of the country that the city belongs to.
 * @param {String} [req.body.state] - The updated ID of the state that the city belongs to.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with the updated city data.
 *   * @property {Object} entities.data - The updated city object.
 * @throws {Error} 404 - Returns an error if any data not found.
 * @throws {Error} 500 - Returns an error if there is an issue during the update process.
 */
export const updateSingleCity = async (
	req: Request<
		{ city: string },
		FormatResponseObjectType<ICityDocument, HttpStatus["OK"]>,
		Partial<ICityDocument>
	>,
	res: Response<FormatResponseObjectType<ICityDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Attempt to find the country the city belongs to if country id exists in the request body,
	// If the country is not found or there is an error, pass the error to the next middleware
	if (req.body?.country) {
		const [countryError, country] = await to(Country.findById({ _id: req.body.country }));
		if (countryError || !country) return next(countryError);
	}

	// Attempt to find the state the city belongs to if state id exists in the request body,
	// If the state is not found or there is an error, pass the error to the next middleware
	if (req.body?.state) {
		const [stateError, state] = await to(State.findById({ _id: req.body.state }));
		if (stateError || !state) return next(stateError);
	}

	// Extract city identifier from request parameters
	const { city: cityIdentifier } = req.params || {};

	// Attempt to find the city by ID or slug, and if there is an error or no city is found,
	// pass the error to the next middleware
	let [cityError, city] = await to(
		City.findOneWithDeleted({
			$or: [
				{ slug: cityIdentifier }, // search by slug
				...(isMongoId(cityIdentifier) ? [{ _id: cityIdentifier }] : []), // search by ID
			],
		})
	);
	if (cityError || !city) return next(cityError);

	// Merge the request body data into the existing city object
	city = Object.assign(city, {
		...(req.body?.name && { name: req.body.name }),
		...(req.body?.country && { country: req.body.country }),
		...(req.body?.state && { state: req.body.state }),
	});

	// If the city is not found, pass control to the next middleware
	if (!city) return next();

	// Save the updated city object to the database, and if there is an error during saving,
	// pass the error to the next middleware
	const [saveError, newCity] = await to(city.save());
	if (saveError) return next(saveError);

	// Flash success message and return the updated city data in the response
	req.flash("success", "Successfully updated.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: newCity },
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Deletes a single city.
 * @description This method deletes a city from the database using the provided slug or MongoDB object ID.
 * The city is soft-deleted by marking it as deleted, ensuring it can be restored if needed.
 * The method handles errors and returns a success response when the deletion is successful.
 *
 * @param {Object} req - Express request object.
 * @param {String} req.params.city - The ID or slug of the city to delete.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response indicating the city was deleted.
 * @throws {Error} 404 - If no city is found with the provided identifier.
 * @throws {Error} 500 - If an error occurs during the deletion process.
 */
export const deleteSingleCity = async (
	req: Request<{ city: string }, FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Extract the city identifier from request parameters
	const { city: cityIdentifier } = req.params || {};

	// Attempt to find the city by its ID or slug, and if there is an error or no city is found,
	// pass the error to the next middleware
	const [cityError, city] = await to(
		City.findOne({
			$or: [
				{ slug: cityIdentifier }, // search by slug
				...(isMongoId(cityIdentifier) ? [{ _id: cityIdentifier }] : []), // search by ID
			],
		})
	);
	if (cityError || !city) return next(cityError);

	// Attempt to soft-delete the found city, and if there is an error during the deletion,
	// pass the error to the next middleware
	const [deleteCityError] = await to(City.deleteById(city._id, req?.user?._id));
	if (deleteCityError) return next(deleteCityError);

	// Flash success message and respond with success status
	req.flash("success", "Successfully Deleted.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};

/**
 * @summary Restores a single city by its ID or slug.
 * @description This method restores a city that was previously soft-deleted from the database.
 * The method handles errors and returns a success response when the city is successfully restored.
 *
 * @param {Object} req - Express request object.
 * @param {String} req.params.city - The ID or slug of the city to restore.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response indicating the city was restored.
 * @throws {Error} 404 - If no city is found with the provided identifier.
 * @throws {Error} 500 - If an error occurs during the restore process.
 */
export const restoreSingleCity = async (
	req: Request<{ city: string }, FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Extract the city identifier from request parameters
	const { city: cityIdentifier } = req.params || {};

	// Create a query to find the city by its ID or slug
	const singleCityQuery = {
		$or: [
			{ slug: cityIdentifier }, // search by slug
			...(isMongoId(cityIdentifier) ? [{ _id: cityIdentifier }] : []), // search by ID
		],
		deleted: true, // only find soft-deleted countries
	};

	// Attempt to find the city by its ID or slug, and if there is an error or no city is found,
	// pass the error to the next middleware
	const [cityError, city] = await to(City.findOneWithDeleted(singleCityQuery));
	if (cityError || !city) return next(cityError);

	// Attempt to restore the found city, and if there is an error during the restoration,
	// pass the error to the next middleware
	const [restoreCityError] = await to(City.restore(singleCityQuery));
	if (restoreCityError) return next(restoreCityError);

	// Flash success message and respond with success status
	req.flash("success", "Successfully Restored.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};
