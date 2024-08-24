import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body } from "express-validator";
import createError from "http-errors";
import httpStatus from "http-status";
import Address, { type IAddressDocument } from "../models/Address";
import User from "../models/User";
import { formatResponseObject } from "../utils/helpers";
import vars from "../utils/vars";

export const validator = (method: string) => {
	switch (method) {
		case "create":
			return [
				body("name").trim().escape().notEmpty().withMessage("You must supply a name!"),
				body("street").trim().escape().notEmpty().withMessage("You must supply a street!"),
				body("building")
					.notEmpty()
					.withMessage("You must supply a building!")
					.isNumeric()
					.withMessage("Only Decimals allowed"),
				body("floor")
					.notEmpty()
					.withMessage("You must supply a floor!")
					.isNumeric()
					.withMessage("Only Decimals allowed"),
				body("apartment")
					.notEmpty()
					.withMessage("You must supply a apartment!")
					.isNumeric()
					.withMessage("Only Decimals allowed"),
				body("area").trim().escape().notEmpty().withMessage("You must supply a area!"),
				body("country")
					.trim()
					.escape()
					.notEmpty()
					.withMessage("You must supply a country!"),
				body("city").trim().escape().notEmpty().withMessage("You must supply a city!"),
				body("zip").trim().escape().optional(),
				body("user").trim().escape().notEmpty().withMessage("You must supply a user!"),
			];
		case "update":
			return [
				body("name")
					.trim()
					.escape()
					.optional()
					.notEmpty()
					.withMessage("You must supply a name!"),
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
				body("apartment")
					.optional()
					.notEmpty()
					.withMessage("You must supply a apartment!")
					.isNumeric()
					.withMessage("Only Decimals allowed"),
				body("area")
					.trim()
					.escape()
					.optional()
					.notEmpty()
					.withMessage("You must supply a area!"),
				body("country")
					.optional()
					.trim()
					.escape()
					.notEmpty()
					.withMessage("You must supply a country!"),
				body("city")
					.trim()
					.escape()
					.optional()
					.notEmpty()
					.withMessage("You must supply a city!"),
				body("zip").trim().escape().optional(),
				body("default").isBoolean().optional(),
			];
		default:
			return [];
	}
};

/**
 * @summary Creates a new address for the authenticated user.
 * @description Creates a new address for the authenticated user, setting it as the default address if it's the first address.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.body - Address data.
 *
 * @returns {object} 201 - Created response with the newly created address.
 *   * @property {object} entities.data - The created address object.
 */
export const postNewAddress = async (req: Request, res: Response, next: NextFunction) => {
	if (req.user?.role === vars.auth.roles.user && req.body.user !== req.user?._id?.toString()) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	const [userError, user] = await to(User.findOne({ _id: req.body.user }));
	if (userError) return next(userError);
	if (!user) return next();

	const [createdAddressError, createdAddress] = await to(
		Address.create({
			...(req?.body || {}),
			default: Boolean(![...(user?.addresses || [])].length),
		})
	);
	if (createdAddressError) return next(createdAddressError);

	const [updatedUserError, _updatedUser] = await to(
		User.updateOne({ _id: req.body.user }, { $addToSet: { addresses: createdAddress?._id } })
	);
	if (updatedUserError) return next(updatedUserError);

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
 * @description Fetches addresses based on provided query parameters and filters them based on user permissions.
 *        Optionally searches by address name or street, filters by deleted status, and sorts based on various criteria.
 *
 * @param {Object} req - Express request object.
 * @param {string} req.query.q - Optional search query string to match against address name or street (case-insensitive).
 * @param {boolean} req.query.deleted - Optional flag to filter addresses by deleted status (true for deleted, false or omitted for active).
 * @param {Object} req.query - Additional query parameters for pagination (e.g., page, limit, sort).
 * @property {number} req.page - The page number to retrieve.
 * @property {number} req.limit - The number of addresses per page.
 * @property {string} req.offset - The number of addresses to skip.
 * @property {string} req.sort - The sort order of the addresses (e.g., name, createdAt).
 *
 * @returns {object} 200 - Success response with a list of addresses and pagination meta information.
 */
export const getAddresses = async (req: Request, res: Response, next: NextFunction) => {
	const { q, deleted, ...query } = req.query || {};
	const isFilteredByDeleted = "deleted" in req.query;
	const querySearchFields = ["name", "street"];
	const sort = [
		{ name: "Name A-Z", value: { name: 1 } },
		{ name: "Name Z-A", value: { name: -1 } },
		{ name: "Created Date Ascending", value: { createdAt: 1 } },
		{ name: "Created Date Descending", value: { createdAt: -1 } },
	];

	const [paginatedAddressesError, paginatedAddresses] = await to(
		Address.paginate(
			{
				...((q && {
					$or: querySearchFields.map((item) => ({
						[item]: { $regex: String(q).toLowerCase() || "", $options: "i" },
					})),
				}) ||
					{}),
				...((isFilteredByDeleted && { deleted }) || {}),
				user: { $ne: req?.user?._id || "" },
			},
			{ ...query }
		)
	);
	if (paginatedAddressesError) return next(paginatedAddressesError);

	const { docs, ...pagination } = paginatedAddresses;

	return res.status(httpStatus.OK).json(
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
 * @summary Retrieves a single address.
 * @description Fetches an address based on the provided ID. If the user is authenticated, the address must belong to the user.
 *
 * @param {Object} req - Express request object.
 * @param {string} req.params.address - The address ID.
 *
 * @returns {object} 200 - Success response containing the address object.
 *   * @property {object} entities.data - The address object.
 */
export const getSingleAddress = async (req: Request, res: Response, next: NextFunction) => {
	const [addressError, address] = await to(
		Address.findOne({
			_id: req.params.address,
			...(req.user?.role === vars.auth.roles.user && { user: req.user._id }),
		})
	);
	if (addressError) return next(addressError);
	if (!address) return next();

	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: address },
		})
	);
};

