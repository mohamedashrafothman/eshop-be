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
					.notEmpty()
					.withMessage("You must supply a code!")
					.isLength({ max: 3, min: 1 })
					.withMessage("Code must be at most 100 characters long!"),
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
			];
		default:
			return [];
	}
};

/**
 * @summary Creates a new country.
 * @description Creates a new country, returning the created country.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.body - Country data.
 * @param {String} req.body.name - The name of the country, ex: "United States of America".
 * @param {String} req.body.code - The code of the country, ex: "USA".
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 201 - Created response with the newly created country.
 *   * @property {Object} entities.data - The created country object.
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
 * @summary Retrieves a paginated list of countries.
 * @description Fetches countries based on query parameters. Supports filtering by name,
 * code, and deletion status. Also includes pagination and sorting options.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.query - The query parameters for filtering and pagination.
 * @param {String} [req.query.sort] - The field to sort by.
 * @param {Number} [req.query.page] - The page number to retrieve.
 * @param {Number} [req.query.limit] - The number of states to retrieve per page.
 * @param {String} [req.query.offset] - The number of states to skip.
 * @param {String} [req.query.pagination] - Enable or disable pagination.
 * @param {String} [req.query.q] - Search term for filtering countries by name or code.
 * @param {Boolean} [req.query.deleted] - Flag to include deleted countries.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with paginated countries and metadata.
 *   * @property {Array} entities.data - List of retrieved country objects.
 *   * @property {Object} entities.meta.pagination - Pagination metadata (total docs, page, etc.).
 *   * @property {Array} entities.meta.sort - Available sort options for the countries.
 * @throws {Error} 500 - Returns an error if the country retrieval fails.
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
 * @summary Retrieves a single country.
 * @description Fetches a single country based on the provided country ID or slug.
 *
 * @param {Object} req - Express request object.
 * @param {String} req.params.country - The country ID or slug.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with the retrieved country.
 *   * @property {Object} entities.data - The retrieved country object.
 * @throws {Error} 404 - Returns an error if the country is not found.
 * @throws {Error} 500 - Returns an error if the country retrieval fails.
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
 * @summary Updates a single country by ID or slug.
 * @description Updates a country's details in the database using the provided country ID or slug.
 * The update operation modifies the country object with the new data from the request body.
 *
 * @param {Object} req - Express request object.
 * @param {String} req.params.country - The country ID or slug.
 * @param {Object} req.body - The new data for the country.
 * @param {String} [req.body.name] - new name for the country (optional).
 * @param {String} [req.body.code] - new code for the country (optional).
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with the updated country data.
 *   * @property {Object} entities.data - The updated country object.
 * @throws {Error} 404 - Returns an error if the country is not found.
 * @throws {Error} 500 - Returns an error if the country update fails.
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
 * @summary Deletes a single country by its ID or slug.
 * @description This method deletes a country from the database using the provided slug or MongoDB object ID.
 * The country is soft-deleted by marking it as deleted, ensuring it can be restored if needed.
 * The method handles errors and returns a success response when the deletion is successful.
 *
 * @param {Object} req - Express request object.
 * @param {String} req.params.country - The ID or slug of the country to delete.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response indicating the country was deleted.
 * @throws {Error} 404 - If no country is found with the provided identifier.
 * @throws {Error} 500 - If an error occurs during the deletion process.
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
 * @summary Restores a single country by its ID or slug.
 * @description This method restores a country that was previously soft-deleted from the database.
 * The method handles errors and returns a success response when the country is successfully restored.
 *
 * @param {Object} req - Express request object.
 * @param {String} req.params.country - The ID or slug of the country to restore.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response indicating the country was restored.
 * @throws {Error} 404 - If no country is found with the provided identifier.
 * @throws {Error} 500 - If an error occurs during the restore process.
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
