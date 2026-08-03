import to from "await-to-js";
import { NextFunction, Response } from "express";
import { body, ValidationChain } from "express-validator";
import httpStatus, { HttpStatus } from "http-status";
import mongoose, { PaginateOptions } from "mongoose";
import isMongoId from "validator/lib/isMongoId";
import { AuthenticatedRequest } from "../@types/express";
import IZone from "../interfaces/Zone";
import City from "../models/City";
import Country from "../models/Country";
import State from "../models/State";
import Zone, { IZoneDocument } from "../models/Zone";
import {
	formatResponseObject,
	type FormatResponseObjectType,
	type SortItemType,
} from "../utils/helpers";

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
					.withMessage("States must be an array with at least one state ID.")
					.custom((states: string[]) => {
						return states.every((countryId: string) =>
							mongoose.Types.ObjectId.isValid(countryId)
						);
					})
					.withMessage("Invalid state ID(s) provided."),
				body("cities")
					.isArray({ min: 1 })
					.withMessage("Cities must be an array with at least one city ID.")
					.custom((cities: string[]) => {
						return cities.every((countryId: string) =>
							mongoose.Types.ObjectId.isValid(countryId)
						);
					})
					.withMessage("Invalid city ID(s) provided."),
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
					.withMessage("States must be an array with at least one state ID.")
					.custom((states: string[]) => {
						return states.every((countryId: string) =>
							mongoose.Types.ObjectId.isValid(countryId)
						);
					})
					.withMessage("Invalid state ID(s) provided."),
				body("cities")
					.optional()
					.isArray({ min: 1 })
					.withMessage("Cities must be an array with at least one city ID.")
					.custom((cities: string[]) => {
						return cities.every((countryId: string) =>
							mongoose.Types.ObjectId.isValid(countryId)
						);
					})
					.withMessage("Invalid city ID(s) provided."),
			];
		default:
			return [];
	}
};

/**
 * @openapi
 * /v1/zones:
 *   post:
 *     summary: Creates a new zone.
 *     description: Creates a zone with countries, states, and cities.
 *     tags:
 *       - Zones
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - countries
 *               - states
 *               - cities
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 maxLength: 1000
 *               countries:
 *                 type: array
 *                 items:
 *                   type: string
 *                   description: Country ID
 *               states:
 *                 type: array
 *                 items:
 *                   type: string
 *                   description: State ID
 *               cities:
 *                 type: array
 *                 items:
 *                   type: string
 *                   description: City ID
 *     responses:
 *       "201":
 *         description: Zone created successfully
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
 *                           $ref: '#/components/schemas/Zones'
 *                         flashes:
 *                           $ref: '#/components/schemas/Flash'
 *       "500":
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const postNewZone = async (
	req: AuthenticatedRequest<
		{},
		FormatResponseObjectType<IZoneDocument, HttpStatus["CREATED"]>,
		Pick<IZone, "name" | "description" | "countries" | "states" | "cities">
	>,
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
 * @openapi
 * /v1/zones:
 *   get:
 *     summary: Retrieves a paginated list of zones.
 *     description: Fetches zones with filtering, sorting, and pagination.
 *     tags:
 *       - Zones
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
 *         description: Search query (name or description).
 *       - in: query
 *         name: deleted
 *         schema:
 *           type: boolean
 *         description: Include deleted zones.
 *     responses:
 *       "200":
 *         description: List of zones retrieved successfully
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
 *                             $ref: '#/components/schemas/Zones'
 *                         meta:
 *                           $ref: '#/components/schemas/Meta'
 *       "500":
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const getZones = async (
	req: AuthenticatedRequest<
		{},
		FormatResponseObjectType<IZoneDocument, HttpStatus["OK"]>,
		{},
		Partial<
			Pick<PaginateOptions, "sort" | "page" | "limit" | "offset" | "pagination"> & {
				q?: string;
				deleted?: boolean | number;
			}
		>
	>,
	res: Response<FormatResponseObjectType<IZoneDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Destructure the query parameters (req.query) into
	// q (search term), deleted (include deleted zones)
	const { q, deleted } = req.query || {};

	// Check if the query includes a deleted flag
	const isFilterByDeletedAllowed: boolean = "deleted" in req.query;

	// List of fields to search for the query term
	const querySearchFields: string[] = ["name", "description"];

	// List of sort options
	const sort: SortItemType<"name" | "createdAt">[] = [
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

/**
 * @openapi
 * /v1/zones/{zone}:
 *   get:
 *     summary: Retrieves a single zone.
 *     description: Fetches a zone by ID or slug.
 *     tags:
 *       - Zones
 *     parameters:
 *       - in: path
 *         name: zone
 *         required: true
 *         schema:
 *           type: string
 *         description: Zone ID or slug.
 *     responses:
 *       "200":
 *         description: Zone details retrieved successfully
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
 *                           $ref: '#/components/schemas/Zones'
 *       "404":
 *         description: Zone not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       "500":
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const getSingleZone = async (
	req: AuthenticatedRequest<
		{ zone: string },
		FormatResponseObjectType<IZoneDocument, HttpStatus["OK"]>
	>,
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
 * @openapi
 * /v1/zones/{zone}:
 *   patch:
 *     summary: Updates a single zone.
 *     description: Updates zone details.
 *     tags:
 *       - Zones
 *     parameters:
 *       - in: path
 *         name: zone
 *         required: true
 *         schema:
 *           type: string
 *         description: Zone ID or slug.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 maxLength: 1000
 *               countries:
 *                 type: array
 *                 items:
 *                   type: string
 *               states:
 *                 type: array
 *                 items:
 *                   type: string
 *               cities:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       "200":
 *         description: Zone updated successfully
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
 *                           $ref: '#/components/schemas/Zones'
 *                         flashes:
 *                           $ref: '#/components/schemas/Flash'
 *       "404":
 *         description: Zone not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       "500":
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const updateSingleZone = async (
	req: AuthenticatedRequest<
		{ zone: string },
		FormatResponseObjectType<IZoneDocument, HttpStatus["OK"]>,
		Partial<Pick<IZone, "name" | "description" | "countries" | "states" | "cities">>
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
	Object.assign(zone, {
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
 * @openapi
 * /v1/zones/{zone}:
 *   delete:
 *     summary: Deletes a single zone.
 *     description: Soft-deletes a zone. Requires Admin or SuperAdmin role.
 *     tags:
 *       - Zones
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: zone
 *         required: true
 *         schema:
 *           type: string
 *         description: Zone ID or slug.
 *     responses:
 *       "200":
 *         description: Zone deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     flashes:
 *                       $ref: '#/components/schemas/Flash'
 *       "401":
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       "404":
 *         description: Zone not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       "500":
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const deleteSingleZone = async (
	req: AuthenticatedRequest<
		{ zone: string },
		FormatResponseObjectType<undefined, HttpStatus["OK"]>
	>,
	res: Response<FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
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
 * @openapi
 * /v1/zones/{zone}/restore:
 *   patch:
 *     summary: Restores a single zone.
 *     description: Restores a soft-deleted zone.
 *     tags:
 *       - Zones
 *     parameters:
 *       - in: path
 *         name: zone
 *         required: true
 *         schema:
 *           type: string
 *         description: Zone ID or slug.
 *     responses:
 *       "200":
 *         description: Zone restored successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     flashes:
 *                       $ref: '#/components/schemas/Flash'
 *       "404":
 *         description: Zone not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       "500":
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const restoreSingleZone = async (
	req: AuthenticatedRequest<
		{ zone: string },
		FormatResponseObjectType<undefined, HttpStatus["OK"]>
	>,
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
