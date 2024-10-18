import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body, ValidationChain } from "express-validator";
import createError from "http-errors";
import httpStatus from "http-status";
import jsonwebtoken from "jsonwebtoken";
import mongoose from "mongoose";
import isMongoId from "validator/lib/isMongoId";
import Email from "../models/Email";
import Session from "../models/Session";
import Token from "../models/Token";
import User from "../models/User";
import emailService from "../services/email";
import { formatResponseObject, handleTransactionError } from "../utils/helpers";
import vars from "../utils/vars";

/**
 * Validates the input fields based on the method provided.
 */
export const validator = (method: "create" | "update"): ValidationChain[] => {
	switch (method) {
		case "create":
			return [
				body("email")
					.trim()
					.notEmpty()
					.withMessage("Email must supply an E-mail.")
					.isEmail()
					.withMessage("Email must be in an E-mail format.")
					.normalizeEmail({
						gmail_remove_dots: false,
						gmail_remove_subaddress: false,
						outlookdotcom_remove_subaddress: false,
						yahoo_remove_subaddress: false,
						icloud_remove_subaddress: false,
					}),
				body("name")
					.notEmpty()
					.withMessage("You must supply a name!")
					.trim()
					.escape()
					.isLength({ max: 100 })
					.withMessage("Name must be at most 100 characters long!"),
				body("password")
					.notEmpty()
					.withMessage("Password can't be blank!")
					.isLength({ min: 8 })
					.withMessage("Password must be at least 8 chars long")
					.isStrongPassword()
					.withMessage(
						"Password must include one lowercase character, one uppercase character, a number, and a special character."
					),
				body("passwordConfirmation")
					.notEmpty()
					.withMessage("Password confirmation can't be blank!")
					.custom((value, { req }) => value === req.body.password)
					.withMessage("Your passwords don't match!"),
				body("role")
					.optional()
					.isIn([vars.auth.roles.admin, vars.auth.roles.user])
					.withMessage("Invalid role"),
			];
		case "update":
			return [
				body("email")
					.trim()
					.optional()
					.notEmpty()
					.withMessage("Email must supply an E-mail.")
					.isEmail()
					.withMessage("Email must be in an E-mail format.")
					.normalizeEmail({
						gmail_remove_dots: false,
						gmail_remove_subaddress: false,
						outlookdotcom_remove_subaddress: false,
						yahoo_remove_subaddress: false,
						icloud_remove_subaddress: false,
					}),
				body("name")
					.trim()
					.optional()
					.notEmpty()
					.withMessage("You must supply a name!")
					.escape()
					.isLength({ max: 100 })
					.withMessage("Name must be at most 100 characters long!"),
				body("oldPassword")
					.if(body("password").exists())
					.notEmpty()
					.withMessage("Old Password can't be blank!")
					.isLength({ min: 8 })
					.withMessage("Password must be at least 8 chars long")
					.isStrongPassword()
					.withMessage(
						"Password must include one lowercase character, one uppercase character, a number, and a special character."
					),
				body("password")
					.if(body("oldPassword").exists())
					.notEmpty()
					.withMessage("Password can't be blank!")
					.isLength({ min: 8 })
					.withMessage("Password must be at least 8 chars long")
					.isStrongPassword()
					.withMessage(
						"Password must include one lowercase character, one uppercase character, a number, and a special character."
					),
				body("passwordConfirmation")
					.if(body("password").exists())
					.notEmpty()
					.withMessage("Password confirmation can't be blank!")
					.custom((value, { req }) => value === req.body.password)
					.withMessage("Your passwords don't match!"),
				body("logout").optional().toBoolean(),
			];
		default:
			return [];
	}
};

/**
 * @summary Creates a new user account.
 * @description Registers a new user with the provided information. A verification email will be sent to the provided email address.
 *
 * @param {Object} req - Express request object.
 * @param {String} req.body.email - User's email address (required).
 * @param {String} req.body.name - User's name (required).
 * @param {String} req.body.password - User's password (required).
 * @param {String} req.body.passwordConfirmation - User's password confirmation (required).
 * @param {String} req.body.role - User's role (optional, defaults to 'USER'). Valid roles include 'ADMIN', and 'USER'.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 201 - Created response containing the newly created user object (without password) and optional access tokens if not authenticated.
 *   * @property {Object} entities.data - The newly created user object.
 *      * @property {String} entities.data.accessToken - Access token (only included if not authenticated).
 *      * @property {String} entities.data.refreshToken - Refresh token (only included if not authenticated).
 *      * @property {String} entities.data.tokenType - Token type (only included if not authenticated, defaults to 'Bearer').
 */
