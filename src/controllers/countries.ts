import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body, ValidationChain } from "express-validator";
import createError from "http-errors";
import httpStatus, { HttpStatus } from "http-status";
import { PaginateOptions } from "mongoose";
import isMongoId from "validator/lib/isMongoId";
import ICountry from "../interfaces/Country.interface";
import Country, { ICountryDocument } from "../models/Country";
import {
	formatResponseObject,
	type FormatResponseObjectType,
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
				body("code")
					.trim()
					.escape()
					.toUpperCase()
					.notEmpty()
					.withMessage("You must supply a code!")
					.isLength({ max: 3, min: 1 })
					.withMessage("Code must be minimum 1 and at most 3 characters long!"),
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
					.toUpperCase()
					.notEmpty()
					.withMessage("You must supply a code!")
					.isLength({ max: 3, min: 1 })
					.withMessage("Code must be minimum 1 and at most 3 characters long!"),
			];
		default:
			return [];
	}
};

/**
 * @openapi
 * /v1/countries:
 *   post:
 *     summary: Creates a new country.
 *     description: Creates a country with name and code. Admin/SuperAdmin only.
 *     tags:
 *       - Countries
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
 *               - code
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 100
 *               code:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 3
 *     responses:
 *       "201":
 *         description: Country created successfully.
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
 *                       $ref: '#/components/schemas/Countries'
 *                 flashes:
 *                   type: object
 *       "400":
 *         description: Invalid data.
 *       "401":
 *         description: Unauthorized.
 *       "500":
 *         description: Internal Server Error.
 */
export const postNewCountry = async (
	req: Request<
		{},
		FormatResponseObjectType<ICountryDocument, HttpStatus["CREATED"]>,
		Pick<ICountry, "name" | "code">
	>,
	res: Response<FormatResponseObjectType<ICountryDocument, HttpStatus["CREATED"]>>,
	next: NextFunction
): Promise<void> => {
	// Create a new country from the request body data, and if there was an error,
	// return the error and end the request
	const [createdCountryError, createdCountry] = await to(
		Country.create({ name: req.body.name, code: req.body.code })
	);
	if (createdCountryError) return next(createdCountryError);

	// Set a flash message to indicate that the country was created successfully,
	// and return the created country in the response
	req.flash("success", "Country created successfully.");
	res.status(httpStatus.CREATED).json(
		formatResponseObject({
			status: httpStatus.CREATED,
			entities: { data: createdCountry },
			flashes: req.flash(),
		})
	);
};

/**
 * @openapi
 * /v1/countries:
 *   get:
 *     summary: Retrieves a paginated list of countries.
 *     description: Fetches countries with filtering and pagination.
 *     tags:
 *       - Countries
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
 *         description: List of countries.
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
 *                         $ref: '#/components/schemas/Countries'
 *                     meta:
 *                       type: object
 *                       properties:
 *                         pagination:
 *                           type: object
 *       "500":
 *         description: Internal Server Error.
 */
export const getCountries = async (
	req: Request<
		{},
		FormatResponseObjectType<ICountryDocument, HttpStatus["OK"]>,
		{},
		Partial<
			Pick<PaginateOptions, "sort" | "page" | "limit" | "offset" | "pagination"> & {
				q?: string;
				deleted?: boolean | number;
			}
		>
	>,
	res: Response<FormatResponseObjectType<ICountryDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Destructure the query parameters (req.query) into
	// q (search term), deleted (include deleted countries)
	const { q, deleted } = req.query || {};

	// Check if the query includes a deleted flag
	const isFilterByDeletedAllowed: boolean = "deleted" in req.query;

	// List of fields to search for the query term
	const querySearchFields: string[] = ["name", "code"];

	// List of sort options
	const sort: SortItemType<"name" | "createdAt">[] = [
		{ name: "Name A-Z", value: { name: 1 } },
		{ name: "Name Z-A", value: { name: -1 } },
		{ name: "Created Date Ascending", value: { createdAt: 1 } },
		{ name: "Created Date Descending", value: { createdAt: -1 } },
	];

	// Attempt to retrieve the countries using the given query and pagination options,
	// and if there was an error, return the error and end the request
	const [paginatedCountriesError, paginatedCountries] = await to(
		Country.paginate<ICountryDocument>(
			{
				// If the query includes a search term, filter countries by name or code
				...((q && {
					$or: querySearchFields.map((item) => ({
						[item]: { $regex: String(q).toLowerCase() || "", $options: "i" },
					})),
				}) ||
					{}),
				// If the query includes a deleted flag, include deleted countries
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
	if (paginatedCountriesError) return next(paginatedCountriesError);

	// Destructure the paginated countries into the list of countries (docs) and pagination metadata
	const { docs, ...pagination } = paginatedCountries;

	// Return the list of countries, pagination metadata, and sort options in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: [...(docs || [])], meta: { pagination, sort } },
		})
	);
};

/**
 * @openapi
 * /v1/countries/{country}:
 *   get:
 *     summary: Retrieves a single country.
 *     description: Fetches a country by ID or slug. Admin/SuperAdmin only.
 *     tags:
 *       - Countries
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: country
 *         required: true
 *         schema:
 *           type: string
 *         description: Country ID or slug.
 *     responses:
 *       "200":
 *         description: Country details.
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
 *                       $ref: '#/components/schemas/Countries'
 *       "401":
 *         description: Unauthorized.
 *       "404":
 *         description: Country not found.
 *       "500":
 *         description: Internal Server Error.
 */