/**
 * @summary Updates a single address.
 * @description Updates an address based on the provided ID. If the user is authenticated, the address must belong to the user.
 *        Optionally sets the updated address as the default address if the `default` property is set to `true` in the request body.
 *
 * @param {Object} req - Express request object.
 * @param {string} req.params.address - The address ID.
 * @param {Object} req.body - Update data for the address.
 *
 * @returns {object} 200 - Success response with the updated address data.
 *   * @property {object} entities.data - The updated address object.
 */
export const updateSingleAddress = async (req: Request, res: Response, next: NextFunction) => {
	const isDefaultModified = "default" in req.body;
	let [addressError, address] = await to(Address.findOne({ _id: req.params.address }));
	if (addressError) return next(addressError);
	if (!address) return next();

	if (
		req.user?.role === vars.auth.roles.user &&
		address.user?.toString() !== req.user?._id?.toString()
	) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	let addressesError = null;
	let addresses: IAddressDocument[] | undefined | null = [];

	if (isDefaultModified && !Boolean(req.body.default)) {
		[addressesError, addresses] = await to(
			Address.find({
				user: req.user?.role === vars.auth.roles.user ? req.user._id : address.user,
				_id: { $ne: req.params.address },
			})
		);
		if (addressesError) return next(addressesError);
		if (addresses?.length === 0) {
			req.flash("danger", "Cannot set the only address to non-default");
			return next();
		}
	}

	address = Object.assign(address, { ...(req.body || {}) });
	if (!address) return next();

	const [saveError, newAddress] = await to(address.save());
	if (saveError) return next(saveError);

	if (isDefaultModified) {
		if (!Boolean(req.body.default)) {
			const newDefaultAddress = [...(addresses || [])]?.sort(
				(a, b) => b?.createdAt.getTime() - a?.createdAt.getTime()
			)[0];

			const [newDefaultAddressError] = await to(
				Address.findOneAndUpdate(
					{ _id: newDefaultAddress._id },
					{ $set: { default: true } }
				)
			);
			if (newDefaultAddressError) return next(newDefaultAddressError);
		} else {
			const [updateManyError] = await to(
				Address.updateMany(
					{
						user: req.user?.role === vars.auth.roles.user ? req.user._id : address.user,
						_id: { $ne: req.params.address },
					},
					{ $set: { default: false } }
				)
			);
			if (updateManyError) return next(updateManyError);
		}
	}

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
 * @summary Deletes a single address.
 * @description Deletes an address based on the provided ID. The user must have permission to delete the address.
 *
 * @param {Object} req - Express request object.
 * @param {string} req.params.address - The address ID.
 *
 * @returns {object} 200 - Success response with a success message.
 */
export const deleteSingleAddress = async (req: Request, res: Response, next: NextFunction) => {
	let [addressError, address] = await to(Address.findOne({ _id: req.params.address }));
	if (addressError) return next(addressError);
	if (!address) return next();

	if (
		req.user?.role === vars.auth.roles.user &&
		address.user?.toString() !== req.user?._id?.toString()
	) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	const [userError, user] = await to(User.findOne({ _id: address.user }));
	if (userError) return next(userError);
	if (!user) return next();

	let restOfUserAddresses: IAddressDocument[] = [
		...((user.addresses as IAddressDocument[]).filter(
			(address) => address._id?.toString() !== req.params.address
		) || []),
	];

	if (restOfUserAddresses.length === 0) {
		req.flash("danger", "Cannot delete the only address.");
		return next();
	}

	const [deleteAddressError] = await to(Address.deleteById(address?._id, req?.user?.id));
	if (deleteAddressError) return next(deleteAddressError);

	if (address.default) {
		const newDefaultAddress = [...(restOfUserAddresses || [])]?.sort(
			(a, b) => b?.createdAt.getTime() - a?.createdAt.getTime()
		)[0];

		const [newDefaultAddressError] = await to(
			Address.findOneAndUpdate({ _id: newDefaultAddress._id }, { $set: { default: true } })
		);
		if (newDefaultAddressError) return next(newDefaultAddressError);
	}

	req.flash("success", "Successfully Deleted.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};