export const postNewUser = async (req: Request, res: Response, next: NextFunction) => {
	// start transaction
	const session = await mongoose.startSession();
	session.startTransaction();

	const { email } = req.body;
	const [userError, existsUser] = await to(User.findOne({ email }).session(session));
	if (userError || existsUser) {
		handleTransactionError(session);
		let error;
		if (existsUser) error = createError(httpStatus.CONFLICT, "Account already exists!");
		return next(
			userError || (existsUser && error && { ...(error || {}), status: error.status }) || null
		);
	}

	const [createdUserError, createdUser] = await to(
		User.create([{ ...(req?.body || {}), active: true }], { session })
	);
	if (createdUserError) {
		handleTransactionError(session);
		return next(createdUserError);
	}

	const token = await createdUser[0].createHashToken();
	const [newVerifyEmailTokenError] = await to(
		Token.create(
			[
				{
					user: createdUser[0]._id,
					token,
					kind: vars.tokenTypes.verifyEmail,
					expireAt: Date.now() + 1000 * 60 * vars.email.emailVerifyTokenExpiresInMinutes,
				},
			],
			{ session }
		)
	);
	if (newVerifyEmailTokenError) {
		handleTransactionError(session);
		return next(newVerifyEmailTokenError);
	}

	const [sendEmailError, sendEmail] = await emailService.send({
		to: createdUser[0],
		from: vars.email.sender,
		filename: "verify-user",
		subject: `[${vars.app.name}] Verify User Account.`,
		actionUrl: `${vars.app.frontEndUrl}/auth/email/verify/${token}`,
	});
	if (sendEmailError) {
		handleTransactionError(session);
		return next(sendEmailError);
	}

	const [newEmailError] = await to(Email.create([sendEmail], { session }));
	if (newEmailError) {
		handleTransactionError(session);
		return next(newEmailError);
	}

	req.flash(
		"success",
		"Account created successfully, to verify the account check entered e-mail address."
	);

	let accessToken;
	let refreshToken;

	if (!req.isAuthenticated()) {
		accessToken = jsonwebtoken.sign(
			{ sub: createdUser[0]._id.toString(), iat: Math.floor(Date.now() / 1000) },
			vars.auth.strategies.jwt.accessTokenSecret,
			{ expiresIn: `${vars.auth.strategies.jwt.accessTokenExpiresInMinutes}m` }
		);
		refreshToken = jsonwebtoken.sign(
			{ sub: createdUser[0]._id.toString(), iat: Math.floor(Date.now() / 1000) },
			vars.auth.strategies.jwt.refreshTokenSecret,
			{ expiresIn: `${vars.auth.strategies.jwt.refreshTokenExpiresInDays} days` }
		);

		const [newRefreshTokenError] = await to(
			Token.create(
				[
					{
						user: createdUser[0]._id,
						token: refreshToken,
						kind: vars.tokenTypes.jwt,
						expireAt:
							Date.now() +
							1000 *
								60 *
								60 *
								24 *
								vars.auth.strategies.jwt.refreshTokenExpiresInDays,
					},
				],
				{ session }
			)
		);
		if (newRefreshTokenError) {
			handleTransactionError(session);
			return next(newRefreshTokenError);
		}
	}

	// commit the transaction
	await session.commitTransaction();
	session.endSession();

	res.status(httpStatus.CREATED).json(
		formatResponseObject({
			status: httpStatus.CREATED,
			entities: {
				data: {
					...(createdUser[0]?.toJSON() || {}),
					...(!req.isAuthenticated() ? { accessToken } : {}),
					...(!req.isAuthenticated() ? { refreshToken } : {}),
					...(!req.isAuthenticated()
						? { tokenType: vars.auth.strategies.jwt.tokenType }
						: {}),
				},
			},
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Retrieves a paginated list of users.
 * @description Fetches a list of users with pagination and filtering options. Excluded user (based on ID) can be specified in the request.
 *
 * @param {Object} req - Express request object.
 * @param {String} req.query.q - Search term to match against user name and email (case-insensitive).
 * @param {Boolean} req.query.emailVerified - Filter users by email verification status (true/false).
 * @param {Boolean} req.query.deleted - Filter users by deleted status (true/false).
 * @param {Boolean} req.query.active - Filter users by active status (true/false).
 * @param {Number} req.query.page - Page number for pagination (default: 1).
 * @param {Number} req.query.limit - Number of users per page (default: 10).
 * @param {String} req.query.offset - Number of users to skip (default: 0).
 * @param {String} req.query.sort - Sort option (available options: 'name:asc', 'name:desc', 'createdAt:asc', 'createdAt:desc').
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response containing a paginated list of users and sorting options.
 *   * @property {Object} entities.data - An array of user objects.
 *   * @property {Object} entities.meta - Meta information about the pagination and available sorting options.
 *     * @property {Number} entities.meta.pagination - An object containing the current page, total pages, and total results.
 *     * @property {array} entities.meta.sort - An array of available sorting options (see request parameter `sort`).
 */
export const getUsers = async (req: Request, res: Response, next: NextFunction) => {
	const { q, emailVerified, deleted, active, ...query } = req.query || {};
	const isFilteredByDeleted = "deleted" in req.query;
	const isFilteredByEmailVerified = "emailVerified" in req.query;
	const isFilteredByActive = "active" in req.query;
	const querySearchFields = ["name", "email"];
	const sort = [
		{ name: "Name A-Z", value: { name: 1 } },
		{ name: "Name Z-A", value: { name: -1 } },
		{ name: "Created Date Ascending", value: { createdAt: 1 } },
		{ name: "Created Date Descending", value: { createdAt: -1 } },
	];

	const [paginatedUsersError, paginatedUsers] = await to(
		User.paginate(
			{
				...((q && {
					$or: querySearchFields.map((item) => ({
						[item]: {
							$regex: String(q).toLowerCase() || "",
							$options: "i",
						},
					})),
				}) ||
					{}),
				...((isFilteredByActive && { active }) || {}),
				...((isFilteredByEmailVerified && { emailVerified }) || {}),
				...((isFilteredByDeleted && { deleted: Boolean(deleted) }) || {}),
				_id: { $ne: req?.user?._id || "" },
			},
			{ ...query }
		)
	);
	if (paginatedUsersError) return next(paginatedUsersError);

	const { docs, ...pagination } = paginatedUsers;

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
 * @summary Retrieves a single user.
 * @description Fetches a user based on the provided slug or ID.
 *
 * @param {Object} req - Express request object.
 * @param {String} req.params.user - User slug or ID.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response containing the user object.
 *   * @property {Object} entities.data - The user object.
 */
export const getSingleUser = async (req: Request, res: Response, next: NextFunction) => {
	const { user: userIdentifier } = req.params || {};
	const [userError, user] = await to(
		User.findOne({
			$or: [
				{ slug: userIdentifier },
				...(isMongoId(userIdentifier) ? [{ _id: userIdentifier }] : []),
			],
		})
	);
	if (userError) return next(userError);
	if (!user) return next();

	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: user },
		})
	);
};

/**
 * @summary Retrieves the currently authenticated user.
 * @description Fetches the user associated with the current authentication token.
 *
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response containing the user object.
 *   * @property {Object} entities.data - The user object.
 */
export const getCurrentAuthenticatedUser = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const _id = req?.user?._id || "";
	const [userError, user] = await to(User.findOne({ _id }));
	if (userError) return next(userError);
	if (!user) return next();

	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: user },
		})
	);
};

