import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body } from "express-validator";
import createError from "http-errors";
import httpStatus from "http-status";
import jsonwebtoken from "jsonwebtoken";
import Email from "../models/Email";
import Session from "../models/Session";
import Token from "../models/Token";
import User from "../models/User";
import emailService from "../services/email";
import { formatResponseObject } from "../utils/helpers";
import vars from "../utils/vars";

export const _validator = (method: string) => {
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
				body("name").notEmpty().withMessage("You must supply a name!").trim().escape(),
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
					.escape(),
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
 * @param {string} req.body.email - User's email address (required).
 * @param {string} req.body.name - User's name (required).
 * @param {string} req.body.password - User's password (required).
 * @param {string} req.body.passwordConfirmation - User's password confirmation (required).
 * @param {string} req.body.role - User's role (optional, defaults to 'USER'). Valid roles include 'ADMIN', and 'USER'.
 *
 * @returns {object} 201 - Created response containing the newly created user object (without password) and optional access tokens if not authenticated.
 *   * @property {object} entities.data - The newly created user object.
 *      * @property {string} entities.data.accessToken - Access token (only included if not authenticated).
 *      * @property {string} entities.data.refreshToken - Refresh token (only included if not authenticated).
 *      * @property {string} entities.data.tokenType - Token type (only included if not authenticated, defaults to 'Bearer').
 */
export const postNewUser = async (req: Request, res: Response, next: NextFunction) => {
	const { email } = req.body;
	const [userError, user] = await to(User.findOne({ email }));
	if (userError) return next(userError);
	if (user && Object.keys(user)?.length) {
		const error = createError(httpStatus.CONFLICT, "Account already exists!");
		return next({ ...(error || {}), status: error.status });
	}

	const [createdUserError, createdUser] = await to(
		User.create({ ...(req?.body || {}), active: true })
	);
	if (createdUserError) return next(createdUserError);

	const token = await createdUser.createHashToken();
	const [newVerifyEmailTokenError] = await to(
		Token.create({
			user: createdUser._id,
			token,
			kind: vars.tokenTypes.verifyEmail,
			expireAt: Date.now() + 1000 * 60 * vars.email.emailVerifyTokenExpiresInMinutes,
		})
	);
	if (newVerifyEmailTokenError) return next(newVerifyEmailTokenError);

	const [sendEmailError, sendEmail] = await emailService.send({
		to: createdUser,
		from: vars.email.sender,
		filename: "verify-user",
		subject: `[${vars.app.name}] Verify User Account.`,
		actionUrl: `${vars.app.frontEndUrl}/auth/email/verify/${token}`,
	});
	if (sendEmailError) return next(sendEmailError);

	const [newEmailError] = await to(Email.create(sendEmail));
	if (newEmailError) return next(newEmailError);

	req.flash(
		"success",
		"Account created successfully, to verify the account check entered e-mail address."
	);

	let accessToken;
	let refreshToken;

	if (!req.isAuthenticated()) {
		accessToken = jsonwebtoken.sign(
			{
				sub: createdUser._id.toString(),
				iat: Math.floor(Date.now() / 1000),
			},
			vars.auth.strategies.jwt.accessTokenSecret,
			{
				expiresIn: `${vars.auth.strategies.jwt.accessTokenExpiresInMinutes}m`,
			}
		);
		refreshToken = jsonwebtoken.sign(
			{
				sub: createdUser._id.toString(),
				iat: Math.floor(Date.now() / 1000),
			},
			vars.auth.strategies.jwt.refreshTokenSecret,
			{
				expiresIn: `${vars.auth.strategies.jwt.refreshTokenExpiresInDays}d`,
			}
		);

		const [newRefreshTokenError] = await to(
			Token.create({
				user: createdUser._id,
				token: refreshToken,
				kind: vars.tokenTypes.jwt,
				expireAt:
					Date.now() +
					1000 * 60 * 60 * 24 * vars.auth.strategies.jwt.refreshTokenExpiresInDays,
			})
		);
		if (newRefreshTokenError) return next(newRefreshTokenError);
	}

	res.status(httpStatus.CREATED).json(
		formatResponseObject({
			status: httpStatus.CREATED,
			entities: {
				data: {
					...(createdUser?.toJSON() || {}),
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
 * @param {string} req.query.q - Search term to match against user name and email (case-insensitive).
 * @param {boolean} req.query.emailVerified - Filter users by email verification status (true/false).
 * @param {boolean} req.query.deleted - Filter users by deleted status (true/false).
 * @param {boolean} req.query.active - Filter users by active status (true/false).
 * @param {number} req.query.page - Page number for pagination (default: 1).
 * @param {number} req.query.limit - Number of users per page (default: 10).
 * @param {string} req.query.offset - Number of users to skip (default: 0).
 * @param {string} req.query.sort - Sort option (available options: 'name:asc', 'name:desc', 'createdAt:asc', 'createdAt:desc').
 *
 * @returns {object} 200 - Success response containing a paginated list of users and sorting options.
 *   * @property {object} entities.data - An array of user objects.
 *   * @property {object} entities.meta - Meta information about the pagination and available sorting options.
 *     * @property {number} entities.meta.pagination - An object containing the current page, total pages, and total results.
 *     * @property {array} entities.meta.sort - An array of available sorting options (see request parameter `sort`).
 */
export const getUsers = async (req: Request, res: Response, next: NextFunction) => {
	const { q, emailVerified, deleted, active, ...query } = req.query || {};
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
				...((active && { active }) || {}),
				...((emailVerified && { emailVerified }) || {}),
				...((deleted && { deleted }) || {}),
				_id: { $ne: req?.user?._id || "" },
			},
			{ ...query }
		)
	);
	if (paginatedUsersError) return next(paginatedUsersError);

	const { docs, ...pagination } = paginatedUsers;

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
 * @summary Retrieves a single user.
 * @description Fetches a user based on the provided slug or ID.
 *
 * @param {Object} req - Express request object.
 * @param {string} req.params.user - User slug or ID.
 *
 * @returns {object} 200 - Success response containing the user object.
 *   * @property {object} entities.data - The user object.
 */
export const getSingleUser = async (req: Request, res: Response, next: NextFunction) => {
	const { user: userIdentifier } = req.params || {};
	const [userError, user] = await to(
		User.findOne({
			$or: [
				{ slug: userIdentifier },
				...(userIdentifier.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: userIdentifier }] : []),
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
 * @returns {object} 200 - Success response containing the user object.
 *   * @property {object} entities.data - The user object.
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
 * @param {string} req.params.user - User slug or ID.
 * @param {Object} req.body - Update data for the user.
 *
 * @returns {object} 200 - Success response containing the updated user object and a success message.
 *   * @property {object} entities.data - The updated user object.
 */
export const updateSingleUser = async (req: Request, res: Response, next: NextFunction) => {
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
				...(userIdentifier.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: userIdentifier }] : []),
			],
		})
	);
	if (userError) return next(userError);
	if (!user) return next();

	if (reqBody?.email && user?.email) isEmailModified = reqBody.email !== user.email || false;
	if (reqBody?.password) {
		user.comparePassword(reqBody.password, (comparePasswordError, isMatch) => {
			if (comparePasswordError) return next(comparePasswordError);
			isPasswordModified = !isMatch;
		});
	}

	user = Object.assign(user, {
		...(reqBody || {}),
		...(isEmailModified ? { emailVerified: false } : {}),
	});
	if (!user) return next();

	const [saveError, newUser] = await to(user.save());
	if (saveError) return next(saveError);

	if (isEmailModified) {
		const token = await newUser.createHashToken();
		const [newVerifyEmailToken] = await to(
			Token.create({
				user: newUser._id,
				token,
				kind: vars.tokenTypes.verifyEmail,
				expireAt: Date.now() + 1000 * 60 * vars.email.emailVerifyTokenExpiresInMinutes,
			})
		);
		if (newVerifyEmailToken) return next(newVerifyEmailToken);

		const [sendEmailError, sendEmail] = await emailService.send({
			to: newUser,
			from: vars.email.sender,
			filename: "verify-user",
			subject: `[${vars.app.name}] Verify User Account.`,
			actionUrl: `${vars.app.frontEndUrl}/auth/email/verify/${token}`,
		});
		if (sendEmailError) return next(sendEmailError);

		const [newEmailError] = await to(Email.create(sendEmail));
		if (newEmailError) return next(newEmailError);
	}

	if (isPasswordModified) {
		const [sendEmailError, sendEmail] = await emailService.send({
			to: newUser,
			from: vars.email.sender,
			filename: "password-updated",
			subject: `[${vars.app.name}] Password Updated Successfully.`,
			siteName: vars.app.name,
		});
		if (sendEmailError) return next(sendEmailError);

		const [newEmailError] = await to(Email.create(sendEmail));
		if (newEmailError) return next(newEmailError);
	}

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
 * @param {string} req.params.user - User slug or ID.
 *
 * @returns {object} 200 - Success response with a success message.
 */
export const deleteSingleUser = async (req: Request, res: Response, next: NextFunction) => {
	const { user: userIdentifier } = req.params || {};

	const [userError, user] = await to(
		User.findOne({
			$or: [
				{ slug: userIdentifier },
				...(userIdentifier.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: userIdentifier }] : []),
			],
		})
	);
	if (userError) return next(userError);
	if (!user) return next();

	const [deleteUserError] = await to(User.deleteById(user?._id, req?.user?.id));
	if (deleteUserError) return next(deleteUserError);

	const [deleteSessionsError] = await to(
		Session.delete({ "session.passport.user._id": user?._id })
	);
	if (deleteSessionsError) return next(deleteSessionsError);

	const [deleteTokenError] = await to(Token.delete({ user: user?._id }));
	if (deleteTokenError) return next(deleteTokenError);

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

 * @param {Object} req - Express request object.
 * @param {string} req.params.user - User slug or ID.

 * @returns {object} 200 - Success response with a success message.
 */
export const restoreSingleUser = async (req: Request, res: Response, next: NextFunction) => {
	const { user: userIdentifier } = req.params || {};
	const singleUserQuery = {
		$or: [
			{ slug: userIdentifier },
			...(userIdentifier.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: userIdentifier }] : []),
		],
	};

	const [userError, user] = await to(User.findOneWithDeleted(singleUserQuery));
	if (userError) return next(userError);
	if (!user) return next();

	const [restoreUserError] = await to(User.restore(singleUserQuery));
	if (restoreUserError) return next(restoreUserError);

	req.flash("success", "Successfully Restored.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			flashes: req.flash(),
		})
	);
};
