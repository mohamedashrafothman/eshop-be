import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body, ValidationChain } from "express-validator";
import createError from "http-errors";
import httpStatus from "http-status";
import mongoose, { PaginateOptions } from "mongoose";
import Address, { type IAddressDocument } from "../models/Address";
import City from "../models/City";
import Country from "../models/Country";
import State from "../models/State";
import User from "../models/User";
import { formatResponseObject, handleTransactionError } from "../utils/helpers";
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
					.withMessage("Invalid country id!")
					.notEmpty()
					.withMessage("You must supply a state!"),
				body("city")
					.trim()
					.escape()
					.isMongoId()
					.withMessage("Invalid country id!")
					.notEmpty()
					.withMessage("You must supply a city!"),
				body("user")
					.trim()
					.escape()
					.isMongoId()
					.withMessage("Invalid country id!")
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
					.withMessage("Invalid country id!")
					.notEmpty()
					.withMessage("You must supply a state!"),
				body("city")
					.trim()
					.escape()
					.optional()
					.isMongoId()
					.withMessage("Invalid country id!")
					.notEmpty()
					.withMessage("You must supply a city!"),
			];
		default:
			return [];
	}
};

/**
 * @summary Creates a new address entry in the database.
 * @description Handles the creation of a new address entity using the data provided in the request body.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.body - The payload containing details for the new address entity.
 * @param {String} req.body.name - The name of the address.
 * @param {String} req.body.street - The street of the address.
 * @param {Number} [req.body.building] - The building number of the address.
 * @param {Number} [req.body.floor] - The floor number of the address.
 * @param {Number} req.body.apartment - The apartment number of the address.
 * @param {String} req.body.area - The area of the address.
 * @param {String} [req.body.zip] - The zip code of the address (optional).
 * @param {String} req.body.country - The ID of the country where the address is located.
 * @param {String} req.body.state - The ID of the state where the address is located.
 * @param {String} req.body.city - The ID of the city where the address is located.
 * @param {String} req.body.user - The ID of the user associated with the address.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {void} 201 - Success response with the created address entity.
 *   * @property {Object} entities.data - The newly created address entity.
 * @throws {Error} 401 - Returns an error if the user is unauthorized to create the address.
 * @throws {Error} 404 - Returns an error if the country, state, city, or user is not found.
 * @throws {Error} 500 - Returns an error if any issue occurs during the creation process or if the transaction fails.
 */