/**
 * @summary Updates a user.
 * @description Updates a user's profile information based on the provided data. Only the currently authenticated user can update their own profile.
 *
 * @param {Object} req - Express request object.
 * @param {String} req.params.user - User slug or ID.
 * @param {Object} req.body - Update data for the user.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response containing the updated user object and a success message.
 *   * @property {Object} entities.data - The updated user object.
 */
export const updateSingleUser = async (req: Request, res: Response, next: NextFunction) => {
	// start transaction
	const session = await mongoose.startSession();
	session.startTransaction();

	const { user: userIdentifier } = req.params || {};
	const {
		oldPassword: _oldPassword,
		passwordConfirmation: _passwordConfirmation,
		...reqBody
	} = req.body;
	let isPasswordModified;
	let isEmailModified;

	let [userError, user] = await to(
		User.findOne({
			$or: [
				{ slug: userIdentifier },
				...(isMongoId(userIdentifier) ? [{ _id: userIdentifier }] : []),
			],
		}).session(session)
	);
	if (userError || !user) {
		handleTransactionError(session);
		return next(userError);
	}

	if (reqBody?.email && user?.email) isEmailModified = reqBody.email !== user.email || false;
	if (reqBody?.password) {
		user.comparePassword(reqBody.password, (comparePasswordError, isMatch) => {
			if (comparePasswordError) {
				handleTransactionError(session);
				return next(comparePasswordError);
			}
			isPasswordModified = !isMatch;
		});
	}

	user = Object.assign(user, {
		...(reqBody || {}),
		...(isEmailModified ? { emailVerified: false } : {}),
	});
	if (!user) {
		handleTransactionError(session);
		return next();
	}

	const [saveError, newUser] = await to(user.save({ session }));
	if (saveError) {
		handleTransactionError(session);
		return next(saveError);
	}

	if (isEmailModified) {
		const token = await newUser.createHashToken();
		const [newVerifyEmailToken] = await to(
			Token.create(
				[
					{
						user: newUser._id,
						token,
						kind: vars.tokenTypes.verifyEmail,
						expireAt:
							Date.now() + 1000 * 60 * vars.email.emailVerifyTokenExpiresInMinutes,
					},
				],
				{ session }
			)
		);
		if (newVerifyEmailToken) {
			handleTransactionError(session);
			return next(newVerifyEmailToken);
		}

		const [sendEmailError, sendEmail] = await emailService.send({
			to: newUser,
			from: vars.email.sender,
			filename: "verify-user",
			subject: `[${vars.app.name}] Verify User Account.`,
			actionUrl: `${vars.app.frontEndUrl}/auth/email/verify/${token}`,
		});
		if (sendEmailError) {
			handleTransactionError(session);
			return next(sendEmailError);
		}

		const [newEmailError] = await to(Email.create([sendEmail], { session }));
		if (newEmailError) {
			handleTransactionError(session);
			return next(newEmailError);
		}
	}

	if (isPasswordModified) {
		const [sendEmailError, sendEmail] = await emailService.send({
			to: newUser,
			from: vars.email.sender,
			filename: "password-updated",
			subject: `[${vars.app.name}] Password Updated Successfully.`,
			siteName: vars.app.name,
		});
		if (sendEmailError) {
			handleTransactionError(session);
			return next(sendEmailError);
		}

		const [newEmailError] = await to(Email.create([sendEmail], { session }));
		if (newEmailError) {
			handleTransactionError(session);
			return next(newEmailError);
		}
	}

	// commit the transaction
	await session.commitTransaction();
	session.endSession();

	req.flash("success", "successfully updated.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: { ...(newUser?.toJSON() || {}) } },
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Deletes a single user.
 * @description Deletes a user based on the provided slug or ID, along with associated sessions and tokens. Only the currently authenticated user can delete their own account or other users with appropriate permissions.
 *
 * @param {Object} req - Express request object.
 * @param {String} req.params.user - User slug or ID.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with a success message.
 */
export const deleteSingleUser = async (req: Request, res: Response, next: NextFunction) => {
	// start transaction
	const session = await mongoose.startSession();
	session.startTransaction();

	const { user: userIdentifier } = req.params || {};

	const [userError, user] = await to(
		User.findOne({
			$or: [
				{ slug: userIdentifier },
				...(isMongoId(userIdentifier) ? [{ _id: userIdentifier }] : []),
			],
		}).session(session)
	);
	if (userError || !user) {
		handleTransactionError(session);
		return next(userError);
	}

	const [deleteUserError] = await to(User.deleteById(user?._id, req?.user?._id).session(session));
	if (deleteUserError) {
		handleTransactionError(session);
		return next(deleteUserError);
	}

	const [deleteSessionsError] = await to(
		Session.delete({ "session.passport.user._id": user?._id }).session(session)
	);
	if (deleteSessionsError) {
		handleTransactionError(session);
		return next(deleteSessionsError);
	}

	const [deleteTokenError] = await to(Token.delete({ user: user?._id }).session(session));
	if (deleteTokenError) {
		handleTransactionError(session);
		return next(deleteTokenError);
	}

	// commit the transaction
	await session.commitTransaction();
	session.endSession();

	req.flash("success", "Successfully Deleted.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Restores a single deleted user.
 * @description Restores a previously deleted user based on the provided slug or ID.
 *
 * @param {Object} req - Express request object.
 * @param {String} req.params.user - User slug or ID.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with a success message.
 */
export const restoreSingleUser = async (req: Request, res: Response, next: NextFunction) => {
	const { user: userIdentifier } = req.params || {};
	const singleUserQuery = {
		$or: [
			{ slug: userIdentifier },
			...(isMongoId(userIdentifier) ? [{ _id: userIdentifier }] : []),
		],
		deleted: true,
	};

	const [userError, user] = await to(User.findOneWithDeleted(singleUserQuery));
	if (userError) return next(userError);
	if (!user) return next();

	const [restoreUserError] = await to(User.restore(singleUserQuery));
	if (restoreUserError) return next(restoreUserError);

	req.flash("success", "Successfully Restored.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};
