import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body, ValidationChain } from "express-validator";
import createError from "http-errors";
import httpStatus, { HttpStatus } from "http-status";
import jsonwebtoken from "jsonwebtoken";
import mongoose, { ClientSession, PaginateOptions } from "mongoose";
import isMongoId from "validator/lib/isMongoId";
import IUser from "../interfaces/User.interface";
import Email from "../models/Email";
import Session from "../models/Session";
import Token from "../models/Token";
import User, { IUserDocument } from "../models/User";
import emailService from "../services/email";
import {
	createHashToken,
	formatResponseObject,
	FormatResponseObjectType,
	handleTransactionError,
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
			];
		default:
			return [];
	}
};

/**
 * @summary Creates a new user in the system.
 * @description Handles the creation of a new user in the system.
 * If the user is not authenticated, creates access and refresh tokens.
 * Sends an email with the verification token to the user.
 * Creates the new user in the database and related email and token records.
 * Commits the transaction and returns a success response.
 *
 * @param {Request} req - Express request object.
 * @param {Response} res - Express response object.
 * @param {Object} req.body - The data for creating a new user.
 * @param {NextFunction} next - Express next middleware function to handle errors.
 *
 * @returns {void} 201 - Success response with the created user entity.
 *   * @property {Object} entities.data - The created user object.
 *   * @property {Object} [entities.data.accessToken] - The user's access token.
 *   * @property {Object} [entities.data.refreshToken] - The user's refresh token.
 *   * @property {Object} [entities.data.tokenType] - The token type.
 *   * @property {Array} flashes - Success message for new user creation.
 * @throws {Error} 401 - Returns an error if the user is not authorized to create a user.
 * @throws {Error} 500 - Returns an error if any issue occurs during the creation process.
 */