export const postNewAddress = async (
	req: Request<
		{},
		{},
		{
			name: string;
			street: string;
			building: number;
			floor?: number;
			apartment?: number;
			area: string;
			zip?: string;
			country: string;
			state: string;
			city: string;
			user: string;
		}
	>,
	res: Response,
	next: NextFunction
) => {
	// Start a transaction to ensure data integrity
	const session = await mongoose.startSession();
	session.startTransaction();

	// Check if the user is authenticated and has permission to create a new address.
	// If the user is not authenticated or does not have permission,
	// Rollback the transaction and pass the error to the next middleware
	if (
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
					...(req.body.floor && { floor: req.body.floor }),
					...(req.body.apartment && { apartment: req.body.apartment }),
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
	const [updatedUserError, _updatedUser] = await to(
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
			entities: { data: createdAddress },
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Retrieves a paginated list of addresses.
 * @description Fetches addresses based on query parameters. Supports filtering by name, street,
 * and deletion status. Also includes pagination and sorting options.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.query - The query parameters for filtering and pagination.
 * @param {String} [req.query.sort] - The field to sort by.
 * @param {Number} [req.query.page] - The page number to retrieve.
 * @param {Number} [req.query.limit] - The number of addresses to retrieve per page.
 * @param {String} [req.query.offset] - The number of addresses to skip.
 * @param {String} [req.query.pagination] - Enable or disable pagination.
 * @param {String} [req.query.q] - Search term for filtering addresses by name or street.
 * @param {Boolean} [req.query.deleted] - Flag to include deleted addresses.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with paginated addresses and metadata.
 *   * @property {Array} entities.data - List of retrieved address objects.
 *   * @property {Object} entities.meta.pagination - Pagination metadata (total docs, page, etc.).
 *   * @property {Array} entities.meta.sort - Available sort options for the addresses.
 * @throws {Error} 500 - Returns an error if the address retrieval fails.
 */
export const getAddresses = async (
	req: Request<
		{},
		{},
		{},
		Pick<PaginateOptions, "sort" | "page" | "limit" | "offset" | "pagination"> & {
			q?: string;
			deleted?: boolean | number;
		}
	>,
	res: Response,
	next: NextFunction
) => {
	// Destructure the query parameters (req.query) into
	// q (search term), deleted (include deleted countries), and query (pagination & sorting options)
	const { q, deleted, ...query } = req.query || {};

	// Check if the query includes a deleted flag
	const isFilteredByDeleted = "deleted" in req.query;

	// List of fields to search for the query term
	const querySearchFields = ["name", "street"];

	// List of sort options
	const sort: { name: string; value: object }[] = [
		{ name: "Name A-Z", value: { name: 1 } },
		{ name: "Name Z-A", value: { name: -1 } },
		{ name: "Created Date Ascending", value: { createdAt: 1 } },
		{ name: "Created Date Descending", value: { createdAt: -1 } },
	];

	// Attempt to retrieve the addresses using the given query and pagination options,
	// and if there was an error, return the error and end the request
	const [paginatedAddressesError, paginatedAddresses] = await to(
		Address.paginate(
			{
				// If the query includes a search term, filter addresses by name or code
				...((q && {
					$or: querySearchFields.map((item) => ({
						[item]: { $regex: String(q).toLowerCase() || "", $options: "i" },
					})),
				}) ||
					{}),
				// If the query includes a deleted flag, include deleted addresses
				...((isFilteredByDeleted && { deleted: Boolean(deleted) }) || {}),
				// If the user is authenticated, filter by user
				...((req.user && { user: req.user._id }) || {}),
			},
			{ ...query }
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
 * @summary Retrieves a single address by its ID.
 * @description Fetches a single address using the given ID from the request parameters.
 * Handles errors and returns the address data if found.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.params - URL parameters for the request.
 * @param {String} req.params.address - The address ID.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with the address data.
 *   * @property {Object} entities.data - The retrieved address object.
 * @throws {Error} 404 - Returns an error if no address is found.
 * @throws {Error} 500 - Returns an error if the address retrieval fails.
 */
export const getSingleAddress = async (
	req: Request<{ address: string }>,
	res: Response,
	next: NextFunction
) => {
	// Retrieve the address ID from the request parameters
	const { address: addressIdentifier } = req.params || {};

	// Attempt to retrieve a address from the database with the given ID,
	// and if there was an error or no address was found, return the error and end the request
	const [addressError, address] = await to(
		Address.findOne({
			_id: addressIdentifier,
			...(req.user?.role === vars.auth.roles.user && { user: req.user._id }),
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
 * @summary Updates a single address.
 * @description Updates an address based on the provided ID. The user must have permission to update the address.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.params - URL parameters for the request.
 * @param {String} req.params.address - The address ID.
 * @param {Object} req.body - Update data for the address.
 * @param {String} [req.body.name] - The updated name of the address.
 * @param {String} [req.body.street] - The updated street of the address.
 * @param {String} [req.body.building] - The updated building of the address.
 * @param {String} [req.body.floor] - The updated floor of the address.
 * @param {String} [req.body.apartment] - The updated apartment of the address.
 * @param {String} [req.body.area] - The updated area of the address.
 * @param {String} [req.body.zip] - The updated zip code of the address.
 * @param {String} [req.body.country] - The updated country of the address.
 * @param {String} [req.body.state] - The updated state of the address.
 * @param {String} [req.body.city] - The updated city of the address.
 * @param {String} [req.body.user] - The updated user of the address.
 * @param {Boolean} [req.body.default] - The updated default flag of the address.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with the updated address data.
 *   * @property {Object} entities.data - The updated address object.
 * @throws {Error} 400 - Returns an error if the request body is invalid.
 * @throws {Error} 401 - Returns an error if the user is not authorized to update the address.
 * @throws {Error} 404 - Returns an error if no address is found.
 * @throws {Error} 500 - Returns an error if the address update fails.
 */
export const updateSingleAddress = async (
	req: Request<
		{ address: string },
		{},
		{
			name?: string;
			street?: string;
			building?: number;
			floor?: number;
			apartment?: number;
			area?: string;
			zip?: string;
			country?: string;
			state?: string;
			city?: string;
			user?: string;
			default?: boolean;
		}
	>,
	res: Response,
	next: NextFunction
) => {
	// Start a transaction to ensure data integrity
	const session = await mongoose.startSession();
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

	// Check if the user is authorized to update the address
	if (
		req.user?.role === vars.auth.roles.user &&
		address.user?._id?.toString() !== req.user?._id?.toString()
	) {
		handleTransactionError(session);
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	let addressesError = null;
	let addresses: IAddressDocument[] | undefined | null = [];

	if (isDefaultModified && !Boolean(req.body.default)) {
		// Retrieve the addresses of the user
		[addressesError, addresses] = await to(
			Address.find({
				user: req.user?.role === vars.auth.roles.user ? req.user._id : address.user,
				_id: { $ne: addressIdentifier },
			}).session(session)
		);
		if (addressesError || !addresses?.length) {
			handleTransactionError(session);
			if (!addresses?.length)
				req.flash("danger", "Cannot set the only address to non-default");
			return next(addressesError);
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
						user: req.user?.role === vars.auth.roles.user ? req.user._id : address.user,
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
			entities: { data: { ...(newAddress?.toJSON() || {}) } },
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Deletes a single address by its ID.
 * @description This method deletes a single address from the database using the provided ID.
 * The method handles errors and returns a success response when the deletion is successful.
 *
 * @param {Object} req - Express request object.
 * @param {String} req.params.address - The ID of the address to delete.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response indicating the address was deleted.
 * @throws {Error} 404 - If no address is found with the provided identifier.
 * @throws {Error} 401 - If the user doesn't have permission to delete the address.
 * @throws {Error} 500 - If an error occurs during the deletion process.
 */
export const deleteSingleAddress = async (
	req: Request<{ address: string }>,
	res: Response,
	next: NextFunction
) => {
	// Start a transaction to ensure data integrity
	const session = await mongoose.startSession();
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
		req.user?.role === vars.auth.roles.user &&
		address.user?.toString() !== req.user?._id?.toString()
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
		req.flash("danger", "Cannot delete the only address.");
		return next();
	}

	// Attempt to delete the address, and if there is an error during the deletion,
	// pass the error to the next middleware
	const [deleteAddressError] = await to(
		Address.deleteById(address._id, req.user?._id).session(session)
	);
	if (deleteAddressError) {
		handleTransactionError(session);
		return next(deleteAddressError);
	}

	// If the deleted address was the default address, make the last added address the default
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
