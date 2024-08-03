import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body } from "express-validator";
import httpStatus from "http-status";
import Address, { type IAddressDocument } from "../models/Address";
import User from "../models/User";
import { formatResponseObject } from "../utils/helpers";
import vars from "../utils/vars";

export const _validator = (method: string) => {
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
				body("default").trim().escape().optional(),
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
	const isDefaultUpdate = "default" in req.body;
	let [addressError, address] = await to(
		Address.findOne({
			_id: req.params.address,
			...(req.user?.role === vars.auth.roles.user && { user: req.user._id }),
		})
	);
	if (addressError) return next(addressError);
	if (!address) return next();

	let addressesError = null;
	let addresses: IAddressDocument[] | undefined | null = [];

	if (isDefaultUpdate && !Boolean(req.body.default)) {
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

	if (isDefaultUpdate) {
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
export const deleteSingleAddress = async (req: Request, res: Response, next: NextFunction) => {};
