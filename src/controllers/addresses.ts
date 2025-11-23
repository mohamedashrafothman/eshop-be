import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body, ValidationChain } from "express-validator";
import createError from "http-errors";
import httpStatus, { HttpStatus } from "http-status";
import mongoose, { ClientSession, PaginateOptions } from "mongoose";
import IAddress from "../interfaces/Address.interface";
import Address, { IAddressDocument } from "../models/Address";
import City from "../models/City";
import Country from "../models/Country";
import ShippingMethod, { IShippingMethodDocument } from "../models/ShippingMethod";
import State from "../models/State";
import User from "../models/User";
import Zone from "../models/Zone";
import {
	formatResponseObject,
	handleTransactionError,
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
				body("street").trim().escape().notEmpty().withMessage("You must supply a street!"),
				body("building")
					.notEmpty()
					.withMessage("You must supply a building!")
					.isNumeric()
					.withMessage("Only Decimals allowed"),
				body("floor")
					.optional()
					.notEmpty()
					.withMessage("You must supply a floor!")
					.isNumeric()
					.withMessage("Only Decimals allowed"),
				body("apartment").optional().notEmpty().withMessage("You must supply a apartment!"),
				body("area").trim().escape().notEmpty().withMessage("You must supply a area!"),
				body("zip").trim().escape().optional(),
				body("country")
					.trim()
					.escape()
					.isMongoId()
					.withMessage("Invalid country id!")
					.notEmpty()
					.withMessage("You must supply a country!"),
				body("state")
					.trim()
					.escape()
					.isMongoId()
					.withMessage("Invalid state id!")
					.notEmpty()
					.withMessage("You must supply a state!"),
				body("city")
					.trim()
					.escape()
					.isMongoId()
					.withMessage("Invalid city id!")
					.notEmpty()
					.withMessage("You must supply a city!"),
				body("user")
					.trim()
					.escape()
					.isMongoId()
					.withMessage("Invalid user id!")
					.notEmpty()
					.withMessage("You must supply a user!"),
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
				body("street")
					.trim()
					.escape()
					.optional()
					.notEmpty()
					.withMessage("You must supply a street!"),
				body("building")
					.optional()
					.notEmpty()
					.withMessage("You must supply a building!")
					.isNumeric()
					.withMessage("Only Decimals allowed"),
				body("floor")
					.optional()
					.notEmpty()
					.withMessage("You must supply a floor!")
					.isNumeric()
					.withMessage("Only Decimals allowed"),
				body("apartment").optional().notEmpty().withMessage("You must supply a apartment!"),
				body("area")
					.trim()
					.escape()
					.optional()
					.notEmpty()
					.withMessage("You must supply a area!"),
				body("zip").trim().escape().optional(),
				body("default").isBoolean().optional(),
				body("country")
					.trim()
					.escape()
					.optional()
					.isMongoId()
					.withMessage("Invalid country id!")
					.notEmpty()
					.withMessage("You must supply a country!"),
				body("state")
					.trim()
					.escape()
					.optional()
					.isMongoId()
					.withMessage("Invalid state id!")
					.notEmpty()
					.withMessage("You must supply a state!"),
				body("city")
					.trim()
					.escape()
					.optional()
					.isMongoId()
					.withMessage("Invalid city id!")
					.notEmpty()
					.withMessage("You must supply a city!"),
			];
		default:
			return [];
	}
};

