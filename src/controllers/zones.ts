import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body, ValidationChain } from "express-validator";
import createError from "http-errors";
import httpStatus, { HttpStatus } from "http-status";
import mongoose, { PaginateOptions } from "mongoose";
import isMongoId from "validator/lib/isMongoId";
import IZone from "../interfaces/Zone";
import City from "../models/City";
import Country from "../models/Country";
import State from "../models/State";
import Zone, { IZoneDocument } from "../models/Zone";
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
				body("countries")
					.isArray({ min: 1 })
					.withMessage("Countries must be an array with at least one country ID.")
					.custom((countries: string[]) => {
						return countries.every((countryId: string) =>
							mongoose.Types.ObjectId.isValid(countryId)
						);
					})
					.withMessage("Invalid country ID(s) provided."),
				body("states")
					.isArray({ min: 1 })
					.withMessage("States must be an array with at least one country ID.")
					.custom((states: string[]) => {
						return states.every((countryId: string) =>
							mongoose.Types.ObjectId.isValid(countryId)
						);
					})
					.withMessage("Invalid country ID(s) provided."),
				body("cities")
					.isArray({ min: 1 })
					.withMessage("Cities must be an array with at least one country ID.")
					.custom((cities: string[]) => {
						return cities.every((countryId: string) =>
							mongoose.Types.ObjectId.isValid(countryId)
						);
					})
					.withMessage("Invalid country ID(s) provided."),
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
					.withMessage("Description must be at most 1000 characters long!"),
				body("countries")
					.optional()
					.isArray({ min: 1 })
					.withMessage("Countries must be an array with at least one country ID.")
					.custom((countries: string[]) => {
						return countries.every((countryId: string) =>
							mongoose.Types.ObjectId.isValid(countryId)
						);
					})
					.withMessage("Invalid country ID(s) provided."),
				body("states")
					.optional()
					.isArray({ min: 1 })
					.withMessage("States must be an array with at least one country ID.")
					.custom((states: string[]) => {
						return states.every((countryId: string) =>
							mongoose.Types.ObjectId.isValid(countryId)
						);
					})
					.withMessage("Invalid country ID(s) provided."),
				body("cities")
					.optional()
					.isArray({ min: 1 })
					.withMessage("Cities must be an array with at least one country ID.")
					.custom((cities: string[]) => {
						return cities.every((countryId: string) =>
							mongoose.Types.ObjectId.isValid(countryId)
						);
					})
					.withMessage("Invalid country ID(s) provided."),
			];
		default:
			return [];
	}
};

/**
 * @summary Creates a new zone.
 * @description Handles the creation of a new zone using the data provided in the request body.
 * It attempts to create the zone and returns it in the response if successful.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.body - Zone data.
 * @param {String} req.body.name - The name of the zone.
 * @param {Array} req.body.countries - Array of country IDs associated with the zone.
 * @param {Array} req.body.states - Array of state IDs associated with the zone.
 * @param {Array} req.body.cities - Array of city IDs associated with the zone.
 * @param {String} [req.body.description] - Optional description of the zone.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 201 - Created response with the newly created zone.
 *   * @property {Object} entities.data - The created zone object.
 * @throws {Error} - Returns an error if zone creation fails.
 */
