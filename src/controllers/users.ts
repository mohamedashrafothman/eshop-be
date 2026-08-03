import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body, ValidationChain } from "express-validator";
import createError from "http-errors";
import httpStatus, { HttpStatus } from "http-status";
import mongoose, { ClientSession, PaginateOptions } from "mongoose";
import isMongoId from "validator/lib/isMongoId";
import { AuthenticatedRequest } from "../@types/express";
import IUser from "../interfaces/User.interface";
import Email from "../models/Email";
import Role from "../models/Role";
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
				body("roles")
					.isArray({ min: 1 })
					.withMessage("You must supply at least one role!")
					.custom(async (names: string[]) => {
						const roleDocs = await Role.find({ name: { $in: names } });
						if (roleDocs.length !== names.length) {
							throw new Error("One or more roles are invalid");
						}
						return true;
					}),
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
 * @openapi
 * /v1/users:
 *   post:
 *     summary: Creates a new user.
 *     description: Creates a new user (SuperAdmin only).
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - name
 *               - role
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               name:
 *                 type: string
 *                 maxLength: 100
 *               role:
 *                 type: string
 *                 enum: [admin, user]
 *               emailVerified:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       "201":
 *         description: User created successfully.
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
 *                           $ref: '#/components/schemas/Users'
 *                     flashes:
 *                       $ref: '#/components/schemas/Flash'
 *       "401":
 *         description: Unauthorized.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       "409":
 *         description: Account already exists.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       "500":
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const postNewUser = async (
	req: Request<
		{},
		FormatResponseObjectType<IUserDocument, HttpStatus["CREATED"]>,
		Pick<IUser, "email" | "name" | "roles" | "emailVerified">
	>,
	res: Response<FormatResponseObjectType<IUserDocument, HttpStatus["CREATED"]>>,
	next: NextFunction
): Promise<void> => {
	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	// Get values from the request body.
	const { email, name, roles, emailVerified = true } = req.body;

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

	// Resolve role names to ObjectIds
	const roleDocs = await Role.find({ name: { $in: roles } });
	const roleIds = roleDocs.map((r) => r._id);

	// Attempt to create the new user
	// If there is an error creating the user,
	// Rollback the transaction and pass the error to the next middleware
	const [createdUserError, createdUser] = await to(
		User.create([{ email, name, roles: roleIds, emailVerified }], { session })
	);
	if (createdUserError) {
		handleTransactionError(session);
		return next(createdUserError);
	}

	if (!emailVerified) {
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
						expireAt:
							Date.now() + 1000 * 60 * vars.email.emailVerifyTokenExpiresInMinutes,
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
			actionUrl: `${vars.app.frontEndUrl}/user/email/verify/${token}`,
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

	// Flash success message and respond with success status
	req.flash(
		"success",
		"Account created successfully, to verify the account check entered e-mail address."
	);
	res.status(httpStatus.CREATED).json(
		formatResponseObject({
			status: httpStatus.CREATED,
			entities: { data: createdUser[0] },
			flashes: req.flash(),
		})
	);
};

/**
 * @openapi
 * /v1/users/{user}/email/verify/{token}:
 *   get:
 *     summary: Verifies a user's email.
 *     description: Verifies email using a token.
 *     tags:
 *       - Users
 *     parameters:
 *       - in: path
 *         name: user
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID.
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Verification token.
 *     responses:
 *       "200":
 *         description: Email verified successfully.
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
 *         description: Invalid or expired token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       "500":
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const getUserEmailVerification = async (
	req: Request,
	res: Response,
	next: NextFunction
): Promise<void> => {
	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	// Retrieve the user ID from the request parameters
	const { token, user: userIdentifier } = req.params || {};

	const [verifyEmailTokenError, verifyEmailToken] = await to(
		Token.findOne({
			token,
			kind: vars.tokenTypes.verifyEmail,
			expireAt: { $gt: new Date().toISOString() },
		}).session(session)
	);
	if (verifyEmailTokenError) {
		handleTransactionError(session);
		return next(verifyEmailTokenError);
	}
	if (!verifyEmailToken) {
		handleTransactionError(session);
		const error = createError(httpStatus.BAD_REQUEST, "token is invalid or has expired.");
		return next({ ...(error || {}), status: error.status });
	}

	const [userError] = await to(
		User.findOneAndUpdate(
			{ _id: userIdentifier, emailVerified: { $ne: true } },
			{ $set: { emailVerified: true } }
		).session(session)
	);
	if (userError) {
		handleTransactionError(session);
		return next(userError);
	}

	const [deleteVerifyEmailTokenError] = await to(
		Token.deleteOne({
			token,
			kind: vars.tokenTypes.verifyEmail,
			expireAt: { $gt: new Date().toISOString() },
		}).session(session)
	);
	if (deleteVerifyEmailTokenError) {
		handleTransactionError(session);
		return next(deleteVerifyEmailTokenError);
	}

	// Commit the transaction
	await session.commitTransaction();
	session.endSession();

	req.flash("success", "Your account has been Verified");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			flashes: req.flash(),
		})
	);
};

/**
 * @openapi
 * /v1/users/{user}/email/resend:
 *   get:
 *     summary: Resends email verification link.
 *     description: Resends verification email to user.
 *     tags:
 *       - Users
 *     parameters:
 *       - in: path
 *         name: user
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID.
 *     responses:
 *       "200":
 *         description: Verification email sent.
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
 *         description: Email already verified.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       "404":
 *         description: User not found.
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
export const getResendEmailVerification = async (
	req: Request,
	res: Response,
	next: NextFunction
): Promise<void> => {
	// Retrieve the user ID from the request parameters
	const { user: userIdentifier } = req.params || {};

	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	const [userError, user] = await to(User.findOne({ _id: userIdentifier }).session(session));
	if (userError || !user) {
		handleTransactionError(session);
		let error;
		if (!user) error = createError(httpStatus.NOT_FOUND);
		return next(userError || (error && { ...(error || {}), status: error.status }));
	}

	if (user.emailVerified) {
		handleTransactionError(session);
		return next(createError(httpStatus.BAD_REQUEST, "Email Already Verified!"));
	}

	const [userRefreshTokenError, userRefreshToken] = await to(
		Token.findOne({
			user: user._id,
			kind: vars.tokenTypes.verifyEmail,
			expireAt: { $gt: new Date().toISOString() },
		}).session(session)
	);
	if (userRefreshTokenError) {
		handleTransactionError(session);
		return next(userRefreshTokenError);
	}

	const token = createHashToken();

	let newRefreshTokenError;
	if (!userRefreshToken) {
		[newRefreshTokenError] = await to(
			Token.create(
				[
					{
						user: user._id,
						token,
						kind: vars.tokenTypes.verifyEmail,
						expireAt:
							Date.now() + 1000 * 60 * vars.email.emailVerifyTokenExpiresInMinutes,
					},
				],
				{ session }
			)
		);
	} else {
		[newRefreshTokenError] = await to(
			Token.updateOne(
				{ user: user._id, kind: vars.tokenTypes.verifyEmail },
				{
					$set: {
						token,
						expireAt:
							Date.now() + 1000 * 60 * vars.email.emailVerifyTokenExpiresInMinutes,
					},
				}
			).session(session)
		);
	}

	if (newRefreshTokenError) {
		handleTransactionError(session);
		return next(newRefreshTokenError);
	}

	const [sendEmailError, sendEmail] = await emailService.send({
		to: user,
		from: vars.email.sender,
		filename: "verify-user",
		subject: `[${vars.app.name}] Verify User Account.`,
		actionUrl: `${vars.app.frontEndUrl}/user/email/verify/${token}`,
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

	// Commit the transaction
	await session.commitTransaction();
	session.endSession();

	req.flash("success", "Email Verification sent successfully!");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			flashes: req.flash(),
		})
	);
};

/**
 * @openapi
 * /v1/users:
 *   get:
 *     summary: Retrieves a paginated list of users.
 *     description: Fetches users with filtering and pagination. SuperAdmin only.
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
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
 *         name: emailVerified
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: deleted
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: active
 *         schema:
 *           type: boolean
 *     responses:
 *       "200":
 *         description: List of users.
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
 *                             $ref: '#/components/schemas/Users'
 *                         meta:
 *                           $ref: '#/components/schemas/Meta'
 *       "401":
 *         description: Unauthorized.
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
export const getUsers = async (
	req: AuthenticatedRequest<
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
		{ name: "Name A-Z", value: { name: "asc" } },
		{ name: "Name Z-A", value: { name: "desc" } },
		{ name: "Created Date Ascending", value: { createdAt: "asc" } },
		{ name: "Created Date Descending", value: { createdAt: "desc" } },
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
 * @openapi
 * /v1/users/{user}:
 *   get:
 *     summary: Retrieves a single user.
 *     description: Fetches a user by ID or slug. SuperAdmin only.
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: user
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID or slug.
 *     responses:
 *       "200":
 *         description: User details.
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
 *                           $ref: '#/components/schemas/Users'
 *       "401":
 *         description: Unauthorized.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       "404":
 *         description: User not found.
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
 * @openapi
 * /v1/users/me:
 *   get:
 *     summary: Retrieves the currently authenticated user.
 *     description: Fetches the profile of the logged-in user.
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "200":
 *         description: User profile.
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
 *                           $ref: '#/components/schemas/Users'
 *       "401":
 *         description: Unauthorized.
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
export const getCurrentAuthenticatedUser = async (
	req: AuthenticatedRequest<{}, FormatResponseObjectType<IUserDocument, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<IUserDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
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
 * @openapi
 * /v1/users/{user}:
 *   patch:
 *     summary: Updates a user.
 *     description: Updates user profile.
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: user
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID or slug.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 100
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *               oldPassword:
 *                 type: string
 *                 minLength: 8
 *               passwordConfirmation:
 *                 type: string
 *               emailVerified:
 *                 type: boolean
 *     responses:
 *       "200":
 *         description: User updated successfully.
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
 *                           $ref: '#/components/schemas/Users'
 *                     flashes:
 *                       $ref: '#/components/schemas/Flash'
 *       "401":
 *         description: Unauthorized.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       "404":
 *         description: User not found.
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
export const updateSingleUser = async (
	req: Request<
		{ user: string },
		FormatResponseObjectType<IUserDocument, HttpStatus["OK"]>,
		Partial<Pick<IUser, "email" | "name" | "password" | "emailVerified" | "roles">> & {
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

	if (req.body?.roles !== undefined) {
		const [existingRolesCountError, existingRolesCount] = await to(
			Role.countDocuments({
				_id: { $in: req.body.roles },
			}).session(session)
		);
		if (existingRolesCountError) {
			handleTransactionError(session);
			return next(existingRolesCountError);
		}

		if (existingRolesCount !== req.body.roles.length) {
			handleTransactionError(session);
			const error = createError(httpStatus.BAD_REQUEST, "One or more roles do not exist!");
			return next({ ...(error || {}), status: error.status });
		}

		if (req.user && req.user._id === user._id) {
			handleTransactionError(session);
			const error = createError(httpStatus.FORBIDDEN, "You cannot modify your own roles.");
			return next({ ...(error || {}), status: error.status });
		}

		const [superAdminRoleError, superAdminRole] = await to(
			Role.findOne({ name: vars.auth.roles.superAdmin }).session(session)
		);

		if (superAdminRoleError) {
			handleTransactionError(session);
			return next(superAdminRoleError);
		}

		if (
			superAdminRole &&
			user.roles.some((r) => r?.toString() === superAdminRole._id?.toString()) &&
			!req.body.roles.some((r) => r.toString() === superAdminRole._id.toString())
		) {
			const [remainingSuperAdminsCountError, remainingSuperAdmins] = await to(
				User.countDocuments({
					_id: { $ne: user._id },
					roles: superAdminRole._id,
				}).session(session)
			);

			if (remainingSuperAdminsCountError) {
				handleTransactionError(session);
				return next(remainingSuperAdminsCountError);
			}

			if (remainingSuperAdmins === 0) {
				handleTransactionError(session);
				const error = createError(
					httpStatus.FORBIDDEN,
					"Cannot remove the last Super Admin."
				);
				return next({ ...(error || {}), status: error.status });
			}
		}
	}

	// Merge the request body data into the existing user object
	user = Object.assign(user, {
		...("emailVerified" in req.body ? { emailVerified: req.body.emailVerified } : {}),
		...(req.body?.name ? { name: req.body.name } : {}),
		...(isEmailModified ? { emailVerified: false, email: req.body.email } : {}),
		...(isPasswordModified ? { password: req.body.password } : {}),
		...(req.body?.roles !== undefined ? { roles: req.body.roles } : {}),
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
			actionUrl: `${vars.app.frontEndUrl}/user/email/verify/${token}`,
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
 * @openapi
 * /v1/users/{user}:
 *   delete:
 *     summary: Deletes a single user.
 *     description: Soft-deletes a user. SuperAdmin only.
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: user
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID or slug.
 *     responses:
 *       "200":
 *         description: User deleted successfully.
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
 *         description: Unauthorized.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       "404":
 *         description: User not found.
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
export const deleteSingleUser = async (
	req: AuthenticatedRequest<
		{ user: string },
		FormatResponseObjectType<undefined, HttpStatus["OK"]>
	>,
	res: Response<FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
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
 * @openapi
 * /v1/users/{user}/restore:
 *   patch:
 *     summary: Restores a single user.
 *     description: Restores a soft-deleted user. SuperAdmin only.
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: user
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID or slug.
 *     responses:
 *       "200":
 *         description: User restored successfully.
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
 *         description: Unauthorized.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       "404":
 *         description: User not found.
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