export const getSingleCountry = async (
	req: Request<{ country: string }, FormatResponseObjectType<ICountryDocument, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<ICountryDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Retrieve the country ID or slug from the request parameters
	const { country: countryIdentifier } = req.params || {};

	// Attempt to retrieve a country from the database with the given ID or slug,
	// and if there was an error or no country was found, return the error and end the request
	const [countryError, country] = await to(
		Country.findOneWithDeleted({
			$or: [
				{ slug: countryIdentifier }, // search by slug
				...((isMongoId(countryIdentifier) && [{ _id: countryIdentifier }]) || []), // search by ID
			],
		})
	);
	if (countryError || !country) return next(countryError);

	// Return the retrieved country in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, entities: { data: country } })
	);
};

/**
 * @openapi
 * /v1/countries/{country}:
 *   patch:
 *     summary: Updates a single country.
 *     description: Updates country details. Admin/SuperAdmin only.
 *     tags:
 *       - Countries
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: country
 *         required: true
 *         schema:
 *           type: string
 *         description: Country ID or slug.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 100
 *               code:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 3
 *     responses:
 *       "200":
 *         description: Country updated successfully.
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
 *                       $ref: '#/components/schemas/Countries'
 *                 flashes:
 *                   type: object
 *       "401":
 *         description: Unauthorized.
 *       "404":
 *         description: Country not found.
 *       "500":
 *         description: Internal Server Error.
 */
export const updateSingleCountry = async (
	req: Request<
		{ country: string },
		FormatResponseObjectType<ICountryDocument, HttpStatus["OK"]>,
		Partial<Pick<ICountry, "name" | "code">>
	>,
	res: Response<FormatResponseObjectType<ICountryDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Extract country identifier from request parameters
	const { country: countryIdentifier } = req.params || {};

	// Attempt to find the country by ID or slug, and if there is an error or no country is found,
	// pass the error to the next middleware
	let [countryError, country] = await to(
		Country.findOneWithDeleted({
			$or: [
				{ slug: countryIdentifier }, // search by slug
				...(isMongoId(countryIdentifier) ? [{ _id: countryIdentifier }] : []), // search by ID
			],
		})
	);
	if (countryError || !country) return next(countryError);

	// Merge the request body data into the existing country object
	country = Object.assign(country, {
		...(req.body?.name && { name: req.body.name }),
		...(req.body?.code && { code: req.body.code }),
	});

	// Save the updated country object to the database, and if there is an error during saving,
	// pass the error to the next middleware
	const [saveError, newCountry] = await to(country.save());
	if (saveError) return next(saveError);

	// Flash success message and return the updated country data in the response
	req.flash("success", "Successfully updated.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: newCountry },
			flashes: req.flash(),
		})
	);
};

/**
 * @openapi
 * /v1/countries/{country}:
 *   delete:
 *     summary: Deletes a single country.
 *     description: Soft-deletes a country. Admin/SuperAdmin only.
 *     tags:
 *       - Countries
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: country
 *         required: true
 *         schema:
 *           type: string
 *         description: Country ID or slug.
 *     responses:
 *       "200":
 *         description: Country deleted successfully.
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
 *         description: Country not found.
 *       "500":
 *         description: Internal Server Error.
 */
export const deleteSingleCountry = async (
	req: Request<{ country: string }, FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
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

	// Extract the country identifier from request parameters
	const { country: countryIdentifier } = req.params || {};

	// Attempt to find the country by its ID or slug, and if there is an error or no country is found,
	// pass the error to the next middleware
	const [countryError, country] = await to(
		Country.findOne({
			$or: [
				{ slug: countryIdentifier }, // search by slug
				...(isMongoId(countryIdentifier) ? [{ _id: countryIdentifier }] : []), // search by ID
			],
		})
	);
	if (countryError || !country) return next(countryError);

	// Attempt to soft-delete the found country, and if there is an error during the deletion,
	// pass the error to the next middleware
	const [deleteCountryError] = await to(Country.deleteById(country._id, req.user._id));
	if (deleteCountryError) return next(deleteCountryError);

	// Flash success message and respond with success status
	req.flash("success", "Successfully Deleted.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};

/**
 * @openapi
 * /v1/countries/{country}/restore:
 *   patch:
 *     summary: Restores a single country.
 *     description: Restores a soft-deleted country. Admin/SuperAdmin only.
 *     tags:
 *       - Countries
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: country
 *         required: true
 *         schema:
 *           type: string
 *         description: Country ID or slug.
 *     responses:
 *       "200":
 *         description: Country restored successfully.
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
 *         description: Country not found.
 *       "500":
 *         description: Internal Server Error.
 */
export const restoreSingleCountry = async (
	req: Request<{ country: string }, FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Extract the country identifier from request parameters
	const { country: countryIdentifier } = req.params || {};

	// Create a query to find the country by its ID or slug
	const singleCountryQuery = {
		$or: [
			{ slug: countryIdentifier }, // search by slug
			...(isMongoId(countryIdentifier) ? [{ _id: countryIdentifier }] : []), // search by ID
		],
		deleted: true, // only find soft-deleted countries
	};

	// Attempt to find the country by its ID or slug, and if there is an error or no country is found,
	// pass the error to the next middleware
	const [countryError, country] = await to(Country.findOneWithDeleted(singleCountryQuery));
	if (countryError || !country) return next(countryError);

	// Attempt to restore the found country, and if there is an error during the restoration,
	// pass the error to the next middleware
	const [restoreCountryError] = await to(Country.restore(singleCountryQuery));
	if (restoreCountryError) return next(restoreCountryError);

	// Flash success message and respond with success status
	req.flash("success", "Successfully Restored.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};
