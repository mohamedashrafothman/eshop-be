import to from "await-to-js";
import { NextFunction, Response } from "express";
import { body, ValidationChain } from "express-validator";
import httpStatus, { HttpStatus } from "http-status";
import { PaginateOptions } from "mongoose";
import isMongoId from "validator/lib/isMongoId";
import { AuthenticatedRequest } from "../@types/express";
import ICity from "../interfaces/City.interface";
import City, { ICityDocument } from "../models/City";
import Country from "../models/Country";
import State from "../models/State";
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
 * @openapi
 * /v1/cities:
 *   post:
 *     summary: Creates a new city.
 *     description: Creates a city with name, country, and state. Admin/SuperAdmin only.
 *     tags:
 *       - Cities
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - country
 *               - state
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 100
 *               country:
 *                 type: string
 *                 description: Country ID
 *               state:
 *                 type: string
 *                 description: State ID
 *     responses:
 *       "201":
 *         description: City created successfully
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
 *                           $ref: '#/components/schemas/Cities'
 *                         flashes:
 *                           $ref: '#/components/schemas/Flash'
 *       "400":
 *         description: Bad Request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       "401":
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       "500":
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const postNewCity = async (
	req: AuthenticatedRequest<
		{},
		FormatResponseObjectType<ICityDocument, HttpStatus["CREATED"]>,
		Pick<ICity, "name" | "country" | "state">
	>,
	res: Response<FormatResponseObjectType<ICityDocument, HttpStatus["CREATED"]>>,
	next: NextFunction
): Promise<void> => {
	// Attempt to find the country the city belongs to,
	// If the country is not found or there is an error, pass the error to the next middleware
	const [countryError, country] = await to(Country.findOneWithDeleted({ _id: req.body.country }));
	if (countryError || !country) return next(countryError);

	// Attempt to find the state the city belongs to,
	// If the state is not found or there is an error, pass the error to the next middleware
	const [stateError, state] = await to(State.findOneWithDeleted({ _id: req.body.state }));
	if (stateError || !state) return next(stateError);

	// Attempt to create the new city
	// If there is an error creating the city, pass the error to the next middleware
	const [createdCityError, createdCity] = await to(
		City.create({ name: req.body.name, country: req.body.country, state: req.body.state })
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
 * @openapi
 * /v1/cities:
 *   get:
 *     summary: Retrieves a paginated list of cities.
 *     description: Fetches cities with filtering and pagination.
 *     tags:
 *       - Cities
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
 *       - in: query
 *         name: country
 *         schema:
 *           type: string
 *         description: Country ID
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *         description: State ID
 *     responses:
 *       "200":
 *         description: List of cities retrieved successfully
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
 *                             $ref: '#/components/schemas/Cities'
 *                         meta:
 *                           $ref: '#/components/schemas/Meta'
 *       "500":
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const getCities = async (
	req: AuthenticatedRequest<
		{},
		FormatResponseObjectType<ICityDocument, HttpStatus["OK"]>,
		{},
		Partial<
			Pick<PaginateOptions, "sort" | "page" | "limit" | "offset" | "pagination"> & {
				q?: string;
				deleted?: boolean | number;
				country?: string;
				state?: string;
			}
		>
	>,
	res: Response<FormatResponseObjectType<ICityDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Destructure the query parameters (req.query) into
	// q (search term), deleted (include deleted countries), country (id of country), state (id of state)
	const { q, deleted, country, state } = req.query || {};

	// Check if the query includes a deleted flag
	const isFilterByDeletedAllowed: boolean = "deleted" in req.query;

	// Check if the query includes a country id
	const isFilterByCountryAllowed: boolean = "country" in req.query;

	// Check if the query includes a state id
	const isFilterByStateAllowed: boolean = "state" in req.query;

	// List of fields to search for the query term
	const querySearchFields: string[] = ["name"];

	// List of sort options
	const sort: SortItemType<"name" | "createdAt">[] = [
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
				...("page" in req.query && { page: Number(req.query.page) }),
				...("limit" in req.query && { limit: Number(req.query.limit) }),
				...("offset" in req.query && { offset: Number(req.query.offset) }),
				...("pagination" in req.query && { pagination: Boolean(req.query.pagination) }),
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
 * @openapi
 * /v1/cities/{city}:
 *   get:
 *     summary: Retrieves a single city.
 *     description: Fetches a city by ID or slug. Admin/SuperAdmin only.
 *     tags:
 *       - Cities
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *         description: City ID or slug.
 *     responses:
 *       "200":
 *         description: City details retrieved successfully
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
 *                           $ref: '#/components/schemas/Cities'
 *       "401":
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       "404":
 *         description: City not found
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
export const getSingleCity = async (
	req: AuthenticatedRequest<
		{ city: string },
		FormatResponseObjectType<ICityDocument, HttpStatus["OK"]>
	>,
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
 * @openapi
 * /v1/cities/{city}:
 *   patch:
 *     summary: Updates a single city.
 *     description: Updates city details. Admin/SuperAdmin only.
 *     tags:
 *       - Cities
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *         description: City ID or slug.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 100
 *               country:
 *                 type: string
 *               state:
 *                 type: string
 *     responses:
 *       "200":
 *         description: City updated successfully
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
 *                           $ref: '#/components/schemas/Cities'
 *                         flashes:
 *                           $ref: '#/components/schemas/Flash'
 *       "401":
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       "404":
 *         description: City not found
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
export const updateSingleCity = async (
	req: AuthenticatedRequest<
		{ city: string },
		FormatResponseObjectType<ICityDocument, HttpStatus["OK"]>,
		Partial<Pick<ICity, "name" | "country" | "state">>
	>,
	res: Response<FormatResponseObjectType<ICityDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Attempt to find the country the city belongs to if country id exists in the request body,
	// If the country is not found or there is an error, pass the error to the next middleware
	if (req.body?.country) {
		const [countryError, country] = await to(
			Country.findOneWithDeleted({ _id: req.body.country })
		);
		if (countryError || !country) return next(countryError);
	}

	// Attempt to find the state the city belongs to if state id exists in the request body,
	// If the state is not found or there is an error, pass the error to the next middleware
	if (req.body?.state) {
		const [stateError, state] = await to(State.findOneWithDeleted({ _id: req.body.state }));
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
	Object.assign(city, {
		...(req.body?.name && { name: req.body.name }),
		...(req.body?.country && { country: req.body.country }),
		...(req.body?.state && { state: req.body.state }),
	});

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
 * @openapi
 * /v1/cities/{city}:
 *   delete:
 *     summary: Deletes a single city.
 *     description: Soft-deletes a city. Admin/SuperAdmin only.
 *     tags:
 *       - Cities
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *         description: City ID or slug.
 *     responses:
 *       "200":
 *         description: City deleted successfully
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
 *         description: City not found
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
export const deleteSingleCity = async (
	req: AuthenticatedRequest<
		{ city: string },
		FormatResponseObjectType<undefined, HttpStatus["OK"]>
	>,
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
	const [deleteCityError] = await to(City.deleteById(city._id, req.user._id));
	if (deleteCityError) return next(deleteCityError);

	// Flash success message and respond with success status
	req.flash("success", "Successfully Deleted.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};

/**
 * @openapi
 * /v1/cities/{city}/restore:
 *   patch:
 *     summary: Restores a single city.
 *     description: Restores a soft-deleted city. Admin/SuperAdmin only.
 *     tags:
 *       - Cities
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *         description: City ID or slug.
 *     responses:
 *       "200":
 *         description: City restored successfully
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
 *         description: City not found
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
export const restoreSingleCity = async (
	req: AuthenticatedRequest<
		{ city: string },
		FormatResponseObjectType<undefined, HttpStatus["OK"]>
	>,
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