export const postNewZone = async (
	req: Request<{}, FormatResponseObjectType<IZoneDocument, HttpStatus["CREATED"]>, IZone>,
	res: Response<FormatResponseObjectType<IZoneDocument, HttpStatus["CREATED"]>>,
	next: NextFunction
): Promise<void> => {
	// Check if the country IDs provided in the request body exist in the database
	// and if there was an error, return the error and end the request
	// If the country IDs do not exist in the database, return an error
	const [countriesError, countries] = await to(
		Country.find({ _id: { $in: req.body.countries } })
	);
	if (countriesError) return next(countriesError);
	if (countries.length !== req.body.countries.length) {
		return next(
			new Error(
				"Invalid country ID(s) provided. Please ensure all country IDs exist in the database."
			)
		);
	}

	// Check if the state IDs provided in the request body exist in the database
	// and if there was an error, return the error and end the request
	// If the state IDs do not exist in the database, return an error
	const [statesError, states] = await to(State.find({ _id: { $in: req.body.states } }));
	if (statesError) return next(statesError);
	if (states.length !== req.body.states.length) {
		return next(
			new Error(
				"Invalid state ID(s) provided. Please ensure all state IDs exist in the database."
			)
		);
	}

	// Check if the city IDs provided in the request body exist in the database
	// and if there was an error, return the error and end the request
	// If the city IDs do not exist in the database, return an error
	const [citiesError, cities] = await to(City.find({ _id: { $in: req.body.cities } }));
	if (citiesError) return next(citiesError);
	if (cities.length !== req.body.cities.length) {
		return next(
			new Error(
				"Invalid city ID(s) provided. Please ensure all city IDs exist in the database."
			)
		);
	}

	// Create a new zone from the request body data, and if there was an error,
	// return the error and end the request
	const [createdZoneError, createdZone] = await to(
		Zone.create({
			name: req.body.name,
			countries: req.body.countries,
			states: req.body.states,
			cities: req.body.cities,
			...(req.body?.description && { description: req.body.description }),
		})
	);
	if (createdZoneError) return next(createdZoneError);

	// Set a flash message to indicate that the zone was created successfully,
	// and return the created zone in the response
	req.flash("success", "Zone created successfully.");
	res.status(httpStatus.CREATED).json(
		formatResponseObject({
			status: httpStatus.CREATED,
			entities: { data: createdZone },
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Retrieves a paginated list of zones.
 * @description Fetches zones based on query parameters. Supports filtering by name, description,
 * and deletion status. Also includes pagination and sorting options.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.query - The query parameters for filtering and pagination.
 * @param {String} [req.query.sort] - The field to sort by.
 * @param {Number} [req.query.page] - The page number to retrieve.
 * @param {Number} [req.query.limit] - The number of zones to retrieve per page.
 * @param {String} [req.query.offset] - The number of zones to skip.
 * @param {String} [req.query.pagination] - Enable or disable pagination.
 * @param {String} [req.query.q] - Search term for filtering zones by name or description.
 * @param {Boolean} [req.query.deleted] - Flag to include deleted zones.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with paginated zones and metadata.
 *   * @property {Array} entities.data - List of retrieved zones.
 *   * @property {Object} entities.meta.pagination - Pagination metadata (total docs, page, etc.).
 *   * @property {Array} entities.meta.sort - Available sort options for the zones.
 * @throws {Error} 500 - Returns an error if the zone retrieval fails.
 */
export const getZones = async (
	req: Request<
		{},
		FormatResponseObjectType<IZoneDocument, HttpStatus["OK"]>,
		{},
		Pick<PaginateOptions, "sort" | "page" | "limit" | "offset" | "pagination"> & {
			q?: string;
			deleted?: boolean | number;
		}
	>,
	res: Response<FormatResponseObjectType<IZoneDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Destructure the query parameters (req.query) into
	// q (search term), deleted (include deleted zones), and query (pagination & sorting options)
	const { q, deleted } = req.query || {};

	// Check if the query includes a deleted flag
	const isFilterByDeletedAllowed: boolean = "deleted" in req.query;

	// List of fields to search for the query term
	const querySearchFields: string[] = ["name", "description"];

	// List of sort options
	const sort: { name: string; value: object }[] = [
		{ name: "Name A-Z", value: { name: 1 } },
		{ name: "Name Z-A", value: { name: -1 } },
		{ name: "Created Date Ascending", value: { createdAt: 1 } },
		{ name: "Created Date Descending", value: { createdAt: -1 } },
	];

	// Attempt to retrieve the zones using the given query and pagination options,
	// and if there was an error, return the error and end the request
	const [paginatedZonesError, paginatedZones] = await to(
		Zone.paginate<IZoneDocument>(
			{
				// If the query includes a search term, filter zones by name or code
				...((q && {
					$or: querySearchFields.map((item) => ({
						[item]: { $regex: String(q).toLowerCase() || "", $options: "i" },
					})),
				}) ||
					{}),
				// If the query includes a deleted flag, include deleted zones
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
	if (paginatedZonesError) return next(paginatedZonesError);

	// Destructure the paginated zones into the list of zones (docs) and pagination metadata
	const { docs, ...pagination } = paginatedZones;

	// Return the list of zones, pagination metadata, and sort options in the response
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

export const getSingleZone = async (
	req: Request<{ zone: string }, FormatResponseObjectType<IZoneDocument, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<IZoneDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Retrieve the zone ID or slug from the request parameters
	const { zone: zoneIdentifier } = req.params || {};

	// Attempt to retrieve a zone from the database with the given ID or slug,
	// and if there was an error or no zone was found, return the error and end the request
	const [zoneError, zone] = await to(
		Zone.findOneWithDeleted({
			$or: [
				{ slug: zoneIdentifier }, // search by slug
				...((isMongoId(zoneIdentifier) && [{ _id: zoneIdentifier }]) || []), // search by ID
			],
		})
	);
	if (zoneError || !zone) return next(zoneError);

	// Return the retrieved zone in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, entities: { data: zone } })
	);
};

/**
 * @summary Updates a single zone.
 * @description Updates a zone based on the provided ID or slug.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.params - URL parameters for the request.
 * @param {String} req.params.zone - The zone identifier, either a slug or an ObjectId.
 * @param {Object} req.body - Update data for the zone.
 * @param {String} [req.body.name] - The updated name of the zone.
 * @param {String} [req.body.description] - The updated description of the zone.
 * @param {Array} [req.body.countries] - The updated list of country IDs associated with the zone.
 * @param {Array} [req.body.states] - The updated list of state IDs associated with the zone.
 * @param {Array} [req.body.cities] - The updated list of city IDs associated with the zone.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with the updated zone data.
 *   * @property {Object} entities.data - The updated zone object.
 * @throws {Error} 404 - Returns an error if no zone is found.
 * @throws {Error} 500 - Returns an error if there is an issue during the update process.
 */
export const updateSingleZone = async (
	req: Request<
		{ zone: string },
		FormatResponseObjectType<IZoneDocument, HttpStatus["OK"]>,
		Partial<IZone>
	>,
	res: Response<FormatResponseObjectType<IZoneDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Extract zone identifier from request parameters
	const { zone: zoneIdentifier } = req.params || {};

	// Attempt to find the zone by ID or slug, and if there is an error or no zone is found,
	// pass the error to the next middleware
	let [zoneError, zone] = await to(
		Zone.findOneWithDeleted({
			$or: [
				{ slug: zoneIdentifier }, // search by slug
				...(isMongoId(zoneIdentifier) ? [{ _id: zoneIdentifier }] : []), // search by ID
			],
		})
	);
	if (zoneError || !zone) return next(zoneError);

	if (req.body?.countries) {
		// Check if the country IDs provided in the request body exist in the database
		// and if there was an error, return the error and end the request
		// If the country IDs do not exist in the database, return an error
		const [countriesError, countries] = await to(
			Country.find({ _id: { $in: req.body.countries } })
		);
		if (countriesError) return next(countriesError);
		if (countries.length !== req.body.countries.length) {
			return next(
				new Error(
					"Invalid country ID(s) provided. Please ensure all country IDs exist in the database."
				)
			);
		}
	}

	if (req.body?.states) {
		// Check if the state IDs provided in the request body exist in the database
		// and if there was an error, return the error and end the request
		// If the state IDs do not exist in the database, return an error
		const [statesError, states] = await to(State.find({ _id: { $in: req.body.states } }));
		if (statesError) return next(statesError);
		if (states.length !== req.body.states.length) {
			return next(
				new Error(
					"Invalid state ID(s) provided. Please ensure all state IDs exist in the database."
				)
			);
		}
	}

	if (req.body?.cities) {
		// Check if the city IDs provided in the request body exist in the database
		// and if there was an error, return the error and end the request
		// If the city IDs do not exist in the database, return an error
		const [citiesError, cities] = await to(City.find({ _id: { $in: req.body.cities } }));
		if (citiesError) return next(citiesError);
		if (cities.length !== req.body.cities.length) {
			return next(
				new Error(
					"Invalid city ID(s) provided. Please ensure all city IDs exist in the database."
				)
			);
		}
	}

	// Merge the request body data into the existing zone object
	zone = Object.assign(zone, {
		...(req.body?.name && { name: req.body.name }),
		...(req.body?.description && { description: req.body.description }),
		...(req.body?.countries && { countries: req.body.countries }),
		...(req.body?.states && { states: req.body.states }),
		...(req.body?.cities && { cities: req.body.cities }),
	});

	// Save the updated zone object to the database, and if there is an error during saving,
	// pass the error to the next middleware
	const [saveError, newZone] = await to(zone.save());
	if (saveError) return next(saveError);

	// Flash success message and return the updated zone data in the response
	req.flash("success", "Successfully updated.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: newZone },
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Deletes a single zone by its identifier.
 * @description Deletes a zone by searching for its identifier, which can be a slug or a MongoDB ObjectId.
 * If the zone is found, it attempts to soft-delete it, and if there is an issue during the deletion,
 * it passes the error to the next middleware. If the zone is not found, it passes an error to the next middleware.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.params - URL parameters for the request.
 * @param {String} req.params.zone - The zone identifier, either a slug or a MongoDB ObjectId.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with success message.
 * @throws {Error} 404 - Returns an error if the zone is not found.
 * @throws {Error} 500 - Returns an error if there is an issue during the deletion process.
 */
export const deleteSingleZone = async (
	req: Request<{ zone: string }, FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
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

	// Extract the zone identifier from request parameters
	const { zone: zoneIdentifier } = req.params || {};

	// Attempt to find the zone by its ID or slug, and if there is an error or no zone is found,
	// pass the error to the next middleware
	const [zoneError, zone] = await to(
		Zone.findOne({
			$or: [
				{ slug: zoneIdentifier }, // search by slug
				...(isMongoId(zoneIdentifier) ? [{ _id: zoneIdentifier }] : []), // search by ID
			],
		})
	);
	if (zoneError || !zone) return next(zoneError);

	// Attempt to soft-delete the found zone, and if there is an error during the deletion,
	// pass the error to the next middleware
	const [deleteZoneError] = await to(Zone.deleteById(zone._id, req.user._id));
	if (deleteZoneError) return next(deleteZoneError);

	// Flash success message and respond with success status
	req.flash("success", "Successfully Deleted.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};

/**
 * @summary Restores a single zone by its ID or slug.
 * @description This method restores a zone that was previously soft-deleted from the database.
 * The method handles errors and returns a success response when the zone is successfully restored.
 *
 * @param {Object} req - Express request object.
 * @param {String} req.params.zone - The ID or slug of the zone to restore.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response indicating the zone was restored.
 * @throws {Error} 404 - If no zone is found with the provided identifier.
 * @throws {Error} 500 - If an error occurs during the restore process.
 */
export const restoreSingleZone = async (
	req: Request<{ zone: string }, FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Extract the zone identifier from request parameters
	const { zone: zoneIdentifier } = req.params || {};

	// Create a query to find the zone by its ID or slug
	const singleZoneQuery = {
		$or: [
			{ slug: zoneIdentifier }, // search by slug
			...(isMongoId(zoneIdentifier) ? [{ _id: zoneIdentifier }] : []), // search by ID
		],
		deleted: true, // only find soft-deleted countries
	};

	// Attempt to find the zone by its ID or slug, and if there is an error or no zone is found,
	// pass the error to the next middleware
	const [zoneError, zone] = await to(Zone.findOneWithDeleted(singleZoneQuery));
	if (zoneError || !zone) return next(zoneError);

	// Attempt to restore the found zone, and if there is an error during the restoration,
	// pass the error to the next middleware
	const [restoreZoneError] = await to(Zone.restore(singleZoneQuery));
	if (restoreZoneError) return next(restoreZoneError);

	// Flash success message and respond with success status
	req.flash("success", "Successfully Restored.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};
