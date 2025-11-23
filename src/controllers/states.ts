import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body, ValidationChain } from "express-validator";
import createError from "http-errors";
import httpStatus, { HttpStatus } from "http-status";
import { PaginateOptions } from "mongoose";
import isMongoId from "validator/lib/isMongoId";
import IState from "../interfaces/State.interface";
import Country from "../models/Country";
import State, { IStateDocument } from "../models/State";
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
 * @openapi
 * /v1/states:
 *   post:
 *     summary: Creates a new state.
 *     description: Creates a state linked to a country. Requires Admin or SuperAdmin role.
 *     tags:
 *       - States
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
 *               - country
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 100
 *               code:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 3
 *               country:
 *                 type: string
 *                 description: Country ID
 *     responses:
 *       "201":
 *         description: State created successfully
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
 *                           $ref: '#/components/schemas/States'
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
 *       "404":
 *         description: Country not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       "422":
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       "500":
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const postNewState = async (
	req: Request<
		{},
		FormatResponseObjectType<IStateDocument, HttpStatus["CREATED"]>,
		Pick<IState, "name" | "code" | "country">
	>,
	res: Response<FormatResponseObjectType<IStateDocument, HttpStatus["CREATED"]>>,
	next: NextFunction
): Promise<void> => {
	// Attempt to find the country the state belongs to,
	// If the country is not found or there is an error, pass the error to the next middleware
	const [countryError, country] = await to(Country.findOneWithDeleted({ _id: req.body.country }));
	if (countryError || !country) return next(countryError);

	// Attempt to create the new state
	// If there is an error creating the state, pass the error to the next middleware
	const [createdStateError, createdState] = await to(
		State.create({ name: req.body.name, code: req.body.code, country: req.body.country })
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
 * @openapi
 * /v1/states:
 *   get:
 *     summary: Retrieves a paginated list of states.
 *     description: Fetches states with filtering, sorting, and pagination.
 *     tags:
 *       - States
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
 *         description: Search query (name or code).
 *       - in: query
 *         name: deleted
 *         schema:
 *           type: boolean
 *         description: Include deleted states (Admin only).
 *       - in: query
 *         name: country
 *         schema:
 *           type: string
 *         description: Filter by Country ID.
 *     responses:
 *       "200":
 *         description: List of states retrieved successfully
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
 *                             $ref: '#/components/schemas/States'
 *                         meta:
 *                           $ref: '#/components/schemas/Meta'
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
export const getStates = async (
	req: Request<
		{},
		FormatResponseObjectType<IStateDocument, HttpStatus["OK"]>,
		{},
		Partial<
			Pick<PaginateOptions, "sort" | "page" | "limit" | "offset" | "pagination"> & {
				q?: string;
				deleted?: boolean | number;
				country?: string;
			}
		>
	>,
	res: Response<FormatResponseObjectType<IStateDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Destructure the query parameters (req.query) into
	// q (search term), deleted (include deleted countries), country (id of country)
	const { q, deleted, country } = req.query || {};

	// Check if the query includes a deleted flag
	const isFilterByDeletedAllowed: boolean = "deleted" in req.query;

	// Check if the query includes a country id
	const isFilterByCountryAllowed: boolean = "country" in req.query;

	// List of fields to search for the query term
	const querySearchFields: string[] = ["name", "code"];

	// List of sort options
	const sort: SortItemType<"name" | "createdAt">[] = [
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
				...((isFilterByDeletedAllowed && { deleted: Boolean(deleted) }) || {}),
				// If the query includes a country id, filter states by country
				...((isFilterByCountryAllowed && { country }) || {}),
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
 * @openapi
 * /v1/states/{state}:
 *   get:
 *     summary: Retrieves a single state.
 *     description: Fetches a state by ID or slug. Requires Admin or SuperAdmin role.
 *     tags:
 *       - States
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: state
 *         required: true
 *         schema:
 *           type: string
 *         description: State ID or slug.
 *     responses:
 *       "200":
 *         description: State details retrieved successfully
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
 *                           $ref: '#/components/schemas/States'
 *       "401":
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       "404":
 *         description: State not found
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
export const getSingleState = async (
	req: Request<{ state: string }, FormatResponseObjectType<IStateDocument, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<IStateDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
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
 * @openapi
 * /v1/states/{state}:
 *   patch:
 *     summary: Updates a single state.
 *     description: Updates state details. Requires Admin or SuperAdmin role.
 *     tags:
 *       - States
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: state
 *         required: true
 *         schema:
 *           type: string
 *         description: State ID or slug.
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
 *               country:
 *                 type: string
 *                 description: Country ID
 *     responses:
 *       "200":
 *         description: State updated successfully
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
 *                           $ref: '#/components/schemas/States'
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
 *       "404":
 *         description: State or Country not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       "422":
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       "500":
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const updateSingleState = async (
	req: Request<
		{ state: string },
		FormatResponseObjectType<IStateDocument, HttpStatus["OK"]>,
		Partial<Pick<IState, "name" | "code" | "country">>
	>,
	res: Response<FormatResponseObjectType<IStateDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Attempt to find the country the state belongs to if country id exists in the request body,
	// If the country is not found or there is an error, pass the error to the next middleware
	if (req.body?.country) {
		const [countryError, country] = await to(
			Country.findOneWithDeleted({ _id: req.body.country })
		);
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
 * @openapi
 * /v1/states/{state}:
 *   delete:
 *     summary: Deletes a single state.
 *     description: Soft-deletes a state. Requires Admin or SuperAdmin role.
 *     tags:
 *       - States
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: state
 *         required: true
 *         schema:
 *           type: string
 *         description: State ID or slug.
 *     responses:
 *       "200":
 *         description: State deleted successfully
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
 *         description: State not found
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
export const deleteSingleState = async (
	req: Request<{ state: string }, FormatResponseObjectType<IStateDocument, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<IStateDocument, HttpStatus["OK"]>>,
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
	const [deleteStateError] = await to(State.deleteById(state._id, req.user._id));
	if (deleteStateError) return next(deleteStateError);

	// Flash success message and respond with success status
	req.flash("success", "Successfully Deleted.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};

/**
 * @openapi
 * /v1/states/{state}/restore:
 *   patch:
 *     summary: Restores a single state.
 *     description: Restores a soft-deleted state. Requires Admin or SuperAdmin role.
 *     tags:
 *       - States
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: state
 *         required: true
 *         schema:
 *           type: string
 *         description: State ID or slug.
 *     responses:
 *       "200":
 *         description: State restored successfully
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
 *         description: State not found
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
export const restoreSingleState = async (
	req: Request<{ state: string }, FormatResponseObjectType<IStateDocument, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<IStateDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
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