/**
 * @openapi
 * /v1/addresses:
 *   post:
 *     summary: Creates a new address entry in the database.
 *     description: |
 *       Creates an address inside a MongoDB transaction and links it to the specified user.
 *       Requires a valid bearer JWT. If the authenticated user has role `user`, their id must
 *       match the `user` field in the payload.
 *     tags:
 *       - Addresses
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
 *               - street
 *               - building
 *               - area
 *               - country
 *               - state
 *               - city
 *               - user
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 100
 *               street:
 *                 type: string
 *               building:
 *                 type: number
 *               floor:
 *                 type: number
 *               apartment:
 *                 type: string
 *               area:
 *                 type: string
 *               zip:
 *                 type: string
 *               country:
 *                 type: string
 *                 pattern: "^[a-fA-F0-9]{24}$"
 *               state:
 *                 type: string
 *                 pattern: "^[a-fA-F0-9]{24}$"
 *               city:
 *                 type: string
 *                 pattern: "^[a-fA-F0-9]{24}$"
 *               user:
 *                 type: string
 *                 pattern: "^[a-fA-F0-9]{24}$"
 *           example:
 *             name: "Home"
 *             street: "El Nasr St."
 *             building: 12
 *             floor: 3
 *             apartment: "3B"
 *             area: "Heliopolis"
 *             zip: "11511"
 *             country: "64b7f7f9a1d2c3e4f5a6b7c8"
 *             state: "64b7f8a0a1d2c3e4f5a6b7c9"
 *             city: "64b7f8c1a1d2c3e4f5a6b7ca"
 *             user: "64b7f8e2a1d2c3e4f5a6b7cb"
 *     responses:
 *       "201":
 *         description: Address created successfully.
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
 *                           $ref: '#/components/schemas/Addresses'
 *                     flashes:
 *                       $ref: '#/components/schemas/Flash'
 *       "400":
 *         description: Validation error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       "401":
 *         description: Unauthorized access or insufficient permissions.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       "404":
 *         description: Referenced country, state, city, or user not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       "500":
 *         description: Transaction failure or unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const postNewAddress = async (
	req: Request<
		{},
		FormatResponseObjectType<IAddressDocument, HttpStatus["CREATED"]>,
		Pick<
			IAddress,
			| "name"
			| "street"
			| "building"
			| "floor"
			| "apartment"
			| "area"
			| "zip"
			| "country"
			| "state"
			| "city"
			| "user"
		>
	>,
	res: Response<FormatResponseObjectType<IAddressDocument, HttpStatus["CREATED"]>>,
	next: NextFunction
): Promise<void> => {
	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	// Check if the user is authenticated and has permission to create a new address.
	// If the user is not authenticated or does not have permission,
	// Rollback the transaction and pass the error to the next middleware
	if (
		req.isUnauthenticated() ||
		!req.user ||
		([vars.auth.roles.user].includes(req.user.role) &&
			req.body.user !== req.user._id?.toString())
	) {
		handleTransactionError(session);
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	// Attempt to check if the country exists,
	// If the country is not found or there is an error,
	// Rollback the transaction and pass the error to the next middleware
	const [countryError, country] = await to(Country.findById({ _id: req.body.country }));
	if (countryError || !country) {
		handleTransactionError(session);
		return next(countryError);
	}

	// Attempt to check if the state exists,
	// If the state is not found or there is an error,
	// Rollback the transaction and pass the error to the next middleware
	const [stateError, state] = await to(State.findById({ _id: req.body.state }));
	if (stateError || !state) {
		handleTransactionError(session);
		return next(stateError);
	}

	// Attempt to check if the city exists,
	// If the city is not found or there is an error,
	// Rollback the transaction and pass the error to the next middleware
	const [cityError, city] = await to(City.findById({ _id: req.body.city }));
	if (cityError || !city) {
		handleTransactionError(session);
		return next(cityError);
	}

	// Attempt to check if the user exists,
	// If the user is not found or there is an error,
	// Rollback the transaction and pass the error to the next middleware
	const [userError, user] = await to(User.findById({ _id: req.body.user }).session(session));
	if (userError || !user) {
		handleTransactionError(session);
		return next(userError);
	}

	// Attempt to create the new address
	// If there is an error creating the address,
	// Rollback the transaction and pass the error to the next middleware
	const [createdAddressError, createdAddress] = await to(
		Address.create(
			[
				{
					name: req.body.name,
					street: req.body.street,
					building: req.body.building,
					area: req.body.area,
					country: country._id,
					state: state._id,
					city: city._id,
					user: req.body.user,
					default: Boolean(![...(user?.addresses || [])].length),
					...(req.body?.floor && { floor: req.body.floor }),
					...(req.body?.apartment && { apartment: req.body.apartment }),
					...(req.body?.zip && { zip: req.body.zip }),
				},
			],
			{ session }
		)
	);
	if (createdAddressError) {
		handleTransactionError(session);
		return next(createdAddressError);
	}

	// Attempt to update the user with the new address
	// If there is an error, rollback the transaction and pass the error to the next middleware
	const [updatedUserError] = await to(
		User.updateOne(
			{ _id: req.body.user },
			{ $addToSet: { addresses: createdAddress[0]._id } }
		).session(session)
	);
	if (updatedUserError) {
		handleTransactionError(session);
		return next(updatedUserError);
	}

	// Commit the transaction
	await session.commitTransaction();
	session.endSession();

	// Flash success message and return the created address in the response
	req.flash("success", "Address created successfully.");
	res.status(httpStatus.CREATED).json(
		formatResponseObject({
			status: httpStatus.CREATED,
			entities: { data: createdAddress[0] },
			flashes: req.flash(),
		})
	);
};

/**
 * @openapi
 * /v1/addresses:
 *   get:
 *     summary: Retrieves a paginated list of addresses.
 *     description: |
 *       Fetches addresses with optional filtering by name or street, supports pagination
 *       and sorting. Returns pagination metadata and available sort options.
 *     tags:
 *       - Addresses
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *         description: Field to sort by (e.g., name, createdAt).
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number to retrieve.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of addresses per page.
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *         description: Number of addresses to skip.
 *       - in: query
 *         name: pagination
 *         schema:
 *           type: boolean
 *         description: Enable or disable pagination.
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search term to filter addresses by name or street.
 *     responses:
 *       "200":
 *         description: Paginated list of addresses with metadata.
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
 *                             $ref: '#/components/schemas/Addresses'
 *                         meta:
 *                           $ref: '#/components/schemas/Meta'
 *       "500":
 *         description: Internal server error - failed to retrieve addresses.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const getAddresses = async (
	req: Request<
		{},
		FormatResponseObjectType<IAddressDocument, HttpStatus["OK"]>,
		{},
		Partial<
			Pick<PaginateOptions, "sort" | "page" | "limit" | "offset" | "pagination"> & {
				q?: string;
			}
		>
	>,
	res: Response<FormatResponseObjectType<IAddressDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Destructure the query parameters (req.query) into q (search term)
	const { q } = req.query || {};

	// List of fields to search for the query term
	const querySearchFields: string[] = ["name", "street"];

	// List of sort options
	const sort: SortItemType<"name" | "createdAt">[] = [
		{ name: "Name A-Z", value: { name: 1 } },
		{ name: "Name Z-A", value: { name: -1 } },
		{ name: "Created Date Ascending", value: { createdAt: 1 } },
		{ name: "Created Date Descending", value: { createdAt: -1 } },
	];

	// Attempt to retrieve the addresses using the given query and pagination options,
	// and if there was an error, return the error and end the request
	const [paginatedAddressesError, paginatedAddresses] = await to(
		Address.paginate<IAddressDocument>(
			{
				// If the query includes a search term, filter addresses by name or code
				...((q && {
					$or: querySearchFields.map((item) => ({
						[item]: { $regex: String(q).toLowerCase() || "", $options: "i" },
					})),
				}) ||
					{}),
				// If the user is authenticated, filter by user
				...((req.user && { user: req.user._id }) || {}),
			},
			{
				sort: {
					default: -1,
					...(("sort" in req.query &&
						typeof req.query.sort === "object" &&
						req.query.sort) ||
						{}),
				},
				...("page" in req.query && { page: Number(req.query.page) }),
				...("limit" in req.query && { limit: Number(req.query.limit) }),
				...("offset" in req.query && { offset: Number(req.query.offset) }),
				...("pagination" in req.query && { pagination: Boolean(req.query.pagination) }),
			}
		)
	);
	if (paginatedAddressesError) return next(paginatedAddressesError);

	// Destructure the paginated addresses into the list of addresses (docs) and pagination metadata
	const { docs, ...pagination } = paginatedAddresses;

	// Return the list of addresses, pagination metadata, and sort options in the response
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
 * /v1/addresses/{address}:
 *   get:
 *     summary: Retrieves a single address by its ID.
 *     description: |
 *       Fetches a single address using the provided ID. Requires authentication.
 *       If the user has role `user`, they can only retrieve their own addresses.
 *     tags:
 *       - Addresses
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *           pattern: "^[a-fA-F0-9]{24}$"
 *         description: The MongoDB ObjectId of the address to retrieve.
 *     responses:
 *       "200":
 *         description: Address retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     entities:
 *                       $ref: '#/components/schemas/Addresses'
 *       "401":
 *         description: Unauthorized - user not logged in or invalid credentials.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       "404":
 *         description: Address not found or user does not have access.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       "500":
 *         description: Internal server error - failed to retrieve the address.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const getSingleAddress = async (
	req: Request<{ address: string }, FormatResponseObjectType<IAddressDocument, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<IAddressDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Check if user logged in
	if (req.isUnauthenticated() || !req.user) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	// Retrieve the address ID from the request parameters
	const { address: addressIdentifier } = req.params || {};

	// Attempt to retrieve a address from the database with the given ID,
	// and if there was an error or no address was found, return the error and end the request
	const [addressError, address] = await to(
		Address.findOne({
			_id: addressIdentifier,
			...(req.user.role === vars.auth.roles.user && { user: req.user._id }),
		})
	);
	if (addressError || !address) return next(addressError);

	// Return the retrieved address in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: address },
		})
	);
};

/**
 * @openapi
 * /v1/addresses/{address}/shipping-methods:
 *   get:
 *     summary: Retrieves available shipping methods for a specific address.
 *     description: |
 *       Fetches shipping methods associated with the zone of the specified address.
 *       Requires authentication. Only returns methods for addresses belonging to the logged-in user.
 *     tags:
 *       - Addresses
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *           pattern: "^[a-fA-F0-9]{24}$"
 *         description: The ID of the address to retrieve shipping methods for.
 *     responses:
 *       "200":
 *         description: List of available shipping methods for the address.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     entities:
 *                       $ref: '#/components/schemas/Shipping-Methods'
 *       "401":
 *         description: Unauthorized - user not authenticated.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       "404":
 *         description: Address or zone not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       "500":
 *         description: Internal server error - failed to retrieve shipping methods.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const getSingleAddressShippingMethods = async (
	req: Request<
		{ address: string },
		FormatResponseObjectType<IShippingMethodDocument[], HttpStatus["OK"]>
	>,
	res: Response<FormatResponseObjectType<IShippingMethodDocument[], HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Check if user logged in
	if (req.isUnauthenticated() || !req.user) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	// Extract the address identifier from request parameters
	const { address: addressIdentifier } = req.params || {};

	// Attempt to retrieve an address from the database for logged in user,
	// and if there was an error, return the error and end the request
	const [addressError, address] = await to(
		Address.findOne({ _id: addressIdentifier, user: req.user._id })
	);
	if (addressError || !address)
		return next(addressError || new Error("No Shipping methods available."));

	// Attempt to retrieve a zone from the database for the address,
	// and if there was an error, return the error and end the request
	const [zoneError, zone] = await to(
		Zone.findOne({
			...(address.country && {
				countries: { $in: [address.country?._id || address.country] },
			}),
			...(address.state && { states: { $in: [address.state?._id || address.state] } }),
			...(address.city && { cities: { $in: [address.city?._id || address.city] } }),
		})
	);
	if (zoneError || !zone) return next(zoneError || new Error("No Shipping methods available."));

	// Attempt to retrieve shipping methods from the database for the zone,
	// and if there was an error, return the error and end the request
	const [shippingMethodsError, shippingMethods] = await to(
		ShippingMethod.find({ zone: zone._id })
	);
	if (shippingMethodsError) return next(shippingMethodsError);

	// Return the shipping methods data in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: shippingMethods },
			flashes: req.flash(),
		})
	);
};

/**
 * @openapi
 * /v1/addresses/{address}:
 *   patch:
 *     summary: Updates a single address.
 *     description: |
 *       Updates an address by ID. Requires authentication. Users with role `user` can only
 *       update their own addresses. Handles the `default` flag and ensures data integrity
 *       within a transaction.
 *     tags:
 *       - Addresses
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *           pattern: "^[a-fA-F0-9]{24}$"
 *         description: The ID of the address to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               street:
 *                 type: string
 *               building:
 *                 type: number
 *               floor:
 *                 type: number
 *               apartment:
 *                 type: string
 *               area:
 *                 type: string
 *               zip:
 *                 type: string
 *               country:
 *                 type: string
 *                 pattern: "^[a-fA-F0-9]{24}$"
 *               state:
 *                 type: string
 *                 pattern: "^[a-fA-F0-9]{24}$"
 *               city:
 *                 type: string
 *                 pattern: "^[a-fA-F0-9]{24}$"
 *               user:
 *                 type: string
 *                 pattern: "^[a-fA-F0-9]{24}$"
 *               default:
 *                 type: boolean
 *           example:
 *             name: "Office"
 *             street: "Tahrir St."
 *             building: 15
 *             floor: 5
 *             apartment: "5A"
 *             area: "Downtown"
 *             zip: "11512"
 *             country: "64b7f7f9a1d2c3e4f5a6b7c8"
 *             state: "64b7f8a0a1d2c3e4f5a6b7c9"
 *             city: "64b7f8c1a1d2c3e4f5a6b7ca"
 *             user: "64b7f8e2a1d2c3e4f5a6b7cb"
 *             default: true
 *     responses:
 *       "200":
 *         description: Address updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     entities:
 *                       $ref: '#/components/schemas/Addresses'
 *                     flashes:
 *                       $ref: '#/components/schemas/Flash'
 *       "400":
 *         description: Invalid request body.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       "401":
 *         description: Unauthorized access.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       "404":
 *         description: Address not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       "500":
 *         description: Internal server error - failed to update address.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const updateSingleAddress = async (
	req: Request<
		{ address: string },
		FormatResponseObjectType<IAddressDocument, HttpStatus["OK"]>,
		Partial<
			Pick<
				IAddress,
				| "name"
				| "street"
				| "building"
				| "floor"
				| "apartment"
				| "area"
				| "zip"
				| "country"
				| "state"
				| "city"
				| "user"
				| "default"
			>
		>
	>,
	res: Response<FormatResponseObjectType<IAddressDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	// Attempt to find the country the city belongs to if country id exists in the request body,
	// If the country is not found or there is an error, pass the error to the next middleware
	if (req.body?.country) {
		const [countryError, country] = await to(Country.findById({ _id: req.body.country }));
		if (countryError || !country) {
			handleTransactionError(session);
			return next(countryError);
		}
	}

	// Attempt to find the state the city belongs to if state id exists in the request body,
	// If the state is not found or there is an error, pass the error to the next middleware
	if (req.body?.state) {
		const [stateError, state] = await to(State.findById({ _id: req.body.state }));
		if (stateError || !state) {
			handleTransactionError(session);
			return next(stateError);
		}
	}

	// Attempt to find the city the address belongs to if city id exists in the request body,
	// If the city is not found or there is an error, pass the error to the next middleware
	if (req.body?.city) {
		const [cityError, city] = await to(City.findById({ _id: req.body.city }));
		if (cityError || !city) {
			handleTransactionError(session);
			return next(cityError);
		}
	}

	// Retrieve the address ID from the request parameters
	const { address: addressIdentifier } = req.params || {};

	// Check if the request body contains the default flag
	const isDefaultModified = "default" in req.body;

	// Attempt to retrieve the address from the database with the given ID,
	// and if there was an error or no address was found, return the error and end the request
	let [addressError, address] = await to(
		Address.findById({ _id: addressIdentifier }).session(session)
	);
	if (addressError || !address) {
		handleTransactionError(session);
		return next(addressError);
	}

	// Check if user logged in
	if (
		req.isUnauthenticated() ||
		!req.user ||
		([vars.auth.roles.user].includes(req.user.role) &&
			address.user?._id?.toString() !== req.user._id?.toString())
	) {
		handleTransactionError(session);
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	let addressesError: Error | null = null;
	let addresses: IAddressDocument[] | undefined | null = [];

	if (isDefaultModified && !Boolean(req.body.default)) {
		// Retrieve the addresses of the user
		[addressesError, addresses] = await to(
			Address.find({
				user: [vars.auth.roles.user].includes(req.user.role) ? req.user._id : address.user,
				_id: { $ne: addressIdentifier },
			}).session(session)
		);
		if (addressesError || !addresses?.length) {
			handleTransactionError(session);
			let error;
			if (!addresses?.length)
				error = createError(
					httpStatus.BAD_REQUEST,
					"Cannot set the only address to non-default"
				);
			return next(addressesError || (error && { ...(error || {}), status: error.status }));
		}
	}

	address = Object.assign(address, {
		...(req.body.name && { name: req.body.name }),
		...(req.body.street && { street: req.body.street }),
		...(req.body.building && { building: req.body.building }),
		...(req.body.floor && { floor: req.body.floor }),
		...(req.body.apartment && { apartment: req.body.apartment }),
		...(req.body.area && { area: req.body.area }),
		...(req.body.zip && { zip: req.body.zip }),
		...(req.body.country && { country: req.body.country }),
		...(req.body.state && { state: req.body.state }),
		...(req.body.city && { city: req.body.city }),
		...(req.body.user && { user: req.body.user }),
		...(isDefaultModified && { default: req.body.default }),
	});
	if (!address) {
		handleTransactionError(session);
		return next();
	}

	// Save the updated address object to the database, and if there is an error during saving,
	// pass the error to the next middleware
	const [saveError, newAddress] = await to(address.save({ session }));
	if (saveError) {
		handleTransactionError(session);
		return next(saveError);
	}

	if (isDefaultModified) {
		// Update the default flag of the other addresses of the user
		if (!Boolean(req.body.default)) {
			// Sort the addresses by the creation date in descending order
			const newDefaultAddress = [...(addresses || [])]?.sort(
				(a, b) => b?.createdAt.getTime() - a?.createdAt.getTime()
			)[0];
			// Update the default flag of the new default address
			const [newDefaultAddressError] = await to(
				Address.findOneAndUpdate(
					{ _id: newDefaultAddress._id },
					{ $set: { default: true } }
				).session(session)
			);
			if (newDefaultAddressError) {
				handleTransactionError(session);
				return next(newDefaultAddressError);
			}
		} else {
			// Update the default flag of all the addresses of the user to false
			const [updateManyError] = await to(
				Address.updateMany(
					{
						user: [vars.auth.roles.user].includes(req.user.role)
							? req.user._id
							: address.user,
						_id: { $ne: addressIdentifier },
					},
					{ $set: { default: false } }
				).session(session)
			);
			if (updateManyError) {
				handleTransactionError(session);
				return next(updateManyError);
			}
		}
	}

	// Commit the transaction
	await session.commitTransaction();
	session.endSession();

	// Flash success message and return the updated address data in the response
	req.flash("success", "successfully updated.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: newAddress },
			flashes: req.flash(),
		})
	);
};

/**
 * @openapi
 * /v1/addresses/{address}:
 *   delete:
 *     summary: Deletes a single address by its ID.
 *     description: |
 *       Deletes an address from the database using the provided ID. Requires authentication.
 *       Users with role `user` can only delete their own addresses. If the deleted address
 *       was the default, another address will automatically be set as default.
 *     tags:
 *       - Addresses
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *           pattern: "^[a-fA-F0-9]{24}$"
 *         description: The ID of the address to delete.
 *     responses:
 *       "200":
 *         description: Address deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     flashes:
 *                       $ref: '#/components/schemas/Flash'
 *       "400":
 *         description: Cannot delete the only address of the user.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       "401":
 *         description: Unauthorized access.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       "404":
 *         description: Address not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       "500":
 *         description: Internal server error - failed to delete address.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const deleteSingleAddress = async (
	req: Request<{ address: string }, FormatResponseObjectType<undefined, HttpStatus["OK"]>, {}>,
	res: Response<FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	// Extract the address identifier from request parameters
	const { address: addressIdentifier } = req.params || {};

	// Attempt to find the address by its ID, and if there is an error or no address is found,
	// pass the error to the next middleware
	let [addressError, address] = await to(
		Address.findOne({ _id: addressIdentifier }).session(session)
	);
	if (addressError || !address) {
		handleTransactionError(session);
		return next(addressError);
	}

	// Check if the user has permission to delete the address
	if (
		req.isUnauthenticated() ||
		!req.user ||
		([vars.auth.roles.user].includes(req.user.role) &&
			address.user.toString() !== req.user._id?.toString())
	) {
		handleTransactionError(session);
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	// Retrieve the user associated with the address
	const [userError, user] = await to(User.findOne({ _id: address.user }).session(session));
	if (userError || !user) {
		handleTransactionError(session);
		return next(userError);
	}

	// Get the rest of the user's addresses
	const restOfUserAddresses: IAddressDocument[] = [
		...((user.addresses as IAddressDocument[]).filter(
			(address) => address._id?.toString() !== addressIdentifier
		) || []),
	];

	// If there are no more addresses for the user, show an error message
	if (!restOfUserAddresses.length) {
		handleTransactionError(session);
		const error = createError(httpStatus.BAD_REQUEST, "Cannot delete the only address.");
		return next({ ...(error || {}), status: error.status });
	}

	// Attempt to delete the address, and if there is an error during the deletion,
	// pass the error to the next middleware
	const [deleteAddressError] = await to(
		Address.findOneAndDelete({ _id: address._id }).session(session)
	);
	if (deleteAddressError) {
		handleTransactionError(session);
		return next(deleteAddressError);
	}

	// If the deleted address was the default address, make the last added address the default
	// and update the deleted address to set the default flag to false
	if (address.default) {
		const [newDefaultAddress] = [...(restOfUserAddresses || [])]?.sort(
			(a, b) => b?.createdAt.getTime() - a?.createdAt.getTime()
		);

		const [newDefaultAddressError] = await to(
			Address.findOneAndUpdate(
				{ _id: newDefaultAddress._id },
				{ $set: { default: true } }
			).session(session)
		);
		if (newDefaultAddressError) {
			handleTransactionError(session);
			return next(newDefaultAddressError);
		}
	}

	// Commit the transaction
	await session.commitTransaction();
	session.endSession();

	// Flash success message and return the updated address data in the response
	req.flash("success", "Successfully Deleted.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};