export const postNewUser = async (
	req: Request<
		{},
		FormatResponseObjectType<
			IUserDocument & {
				accessToken?: string;
				refreshToken?: string;
				tokenType?: typeof vars.auth.strategies.jwt.tokenType;
			},
			HttpStatus["CREATED"]
		>,
		Pick<IUser, "email" | "name" | "password"> & {
			passwordConfirmation: string;
			role?: IUser["role"];
		}
	>,
	res: Response<
		FormatResponseObjectType<
			IUserDocument & {
				accessToken?: string;
				refreshToken?: string;
				tokenType?: typeof vars.auth.strategies.jwt.tokenType;
			},
			HttpStatus["CREATED"]
		>
	>,
	next: NextFunction
): Promise<void> => {
	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	// Get email value from the request body.
	const { email } = req.body;

	// Check if user already exists, if so, or if there is an error,
	// rollback the transaction and pass the error to the next middleware
	const [userError, existsUser] = await to(User.findOne({ email }).session(session));
	if (userError || existsUser) {
		handleTransactionError(session);
		let error;
		if (existsUser) error = createError(httpStatus.CONFLICT, "Account already exists!");
		return next(
			userError || (existsUser && error && { ...(error || {}), status: error.status })
		);
	}

	// Attempt to create the new user
	// If there is an error creating the user,
	// Rollback the transaction and pass the error to the next middleware
	const [createdUserError, createdUser] = await to(
		User.create(
			[
				{
					email,
					name: req.body.name,
					password: req.body.password,
					active: true,
					...(req.body?.role && { role: req.body.role }),
				},
			],
			{ session }
		)
	);
	if (createdUserError) {
		handleTransactionError(session);
		return next(createdUserError);
	}

	// Attempt to create a new email verification token
	// If there is an error creating the token,
	// Rollback the transaction and pass the error to the next middleware
	const token = createHashToken();
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

	// Attempt to send an email using the email service send method
	// If there is an error sending the email,
	// rollback the transaction and pass the error to the next middleware
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

	// Attempt to create a new email
	// If there is an error creating the email,
	// Rollback the transaction and pass the error to the next middleware
	const [newEmailError] = await to(Email.create([sendEmail], { session }));
	if (newEmailError) {
		handleTransactionError(session);
		return next(newEmailError);
	}

	// Create variables to hold the created access and refresh tokens
	let accessToken: string | undefined;
	let refreshToken: string | undefined;

	// Create access and refresh tokens if the user is not authenticated to register a new user.
	if (req.isUnauthenticated()) {
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

	// Add access and refresh tokens to the created user object
	const newCreatedUser = Object.assign(createdUser[0], {
		...(accessToken || refreshToken
			? {
					...(accessToken && { accessToken }),
					...(refreshToken && { refreshToken }),
					tokenType: vars.auth.strategies.jwt.tokenType,
				}
			: {}),
	});

	// Commit the transaction
	await session.commitTransaction();
	session.endSession();

	// Flash success message and respond with success status
	req.flash(
		"success",
		"Account created successfully, to verify the account check entered e-mail address."
	);
	res.status(httpStatus.CREATED).json(
		formatResponseObject({
			status: httpStatus.CREATED,
			entities: { data: newCreatedUser },
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
export const getUsers = async (
	req: Request<
		{},
		FormatResponseObjectType<IUserDocument, HttpStatus["OK"]>,
		{},
		Partial<
			Pick<PaginateOptions, "sort" | "page" | "limit" | "offset" | "pagination"> & {
				q?: string;
				deleted?: boolean | number;
				emailVerified?: boolean | number;
				active?: boolean | number;
			}
		>
	>,
	res: Response<FormatResponseObjectType<IUserDocument, HttpStatus["OK"]>>,
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

	// Destructure the query parameters (req.query) into
	// q (search term), emailVerified (filter by email verification status),
	// deleted(include deleted countries), active (filter by active status),
	// and query(pagination & sorting options)
	const { q, emailVerified, deleted, active } = req.query || {};

	// Check if the query includes a deleted flag
	const isFilterByDeletedAllowed = "deleted" in req.query;

	// Check if the query includes a emailVerified flag
	const isFilterByEmailVerificationAllowed = "emailVerified" in req.query;

	// Check if the query includes a active flag
	const isFilterByActiveAllowed = "active" in req.query;

	// List of fields to search for the query term
	const querySearchFields: string[] = ["name", "email"];

	// List of sort options
	const sort: SortItemType<"name" | "createdAt">[] = [
		{ name: "Name A-Z", value: { name: 1 } },
		{ name: "Name Z-A", value: { name: -1 } },
		{ name: "Created Date Ascending", value: { createdAt: 1 } },
		{ name: "Created Date Descending", value: { createdAt: -1 } },
	];

	// Attempt to retrieve the users using the given query and pagination options,
	// and if there was an error, return the error and end the request
	const [paginatedUsersError, paginatedUsers] = await to(
		User.paginate<IUserDocument>(
			{
				// If the query includes a search term, filter users by name or code
				...((q && {
					$or: querySearchFields.map((item) => ({
						[item]: {
							$regex: String(q).toLowerCase() || "",
							$options: "i",
						},
					})),
				}) ||
					{}),
				// If the query includes a active flag, include active users
				...((isFilterByActiveAllowed && { active }) || {}),
				// If the query includes a emailVerified flag, include deleted users
				...((isFilterByEmailVerificationAllowed && { emailVerified }) || {}),
				// If the query includes a emailVerified flag, include deleted users
				...((isFilterByDeletedAllowed && { deleted: Boolean(deleted) }) || {}),
				// Exclude the current user
				_id: { $ne: req.user._id || "" },
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
	if (paginatedUsersError) return next(paginatedUsersError);

	// Destructure the paginated users into the list of users (docs) and pagination metadata
	const { docs, ...pagination } = paginatedUsers;

	// Return the list of users, pagination metadata, and sort options in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: [...(docs || [])], meta: { pagination, sort } },
		})
	);
};

/**
 * @summary Retrieves a single user by identifier.
 * @description Fetches a user based on the provided identifier, which can be either a slug or an ObjectId.
 * Handles errors and returns the user data if found.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.params - URL parameters for the request.
 * @param {String} req.params.user - The user identifier, either a slug or an ObjectId.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with the user data.
 *   * @property {Object} entities.data - The retrieved user object.
 * @throws {Error} 500 - Returns an error if the user retrieval fails.
 * @throws {Error} 404 - Returns an error if no user is found.
 */
export const getSingleUser = async (
	req: Request<{ user: string }, FormatResponseObjectType<IUserDocument, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<IUserDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Retrieve the user ID or slug from the request parameters
	const { user: userIdentifier } = req.params || {};

	// Attempt to retrieve a user from the database with the given ID or slug,
	// and if there was an error or no user was found, return the error and end the request
	const [userError, user] = await to(
		User.findOneWithDeleted({
			$or: [
				{ slug: userIdentifier },
				...(isMongoId(userIdentifier) ? [{ _id: userIdentifier }] : []),
			],
		})
	);
	if (userError || !user) return next(userError);

	// Return the retrieved user in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, entities: { data: user } })
	);
};

/**
 * @summary Retrieves the currently authenticated user.
 * @description Fetches the user associated with the current authentication token.
 * Handles errors and returns the user data if found.
 *
 * @param {Object} req - Express request object containing user details.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with the user data.
 *   * @property {Object} entities.data - The retrieved user object.
 * @throws {Error} 401 - Returns an error if the user is not authenticated.
 * @throws {Error} 500 - Returns an error if the user retrieval fails.
 */
export const getCurrentAuthenticatedUser = async (
	req: Request<{}, FormatResponseObjectType<IUserDocument, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<IUserDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Check if user logged in
	if (req.isUnauthenticated() || !req.user) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	// Attempt to retrieve the user associated with the current authentication token,
	// and if there was an error or no user was found, return the error and end the request
	const [userError, user] = await to(User.findOne({ _id: req.user._id }));
	if (userError || !user) return next(userError);

	// Return the retrieved user in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: user },
		})
	);
};

/**
 * @summary Updates a user.
 * @description Updates a user's profile information based on the provided data.
 * Only the currently authenticated user can update their own profile.
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
export const updateSingleUser = async (
	req: Request<
		{ user: string },
		FormatResponseObjectType<IUserDocument, HttpStatus["OK"]>,
		Partial<Pick<IUser, "email" | "name" | "password">> & {
			oldPassword?: string;
			passwordConfirmation?: string;
		}
	>,
	res: Response<FormatResponseObjectType<IUserDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	// Retrieve the user ID or slug from the request parameters
	const { user: userIdentifier } = req.params || {};

	// Create variables to hold the password and email modifications flags.
	let isPasswordModified: boolean = false;
	let isEmailModified: boolean = false;

	// Attempt to retrieve a user from the database with the given ID or slug,
	// and if there was an error or no user was found, return the error and end the request
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

	if (req.body?.email && user?.email) isEmailModified = req.body.email !== user.email || false;
	if (req.body?.password) {
		user.comparePassword(req.body.password, (comparePasswordError, isMatch) => {
			if (comparePasswordError) {
				handleTransactionError(session);
				return next(comparePasswordError);
			}
			isPasswordModified = !isMatch;
		});
	}

	// Merge the request body data into the existing user object
	user = Object.assign(user, {
		...(req.body?.name ? { name: req.body.name } : {}),
		...(isEmailModified ? { emailVerified: false, email: req.body.email } : {}),
		...(isPasswordModified ? { password: req.body.password } : {}),
	});

	// If the user is not found, pass control to the next middleware
	if (!user) {
		handleTransactionError(session);
		return next();
	}

	// Save the updated user object to the database, and if there is an error during saving,
	// pass the error to the next middleware
	const [saveError, newUser] = await to(user.save({ session }));
	if (saveError) {
		handleTransactionError(session);
		return next(saveError);
	}

	if (isEmailModified) {
		// Attempt to create a new email verification token
		// If there is an error creating the token,
		// Rollback the transaction and pass the error to the next middleware
		const token = createHashToken();
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

		// Attempt to send an email using the email service send method
		// If there is an error sending the email,
		// rollback the transaction and pass the error to the next middleware
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

		// Attempt to create a new email
		// If there is an error creating the email,
		// Rollback the transaction and pass the error to the next middleware
		const [newEmailError] = await to(Email.create([sendEmail], { session }));
		if (newEmailError) {
			handleTransactionError(session);
			return next(newEmailError);
		}
	}

	if (isPasswordModified) {
		// Attempt to send an email using the email service send method
		// If there is an error sending the email,
		// rollback the transaction and pass the error to the next middleware
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

		// Attempt to create a new email
		// If there is an error creating the email,
		// Rollback the transaction and pass the error to the next middleware
		const [newEmailError] = await to(Email.create([sendEmail], { session }));
		if (newEmailError) {
			handleTransactionError(session);
			return next(newEmailError);
		}
	}

	// Commit the transaction
	await session.commitTransaction();
	session.endSession();

	// Flash success message and return the updated user data in the response
	req.flash("success", "successfully updated.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: newUser },
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Deletes a single user.
 * @description Deletes a user based on the provided slug or ID, along with associated sessions and tokens.
 * Uses transactions to ensure data integrity and handles errors appropriately.
 *
 * @param {Object} req - Express request object.
 * @param {String} req.params.user - User slug or ID.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {void} 200 - Success response with a success message.
 * @throws {Error} 500 - If an error occurs during the deletion process.
 */
export const deleteSingleUser = async (
	req: Request<{ user: string }, FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Check if user logged in
	if (
		req.isUnauthenticated() ||
		!req.user ||
		![vars.auth.roles.superAdmin].includes(req.user.role)
	) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	// Extract the user identifier from request parameters
	const { user: userIdentifier } = req.params || {};

	// Attempt to find the user by its ID or slug, and if there is an error or no user is found,
	// pass the error to the next middleware
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

	// Attempt to soft-delete the found user, and if there is an error during the deletion,
	// pass the error to the next middleware
	const [deleteUserError] = await to(User.deleteById(user._id, req.user._id).session(session));
	if (deleteUserError) {
		handleTransactionError(session);
		return next(deleteUserError);
	}

	// Attempt to delete all sessions associated with the user, and if there is an error during the deletion,
	// pass the error to the next middleware
	const [deleteSessionsError] = await to(
		Session.delete({ "session.passport.user._id": user._id }).session(session)
	);
	if (deleteSessionsError) {
		handleTransactionError(session);
		return next(deleteSessionsError);
	}

	// Attempt to delete all tokens associated with the user, and if there is an error during the deletion,
	// pass the error to the next middleware
	const [deleteTokenError] = await to(Token.delete({ user: user._id }).session(session));
	if (deleteTokenError) {
		handleTransactionError(session);
		return next(deleteTokenError);
	}

	// Commit the transaction
	await session.commitTransaction();
	session.endSession();

	// Flash success message and respond with success status
	req.flash("success", "Successfully Deleted.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Restores a single user by its ID or slug.
 * @description This method restores a user that was previously soft-deleted from the database.
 * The method handles errors and returns a success response when the user is successfully restored.
 *
 * @param {Object} req - Express request object.
 * @param {String} req.params.user - The ID or slug of the user to restore.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response indicating the user was restored.
 * @throws {Error} 404 - If no user is found with the provided identifier.
 * @throws {Error} 500 - If an error occurs during the restore process.
 */
export const restoreSingleUser = async (
	req: Request<{ user: string }, FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Extract the user identifier from request parameters
	const { user: userIdentifier } = req.params || {};

	// Create a query to find the user by its ID or slug
	const singleUserQuery = {
		$or: [
			{ slug: userIdentifier },
			...(isMongoId(userIdentifier) ? [{ _id: userIdentifier }] : []),
		],
		deleted: true,
	};

	// Attempt to find the user by its ID or slug, and if there is an error or no user is found,
	// pass the error to the next middleware
	const [userError, user] = await to(User.findOneWithDeleted(singleUserQuery));
	if (userError || !user) return next(userError);

	// Attempt to restore the found categories, and if there is an error during the restoration,
	// pass the error to the next middleware
	const [restoreUserError] = await to(User.restore(singleUserQuery));
	if (restoreUserError) return next(restoreUserError);

	// Flash success message and respond with success status
	req.flash("success", "Successfully Restored.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};
