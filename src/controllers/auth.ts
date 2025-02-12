import to from "await-to-js";
import axios from "axios";
import { NextFunction, Request, Response } from "express";
import { body, ValidationChain } from "express-validator";
import createError from "http-errors";
import httpStatus, { HttpStatus } from "http-status";
import jsonwebtoken, { JwtPayload } from "jsonwebtoken";
import mongoose, { ClientSession } from "mongoose";
import passport, { type Profile } from "passport";
import { type VerifyFunctionWithRequest as FacebookVerifyFunctionWithRequest } from "passport-facebook";
import { type VerifyCallback as GoogleVerifyCallback } from "passport-google-oauth20";
import { type VerifiedCallback as JWTVerifyCallback } from "passport-jwt";
import { type VerifyFunctionWithRequest as LocalVerifyFunctionWithRequest } from "passport-local";
import qs from "qs";
import IUser from "../interfaces/User.interface";
import Email from "../models/Email";
import Token from "../models/Token";
import User, { type IUserDocument } from "../models/User";
import emailService from "../services/email";
import {
	countDownTimer,
	createHashToken,
	formatResponseObject,
	FormatResponseObjectType,
	handleTransactionError,
} from "../utils/helpers";
import vars from "../utils/vars";

/**
 * Validates the input fields based on the method provided.
 */
export const validator = (
	method:
		| "login"
		| "register"
		| "social-user"
		| "refresh-token"
		| "forgot-password"
		| "reset-password"
): ValidationChain[] => {
	switch (method) {
		case "login":
			return [
				body("email")
					.trim()
					.notEmpty()
					.withMessage("You must be supply an Email!")
					.isEmail()
					.withMessage("Email must be in an E-mail format.")
					.normalizeEmail({
						gmail_remove_dots: false,
						gmail_remove_subaddress: false,
						outlookdotcom_remove_subaddress: false,
						yahoo_remove_subaddress: false,
						icloud_remove_subaddress: false,
					}),
				body("password")
					.notEmpty()
					.withMessage("Password can't be blank!")
					.isLength({ min: 8 })
					.withMessage("Password must be at least 8 chars long")
					.isStrongPassword()
					.withMessage(
						"Password must include one lowercase character, one uppercase character, a number, and a special character."
					),
				body("remember").optional().toBoolean(),
			];
		case "register":
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
					.isLength({ min: 8, max: 64 })
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
				body("g-recaptcha-response")
					.notEmpty()
					.withMessage("Captcha can't be blank!")
					.bail()
					.custom(async (value) => {
						const [recaptchaError, recaptchaResponse] = await to(
							axios.post(
								`${vars.recaptcha.verifyLink}?${qs.stringify({ secret: vars.recaptcha.secretKey, response: value })}`
							)
						);

						if (recaptchaError)
							throw new Error(recaptchaError.message || "Error verifying reCAPTCHA");

						if (!recaptchaResponse?.data.success)
							throw new Error("Failed reCAPTCHA validation");

						return true;
					}),
			];
		case "social-user":
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
					.trim()
					.escape()
					.notEmpty()
					.withMessage("You must supply a name!")
					.isLength({ max: 100 })
					.withMessage("Name must be at most 100 characters long!"),
				body("providerId").notEmpty().withMessage("Provider id can't be blank!").trim(),
				body("providerToken")
					.trim()
					.notEmpty()
					.withMessage("Provider access token can't be blank!"),
			];
		case "refresh-token":
			return [
				body("refreshToken").notEmpty().withMessage("You must be supply a refresh token!"),
			];
		case "forgot-password":
			return [
				body("email")
					.notEmpty()
					.withMessage("Email must supply an E-mail.")
					.isEmail()
					.withMessage("Email must be in an E-mail format.")
					.trim()
					.normalizeEmail({
						gmail_remove_dots: false,
						gmail_remove_subaddress: false,
						outlookdotcom_remove_subaddress: false,
						yahoo_remove_subaddress: false,
						icloud_remove_subaddress: false,
					}),
			];
		case "reset-password":
			return [
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
					.withMessage("Confirm password cannot be blank!")
					.custom(
						(
							value,
							{
								req: {
									body: { password },
								},
							}
						) => value === password
					)
					.withMessage("Your passwords don't match!"),
			];
		default:
			return [];
	}
};

export const _passportSerializeUser = (user: any, done: any) => done(null, user?._id);

export const _passportDeserializeUser = async (
	_id: IUserDocument["_id"],
	done: (err: Error | null, user?: IUserDocument | false | null) => void
) => {
	const [userError, user] = await to(User.findOne({ _id }));
	if (userError) return done(userError);
	if (!user) return done(new Error("User Not Found"));
	done(null, user);
};

export const _passportLocalStrategy: LocalVerifyFunctionWithRequest = async (
	req,
	email,
	password,
	done
) => {
	const [error, user] = await to(User.findOne({ email: email.toLowerCase() }));
	if (error) done(error);
	if (!user) {
		req.flash("danger", "Your credentials doesn't match our records");
		return done(null, false, {
			message: "Your credentials doesn't match our records",
		});
	}

	user.comparePassword(password, (comparePasswordError, isMatch) => {
		if (comparePasswordError) return done(comparePasswordError);
		if (!isMatch) {
			req.flash("danger", "Your credentials doesn't match our records.");
			return done(null, false, {
				message: "Your credentials doesn't match our records",
			});
		}
		return done(null, user);
	});
};

export const _passportJWTStrategy = async (
	{ sub: _id }: { sub: string },
	done: JWTVerifyCallback
) => {
	const [userError, user] = await to(User.findOne({ _id }));
	if (userError) return done(userError, false);
	if (!user) return done(null, false);

	const [tokenError, token] = await to(
		Token.findOne({
			user: user._id,
			kind: vars.tokenTypes.jwt,
			expireAt: { $gt: new Date().toISOString() },
		})
	);
	if (tokenError) return done(tokenError, false);
	if (!token) return done(null, false);

	return done(null, user);
};

export const _passportGoogleStrategy = async (
	req: Request,
	accessToken: string,
	_refreshToken: string,
	profile: Profile,
	done: GoogleVerifyCallback
) => {
	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	if (req.isAuthenticated()) {
		const [existsUserError, existsUser] = await to(
			User.findOne({ google: profile?.id }).session(session)
		);
		if (existsUserError || existsUser) {
			handleTransactionError(session);
			let error;
			if (existsUser) {
				error = createError(
					httpStatus.CONFLICT,
					"There is already an account using this email address. Sign in to that account and link it with Google manually from Account Settings."
				);
			}
			return done(existsUserError || (error && { ...(error || {}), status: error.status }));
		}

		let userError = null;
		let user;

		[userError, user] = await to(User.findOne({ _id: req.user._id }).session(session));
		if (userError || !user) {
			handleTransactionError(session);
			return done(userError || new Error("No User Found"));
		}

		user = Object.assign(user, {
			...(profile?.id ? { google: profile.id } : {}),
			...(!user?.name && profile?.displayName ? { name: profile.displayName } : {}),
			emailVerified: true,
			active: true,
		});

		const [tokenError, token] = await to(
			Token.findOne({ user: user._id, kind: vars.tokenTypes.google }).session(session)
		);
		if (tokenError) {
			handleTransactionError(session);
			return done(tokenError);
		}

		let newRefreshTokenError;

		if (!token) {
			[newRefreshTokenError] = await to(
				Token.create(
					[{ user: user._id, token: accessToken, kind: vars.tokenTypes.google }],
					{ session }
				)
			);
		} else {
			[newRefreshTokenError] = await to(
				Token.updateOne(
					{ user: user._id, kind: vars.tokenTypes.google },
					{ $set: { token: accessToken } }
				).session(session)
			);
		}

		if (newRefreshTokenError) {
			handleTransactionError(session);
			return done(newRefreshTokenError);
		}

		const [saveError] = await to(user.save({ session }));
		if (saveError) {
			handleTransactionError(session);
			return done(saveError);
		}

		// Commit the transaction
		await session.commitTransaction();
		session.endSession();

		req.flash("success", "Google Account has been linked!");
		return done(null, user);
	}

	const [existsUserError, existsUser] = await to(
		User.findOne({ google: profile?.id }).session(session)
	);
	if (existsUserError) {
		handleTransactionError(session);
		return done(existsUserError);
	}
	if (existsUser) {
		const [updatedUserError] = await to(
			User.updateOne(
				{ _id: existsUser?._id },
				{ $set: { active: true, emailVerified: true } }
			).session(session)
		);
		if (updatedUserError) {
			handleTransactionError(session);
			return done(updatedUserError);
		}

		const [userError, user] = await to(User.findOne({ _id: existsUser?._id }).session(session));
		if (userError || !user) {
			handleTransactionError(session);
			return done(userError);
		}

		// Commit the transaction
		await session.commitTransaction();
		session.endSession();

		req.flash("success", "Welcome Back!");
		return done(null, user);
	}

	const [existsEmailError, existsEmail] = await to(
		User.findOne({ email: profile?.emails?.[0]?.value || "" }).session(session)
	);
	if (existsEmailError || existsEmail) {
		handleTransactionError(session);
		let error;
		if (existsEmail) {
			error = createError(
				httpStatus.CONFLICT,
				"There is already an account using this email address. Sign in to that account and link it with Google manually from Account Settings."
			);
		}
		return done(existsEmailError || (error && { ...(error || {}), status: error.status }));
	}

	const user = {
		name: profile.displayName,
		email: profile?.emails?.[0]?.value || "",
		google: profile.id,
		active: true,
		emailVerified: true,
	};

	const [newUserError, newUser] = await to(User.create([user], { session }));
	if (newUserError) {
		handleTransactionError(session);
		return done(newUserError);
	}

	const [newRefreshTokenError] = await to(
		Token.create([{ user: newUser[0]._id, token: accessToken, kind: vars.tokenTypes.google }], {
			session,
		})
	);
	if (newRefreshTokenError) {
		handleTransactionError(session);
		return done(newRefreshTokenError);
	}

	// Commit the transaction
	await session.commitTransaction();
	session.endSession();

	req.flash("success", "Welcome Back!");
	return done(null, newUser[0]);
};

export const _passportFacebookStrategy: FacebookVerifyFunctionWithRequest = async (
	req,
	accessToken,
	_refreshToken,
	profile,
	done: (error: any, user?: any, info?: any) => void
) => {
	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	if (req.isAuthenticated()) {
		const [existsUserError, existsUser] = await to(
			User.findOne({ facebook: profile?.id }).session(session)
		);
		if (existsUserError || existsUser) {
			handleTransactionError(session);
			let error;
			if (existsUser) {
				error = createError(
					httpStatus.CONFLICT,
					"There is already an account using this email address. Sign in to that account and link it with Facebook manually from Account Settings."
				);
			}
			return done(existsUserError || (error && { ...(error || {}), status: error.status }));
		}

		let [userError, user] = await to(User.findOne({ _id: req.user._id }).session(session));
		if (userError || !user) {
			handleTransactionError(session);
			return done(userError || new Error("No User Found"));
		}

		user = Object.assign(user, {
			...(profile?.id ? { facebook: profile.id } : {}),
			...(!user?.name &&
			(profile?.name?.givenName || profile?.name?.middleName || profile?.name?.familyName)
				? {
						name: `${profile.name.givenName} ${profile.name.middleName} ${profile.name.familyName}`,
					}
				: {}),
			emailVerified: true,
			active: true,
		});

		const [tokenError, token] = await to(
			Token.findOne({ user: user._id, kind: vars.tokenTypes.facebook }).session(session)
		);
		if (tokenError) {
			handleTransactionError(session);
			return done(tokenError);
		}

		let newRefreshTokenError;

		if (!token) {
			[newRefreshTokenError] = await to(
				Token.create(
					[
						{
							user: user._id,
							token: accessToken,
							kind: vars.tokenTypes.facebook,
						},
					],
					{ session }
				)
			);
		} else {
			[newRefreshTokenError] = await to(
				Token.updateOne(
					{ user: user._id, kind: vars.tokenTypes.facebook },
					{ $set: { token: accessToken } }
				).session(session)
			);
		}
		if (newRefreshTokenError) {
			handleTransactionError(session);
			return done(newRefreshTokenError);
		}

		const [saveError] = await to(user.save({ session }));
		if (saveError) {
			handleTransactionError(session);
			return done(saveError);
		}

		// Commit the transaction
		await session.commitTransaction();
		session.endSession();

		req.flash("success", "Facebook Account has been linked!");
		return done(null, user);
	}

	const [existsUserError, existsUser] = await to(
		User.findOne({ facebook: profile?.id }).session(session)
	);
	if (existsUserError) {
		handleTransactionError(session);
		return done(existsUserError);
	}
	if (existsUser) {
		const [updatedUserError] = await to(
			User.updateOne(
				{ _id: existsUser?._id },
				{ $set: { active: true, emailVerified: true } }
			).session(session)
		);
		if (updatedUserError) {
			handleTransactionError(session);
			return done(updatedUserError);
		}

		const [userError, user] = await to(User.findOne({ _id: existsUser?._id }).session(session));
		if (userError || !user) {
			handleTransactionError(session);
			return done(userError);
		}

		// Commit the transaction
		await session.commitTransaction();
		session.endSession();

		req.flash("success", "Welcome Back!");
		return done(null, user);
	}

	const [existsEmailError, existsEmail] = await to(
		User.findOne({ email: profile?.emails?.[0]?.value || "" }).session(session)
	);
	if (existsEmailError || existsEmail) {
		handleTransactionError(session);
		let error;
		if (existsEmail) {
			error = createError(
				httpStatus.CONFLICT,
				"There is already an account using this email address. Sign in to that account and link it with Facebook manually from Account Settings."
			);
		}
		return done(existsEmailError || (error && { ...(error || {}), status: error.status }));
	}

	const user = {
		name:
			profile.displayName ||
			`${profile?.name?.givenName || ""} ${profile?.name?.middleName || ""} ${
				profile?.name?.familyName || ""
			}`,
		email: profile?.emails?.[0]?.value || "",
		facebook: profile.id,
		active: true,
		emailVerified: true,
	};

	const [newUserError, newUser] = await to(User.create([user], { session }));
	if (newUserError) {
		handleTransactionError(session);
		return done(newUserError);
	}

	const [newRefreshTokenError] = await to(
		Token.create(
			[
				{
					user: newUser[0]._id,
					token: accessToken,
					kind: vars.tokenTypes.facebook,
				},
			],
			{ session }
		)
	);
	if (newRefreshTokenError) {
		handleTransactionError(session);
		return done(newRefreshTokenError);
	}

	// Commit the transaction
	await session.commitTransaction();
	session.endSession();

	req.flash("success", "Welcome Back!");
	return done(null, newUser[0]);
};

export const passportJWTSerialize = (req: Request, res: Response, next: NextFunction) =>
	passport.authenticate(
		"jwt",
		{ session: false, failWithError: true },
		(err: any, user: IUserDocument | undefined) => {
			if (err) return next(err);
			if (user) req.user = user;
			next();
		}
	)(req, res, next);

export const passportJWTAuthenticate = (req: Request, res: Response, next: NextFunction) =>
	passport.authenticate("jwt", { session: false, failWithError: true })(req, res, next);

export const _getSocialUser = (req: Request, res: Response, next: NextFunction) =>
	passport.authenticate(req.params.provider, {
		scope:
			vars.auth.strategies.social[
				req.params.provider as keyof typeof vars.auth.strategies.social
			].scope || "",
	})(req, res, next);

export const _getSocialRedirect = (req: Request, res: Response, next: NextFunction) =>
	passport.authenticate(req.params.provider, {
		...(vars.auth.strategies.social[
			req.params.provider as keyof typeof vars.auth.strategies.social
		]?.redirect || {}),
	})(req, res, next);

/**
 * @summary Creates a new social user or links a social account to an existing user.
 * @description Handles social login/signup using a provider like Google. If the user is already authenticated, it attempts to link the social provider with their account. Otherwise, it creates a new user with the provided information.
 *
 * @param {Object} req - Express request object.
 * @param {String} req.params.provider - The social provider name (e.g., 'google', 'facebook').
 * @param {Object} req.body - Social login data including provider ID, email, name, and provider access token.
 *   * @property {String} req.body.providerId - User's ID in the social provider.
 *   * @property {String} req.body.email - User's email address.
 *   * @property {String} req.body.name - User's name.
 *   * @property {String} req.body.providerToken - Access token received from the social provider.
 *
 * @returns {Object} 200 - Success response containing user data, access and refresh tokens, and a success message.
 *   * @property {Object} entities.data - The user data.
 */
export const postSocialUser = async (
	req: Request,
	res: Response,
	next: NextFunction
): Promise<void> => {
	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	if (req.isAuthenticated()) {
		const [existsUserError, existsUser] = await to(
			User.findOne({ [req.params.provider]: req.body.providerId }).session(session)
		);
		if (existsUserError || existsUser) {
			handleTransactionError(session);
			let error;
			if (existsUser) {
				error = createError(
					httpStatus.CONFLICT,
					"There is already an account using this email address. Sign in to that account and link it with Facebook manually from Account Settings."
				);
			}
			return next(existsUserError || (error && { ...(error || {}), status: error.status }));
		}

		let [userError, user] = await to(User.findOne({ _id: req.user._id }).session(session));
		if (userError || !user) {
			handleTransactionError(session);
			return next(userError);
		}

		user = Object.assign(user, {
			[req.params.provider]: req.body.providerId,
			...(req?.body?.name ? { name: req.body.name } : {}),
			emailVerified: true,
			active: true,
		});

		const [tokenError, token] = await to(
			Token.findOne({
				user: user._id,
				kind: vars.tokenTypes?.[req.params.provider as keyof typeof vars.tokenTypes] || "",
			}).session(session)
		);
		if (tokenError) {
			handleTransactionError(session);
			return next(tokenError);
		}

		let newSocialProviderTokenError;

		if (!token) {
			[newSocialProviderTokenError] = await to(
				Token.create(
					[
						{
							user: user._id,
							token: req.body.providerToken,
							kind: vars.tokenTypes[
								req.params.provider as keyof typeof vars.tokenTypes
							],
						},
					],
					{ session }
				)
			);
		} else {
			[newSocialProviderTokenError] = await to(
				Token.updateOne(
					{
						user: user._id,
						kind: vars.tokenTypes[req.params.provider as keyof typeof vars.tokenTypes],
					},
					{ $set: { token: req.body.providerToken } }
				).session(session)
			);
		}
		if (newSocialProviderTokenError) {
			handleTransactionError(session);
			return next(newSocialProviderTokenError);
		}

		const [saveError] = await to(user.save({ session }));
		if (saveError) {
			handleTransactionError(session);
			return next(saveError);
		}

		const accessToken = jsonwebtoken.sign(
			{ sub: user._id.toString(), iat: Math.floor(Date.now() / 1000) },
			vars.auth.strategies.jwt.accessTokenSecret,
			{ expiresIn: `${vars.auth.strategies.jwt.accessTokenExpiresInMinutes}m` }
		);
		const refreshToken = jsonwebtoken.sign(
			{ sub: user._id.toString(), iat: Math.floor(Date.now() / 1000) },
			vars.auth.strategies.jwt.refreshTokenSecret,
			{ expiresIn: `${vars.auth.strategies.jwt.refreshTokenExpiresInDays}d` }
		);

		const [newRefreshTokenError] = await to(
			Token.create(
				[
					{
						user: user._id,
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

		// Commit the transaction
		await session.commitTransaction();
		session.endSession();

		req.flash("success", `Account ${req.params.provider} has been linked`);
		res.status(httpStatus.CREATED).json(
			formatResponseObject({
				status: httpStatus.CREATED,
				entities: {
					data: {
						...(user?.toJSON() || {}),
						accessToken,
						refreshToken,
						tokenType: vars.auth.strategies.jwt.tokenType,
					},
				},
				flashes: req.flash(),
			})
		);

		return;
	}

	const [existsUserError, existsUser] = await to(
		User.findOne({ [req.params.provider]: req.body.providerId }).session(session)
	);
	if (existsUserError) {
		handleTransactionError(session);
		return next(existsUserError);
	}
	if (existsUser) {
		const [updatedUserError] = await to(
			User.updateOne(
				{ _id: existsUser?._id },
				{ $set: { active: true, emailVerified: true } }
			).session(session)
		);
		if (updatedUserError) {
			handleTransactionError(session);
			return next(updatedUserError);
		}

		const [userError, user] = await to(User.findOne({ _id: existsUser?._id }).session(session));
		if (userError || !user) {
			handleTransactionError(session);
			return next(userError);
		}

		const accessToken = jsonwebtoken.sign(
			{ sub: user._id.toString(), iat: Math.floor(Date.now() / 1000) },
			vars.auth.strategies.jwt.accessTokenSecret,
			{ expiresIn: `${vars.auth.strategies.jwt.accessTokenExpiresInMinutes}m` }
		);
		const refreshToken = jsonwebtoken.sign(
			{ sub: user._id.toString(), iat: Math.floor(Date.now() / 1000) },
			vars.auth.strategies.jwt.refreshTokenSecret,
			{ expiresIn: `${vars.auth.strategies.jwt.refreshTokenExpiresInDays}d` }
		);

		const [userRefreshTokenError, userRefreshToken] = await to(
			Token.findOne({
				user: user._id,
				kind: vars.tokenTypes.jwt,
				expireAt: { $gt: new Date().toISOString() },
			}).session(session)
		);
		if (userRefreshTokenError) {
			handleTransactionError(session);
			return next(userRefreshTokenError);
		}

		let newRefreshTokenError;

		if (!userRefreshToken) {
			[newRefreshTokenError] = await to(
				Token.create(
					[
						{
							user: user._id,
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
		} else {
			[newRefreshTokenError] = await to(
				Token.updateOne(
					{ user: user._id, kind: vars.tokenTypes.jwt },
					{
						$set: {
							token: refreshToken,
							expireAt:
								Date.now() +
								1000 *
									60 *
									60 *
									24 *
									vars.auth.strategies.jwt.refreshTokenExpiresInDays,
						},
					}
				).session(session)
			);
		}
		if (newRefreshTokenError) {
			handleTransactionError(session);
			return next(newRefreshTokenError);
		}

		// Commit the transaction
		await session.commitTransaction();
		session.endSession();

		req.flash("success", "Welcome Back!");
		res.status(httpStatus.OK).json(
			formatResponseObject({
				status: httpStatus.OK,
				entities: {
					data: {
						...(user?.toJSON() || {}),
						active: true,
						accessToken,
						refreshToken,
						tokenType: vars.auth.strategies.jwt.tokenType,
					},
				},
				flashes: req.flash(),
			})
		);
		return;
	}

	const [existsEmailError, existsEmail] = await to(
		User.findOne({ email: req.body.email }).session(session)
	);
	if (existsEmailError || existsEmail) {
		handleTransactionError(session);
		let error;
		if (existsEmail) {
			error = createError(
				httpStatus.CONFLICT,
				`There is already an account using this email address. Sign in to that account and link it with ${req.params.provider} manually from Account Settings.`
			);
		}
		return next(existsEmailError || (error && { ...(error || {}), status: error.status }));
	}

	const [newUserError, newUser] = await to(
		User.create(
			[
				{
					email: req.body.email,
					name: req.body.name,
					[req.params.provider]: req.body.providerId,
					active: true,
					emailVerified: true,
				},
			],
			{ session }
		)
	);
	if (newUserError) {
		handleTransactionError(session);
		return next(newUserError);
	}

	const [newSocialProviderTokenError] = await to(
		Token.create(
			[
				{
					user: newUser[0]._id,
					token: req.body.providerToken,
					kind: vars.tokenTypes[req.params.provider as keyof typeof vars.tokenTypes],
				},
			],
			{ session }
		)
	);
	if (newSocialProviderTokenError) {
		handleTransactionError(session);
		return next(newSocialProviderTokenError);
	}

	const accessToken = jsonwebtoken.sign(
		{ sub: newUser[0]._id.toString(), iat: Math.floor(Date.now() / 1000) },
		vars.auth.strategies.jwt.accessTokenSecret,
		{ expiresIn: `${vars.auth.strategies.jwt.accessTokenExpiresInMinutes}m` }
	);
	const refreshToken = jsonwebtoken.sign(
		{ sub: newUser[0]._id.toString(), iat: Math.floor(Date.now() / 1000) },
		vars.auth.strategies.jwt.refreshTokenSecret,
		{ expiresIn: `${vars.auth.strategies.jwt.refreshTokenExpiresInDays}d` }
	);

	const [newRefreshTokenError] = await to(
		Token.create(
			[
				{
					user: newUser[0]._id,
					token: refreshToken,
					kind: vars.tokenTypes.jwt,
					expireAt:
						Date.now() +
						1000 * 60 * 60 * 24 * vars.auth.strategies.jwt.refreshTokenExpiresInDays,
				},
			],
			{ session }
		)
	);
	if (newRefreshTokenError) {
		handleTransactionError(session);
		return next(newRefreshTokenError);
	}

	// Commit the transaction
	await session.commitTransaction();
	session.endSession();

	req.flash("success", "Account Registered Successfully");
	res.status(httpStatus.CREATED).json(
		formatResponseObject({
			status: httpStatus.CREATED,
			entities: {
				data: {
					...(newUser[0]?.toJSON() || {}),
					accessToken,
					refreshToken,
					tokenType: vars.auth.strategies.jwt.tokenType,
				},
			},
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Unlinks a social account from the current user.
 * @description Removes a social provider account (e.g., Google, Facebook) from the user's profile.

 * @param {Object} req - Express request object.
 * @param {String} req.params.provider - The social provider name (e.g., 'google', 'facebook').

 * @returns {Object} 200 - Success response with a success message.
 */
export const postSocialUnlink = async (
	req: Request,
	res: Response,
	next: NextFunction
): Promise<void> => {
	// Check if user logged in
	if (req.isUnauthenticated() || !req.user) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	const { provider } = req.params || {};
	const _id = req.user._id || "";

	const [deleteTokenError] = await to(
		Token.deleteOne({
			user: _id,
			kind: vars.tokenTypes[provider as keyof typeof vars.tokenTypes],
		}).session(session)
	);
	if (deleteTokenError) {
		handleTransactionError(session);
		return next(deleteTokenError);
	}

	const [updateUserError] = await to(
		User.updateOne({ _id }, { $unset: { [provider]: 1 } }).session(session)
	);
	if (updateUserError) {
		handleTransactionError(session);
		return next(updateUserError);
	}

	const [userAfterUpdateError, userAfterUpdate] = await to(
		User.findOne({ _id }).session(session)
	);
	if (userAfterUpdateError) {
		handleTransactionError(session);
		return next(userAfterUpdateError);
	}

	// Commit the transaction
	await session.commitTransaction();
	session.endSession();

	req.flash("success", `${provider} account has been unlinked.`);
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: userAfterUpdate?.toJSON() },
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Logs in a user with email and password.
 * @description Attempts to authenticate a user using their email and password. If successful, activates the user's account (if inactive) and generates access and refresh tokens for the user.
 *
 * @param {Object} req - Express request object.
 * @param {String} req.body.email - User's email address.
 * @param {String} req.body.password - User's password.
 *
 * @returns {Object} 200 - Success response containing user data, access and refresh tokens, and a success message.
 *   * @property {Object} entities.data - The user data.
 */
export const postLogin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	const { email, remember = false } = req.body;
	const [userError, user] = await to(User.findOne({ email }).session(session));
	if (userError || !user) {
		handleTransactionError(session);
		return next(userError);
	}

	user.comparePassword(req.body.password, async (compareError, isMatch) => {
		if (compareError) {
			handleTransactionError(session);
			return next(compareError);
		}
		if (!isMatch) {
			handleTransactionError(session);
			const error = createError(
				httpStatus.UNPROCESSABLE_ENTITY,
				"Your credentials doesn't match our records."
			);
			return next({ ...(error || {}), status: error.status });
		}

		const [updateUserError] = await to(
			User.updateOne(
				{ email: user.email, active: false },
				{ $set: { active: true } }
			).session(session)
		);
		if (updateUserError) {
			handleTransactionError(session);
			return next(updateUserError);
		}

		const accessToken = jsonwebtoken.sign(
			{ sub: user._id.toString(), iat: Math.floor(Date.now() / 1000) },
			vars.auth.strategies.jwt.accessTokenSecret,
			{ expiresIn: `${vars.auth.strategies.jwt.accessTokenExpiresInMinutes}m` }
		);
		const refreshToken = jsonwebtoken.sign(
			{ sub: user._id.toString(), iat: Math.floor(Date.now() / 1000) },
			vars.auth.strategies.jwt.refreshTokenSecret,
			{
				expiresIn: `${remember ? vars.auth.strategies.jwt.refreshTokenRememberMeExpiresInDays : vars.auth.strategies.jwt.refreshTokenExpiresInDays}d`,
			}
		);

		const [userRefreshTokenError, userRefreshToken] = await to(
			Token.findOne({
				user: user._id,
				kind: vars.tokenTypes.jwt,
				expireAt: { $gt: new Date().toISOString() },
			}).session(session)
		);
		if (userRefreshTokenError) {
			handleTransactionError(session);
			return next(userRefreshTokenError);
		}
		let newRefreshTokenError;

		if (!userRefreshToken) {
			[newRefreshTokenError] = await to(
				Token.create(
					[
						{
							user: user._id,
							token: refreshToken,
							kind: vars.tokenTypes.jwt,
							expireAt:
								Date.now() +
								1000 *
									60 *
									60 *
									24 *
									(remember
										? vars.auth.strategies.jwt
												.refreshTokenRememberMeExpiresInDays
										: vars.auth.strategies.jwt.refreshTokenExpiresInDays),
						},
					],
					{ session }
				)
			);
		} else {
			[newRefreshTokenError] = await to(
				Token.updateOne(
					{ user: user._id, kind: vars.tokenTypes.jwt },
					{
						$set: {
							token: refreshToken,
							expireAt:
								Date.now() +
								1000 *
									60 *
									60 *
									24 *
									(remember
										? vars.auth.strategies.jwt
												.refreshTokenRememberMeExpiresInDays
										: vars.auth.strategies.jwt.refreshTokenExpiresInDays),
						},
					}
				).session(session)
			);
		}
		if (newRefreshTokenError) {
			handleTransactionError(session);
			return next(newRefreshTokenError);
		}

		// Commit the transaction
		await session.commitTransaction();
		session.endSession();

		req.flash("success", "Welcome Back!");
		res.status(httpStatus.OK).json(
			formatResponseObject({
				status: httpStatus.OK,
				entities: {
					data: {
						...(user?.toJSON() || {}),
						active: true,
						accessToken,
						refreshToken,
						tokenType: vars.auth.strategies.jwt.tokenType,
					},
				},
				flashes: req.flash(),
			})
		);
		return;
	});
};

/**
 * @summary Register a new user in the system.
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
export const postRegister = async (
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
			"g-recaptcha-response": string;
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
		if (existsUser)
			error = createError(
				httpStatus.CONFLICT,
				"Account already exist, try to login instead!"
			);
		return next(userError || (error && { ...(error || {}), status: error.status }));
	}

	// Attempt to create the new user
	// If there is an error creating the user,
	// Rollback the transaction and pass the error to the next middleware
	const [createdUserError, createdUser] = await to(
		User.create([{ email, name: req.body.name, password: req.body.password, active: true }], {
			session,
		})
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

	// Create access and refresh tokens if the user is not authenticated to register a new user.
	const accessToken: string = jsonwebtoken.sign(
		{ sub: createdUser[0]._id.toString(), iat: Math.floor(Date.now() / 1000) },
		vars.auth.strategies.jwt.accessTokenSecret,
		{ expiresIn: `${vars.auth.strategies.jwt.accessTokenExpiresInMinutes}m` }
	);
	const refreshToken: string = jsonwebtoken.sign(
		{ sub: createdUser[0]._id.toString(), iat: Math.floor(Date.now() / 1000) },
		vars.auth.strategies.jwt.refreshTokenSecret,
		{ expiresIn: `${vars.auth.strategies.jwt.refreshTokenExpiresInDays}d` }
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
						1000 * 60 * 60 * 24 * vars.auth.strategies.jwt.refreshTokenExpiresInDays,
				},
			],
			{ session }
		)
	);
	if (newRefreshTokenError) {
		handleTransactionError(session);
		return next(newRefreshTokenError);
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
			entities: {
				data: Object.assign(createdUser[0]?.toJSON(), {
					...(accessToken && { accessToken }),
					...(refreshToken && { refreshToken }),
					tokenType: vars.auth.strategies.jwt.tokenType,
				}),
			},
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Handles rate limit for login route.
 * @description Checks if the user has exceeded the maximum login attempts and if so,
 * flashes a message indicating the time left before the next attempt.
 * @param {Request} req - The Express request object.
 * @param {Response} res - The Express response object.
 * @param {NextFunction} next - The Express next middleware function to handle errors.
 *
 * @returns {void} 429 - Too Many Requests response with a flash message.
 */
export const _loginRateLimitHandler = async (
	req: Request,
	res: Response,
	next: NextFunction
): Promise<void> => {
	const resetTime = req.rateLimit?.resetTime;

	// Check if the reset time is valid
	if (!resetTime) return next();

	// Check if the user has exceeded the maximum attempts
	const remainingTime = countDownTimer(resetTime);
	const error = createError(
		httpStatus.TOO_MANY_REQUESTS,
		`Too Many Login Attempts. Please try again in ${remainingTime.minutes}:${remainingTime.seconds} ${remainingTime?.minutes ? "minutes" : "seconds"}.`
	);
	return next({ ...(error || {}), status: error.status });
};

/**
 * @summary Logs out the current user.
 * @description Revokes all tokens associated with the user and deactivates the user account.
 *
 * @returns {Object} 200 - Success response with a success message.
 */
export const logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	// Check if user logged in
	if (req.isUnauthenticated() || !req.user) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	const _id = req.user._id || "";

	const [deleteTokenError] = await to(
		Token.deleteMany({
			user: _id,
			kind: {
				$in: [
					vars.tokenTypes.jwt,
					vars.tokenTypes.resetPassword,
					vars.tokenTypes.verifyEmail,
				],
			},
		}).session(session)
	);
	if (deleteTokenError) {
		handleTransactionError(session);
		return next(deleteTokenError);
	}

	const [updateUserError] = await to(
		User.updateOne({ _id }, { $set: { active: false } }).session(session)
	);
	if (updateUserError) {
		handleTransactionError(session);
		return next(updateUserError);
	}

	req.logout(async (err) => {
		if (err) {
			handleTransactionError(session);
			return next(err);
		}

		// Commit the transaction
		await session.commitTransaction();
		session.endSession();

		req.user = undefined;
		req.flash("success", "Successfully logged out!");
		res.status(httpStatus.OK).json(
			formatResponseObject({
				status: httpStatus.OK,
				flashes: req.flash(),
			})
		);
	});
};

/**
 * @summary Refreshes a JWT access token using a refresh token.
 * @description Exchanges a valid refresh token for a new access token if the refresh token is not expired.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.body - Request body containing a refresh token.
 * @param {String} req.body.refreshToken - The user's refresh token.
 *
 * @returns {Object} 200 - Success response containing a new access token and a refresh token.
 *   * @property {Object} entities.data - The data containing new tokens.
 */
export const postRefreshToken = async (
	req: Request,
	res: Response,
	next: NextFunction
): Promise<void> => {
	const [userRefreshTokenError, userRefreshToken] = await to(
		Token.findOne({
			token: req.body.refreshToken,
			kind: vars.tokenTypes.jwt,
			expireAt: { $gt: new Date().toISOString() },
		})
	);
	if (userRefreshTokenError) return next(userRefreshTokenError);
	if (!userRefreshToken) {
		const error = createError(
			httpStatus.FORBIDDEN,
			"Your session has been ended, please login again!"
		);
		return next({ ...(error || {}), status: error.status });
	}

	const { sub, exp } = jsonwebtoken.verify(
		userRefreshToken.token,
		vars.auth.strategies.jwt.refreshTokenSecret
	) as JwtPayload;
	const iat = Math.floor(Date.now() / 1000);

	const accessToken = jsonwebtoken.sign(
		{ sub, iat },
		vars.auth.strategies.jwt.accessTokenSecret,
		{ expiresIn: `${vars.auth.strategies.jwt.accessTokenExpiresInMinutes}m` }
	);
	const refreshToken = jsonwebtoken.sign(
		{ sub, iat },
		vars.auth.strategies.jwt.refreshTokenSecret,
		{
			expiresIn: exp
				? `${exp - iat}s`
				: `${vars.auth.strategies.jwt.refreshTokenExpiresInDays}d`,
		}
	);

	const [newRefreshTokenError] = await to(
		Token.updateOne(
			{ _id: userRefreshToken._id },
			{
				$set: {
					token: refreshToken,
					expireAt:
						1000 *
						(exp
							? exp
							: Date.now() +
								60 * 60 * 24 * vars.auth.strategies.jwt.refreshTokenExpiresInDays),
				},
			}
		)
	);
	if (newRefreshTokenError) return next(newRefreshTokenError);

	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: {
				data: {
					accessToken,
					refreshToken,
					tokenType: vars.auth.strategies.jwt.tokenType,
				},
			},
		})
	);
};

/**
 * @summary Initiates password reset process for a user.
 * @description Sends a password reset email to the user's email address if the email exists in the user database.
 *
 * @param {Object} req - Express request object.
 * @param {String} req.body.email - The user's email address.
 *
 * @returns {Object} 200 - Success response with a success message.
 */
export const postForgotPassword = async (
	req: Request,
	res: Response,
	next: NextFunction
): Promise<void> => {
	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	const { email } = req.body;
	const [userError, user] = await to(User.findOne({ email }).session(session));
	if (userError) {
		handleTransactionError(session);
		return next(userError);
	}
	if (!user) {
		handleTransactionError(session);
		const error = createError(httpStatus.BAD_REQUEST, "No account found with this email.");
		return next({ ...(error || {}), status: error.status });
	}

	const token = createHashToken();
	const [resetPasswordTokenError, resetPasswordToken] = await to(
		Token.findOne({
			user: user._id,
			kind: vars.tokenTypes.resetPassword,
			expireAt: { $gt: new Date().toISOString() },
		}).session(session)
	);
	if (resetPasswordTokenError) {
		handleTransactionError(session);
		return next(resetPasswordTokenError);
	}

	let newRefreshTokenError;

	if (!resetPasswordToken) {
		[newRefreshTokenError] = await to(
			Token.create(
				[
					{
						user: user._id,
						token,
						kind: vars.tokenTypes.resetPassword,
						expireAt: Date.now() + 1000 * 60 * 60 * vars.password.resetTimeLimitInHours,
					},
				],
				{ session }
			)
		);
	} else {
		[newRefreshTokenError] = await to(
			Token.updateOne(
				{
					user: user._id,
					kind: vars.tokenTypes.resetPassword,
					expireAt: { $gt: new Date().toISOString() },
				},
				{
					$set: {
						token,
						expireAt: Date.now() + 1000 * 60 * 60 * vars.password.resetTimeLimitInHours,
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
		filename: "password-reset",
		subject: `[${vars.app.name}] Resetting Password.`,
		actionUrl: `${vars.app.frontEndUrl}/auth/password/reset/${token}`,
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

	req.flash("success", "You have been emailed a reset password link.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};

/**
 * @summary Resets a user's password using a valid password reset token.
 * @description Updates the password for a user identified by a valid password reset token.
 *
 * @param {Object} req - Express request object.
 * @param {String} req.params.token - The password reset token received via email.
 * @param {Object} req.body - Request body containing the new password.
 * @param {String} req.body.password - The new password for the user.
 * @param {String} req.body.passwordConfirmation - The new password confirmation for the user.

 * @returns {Object} 200 - Success response with a success message.
 */
export const postResetPassword = async (
	req: Request,
	res: Response,
	next: NextFunction
): Promise<void> => {
	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	const [resetPasswordTokenError, resetPasswordToken] = await to(
		Token.findOne({
			token: req.params.token,
			kind: vars.tokenTypes.resetPassword,
			expireAt: { $gt: new Date().toISOString() },
		}).session(session)
	);
	if (resetPasswordTokenError) {
		handleTransactionError(session);
		return next(resetPasswordTokenError);
	}
	if (!resetPasswordToken) {
		handleTransactionError(session);
		const error = createError(httpStatus.BAD_REQUEST, "token is invalid or has expired.");
		return next({ ...(error || {}), status: error.status });
	}

	let userError = null;
	let user: IUserDocument | null | undefined;

	[userError, user] = await to(User.findOne({ _id: resetPasswordToken.user }).session(session));
	if (userError || !user) {
		handleTransactionError(session);
		return next(userError);
	}

	user = Object.assign(user, {
		...(req?.body?.password ? { password: req.body.password } : {}),
	});

	const [newUserError, newUser] = await to<IUserDocument>(user.save({ session }));
	if (newUserError) {
		handleTransactionError(session);
		return next(newUserError);
	}

	const [deleteResetPasswordTokenError] = await to(
		Token.deleteOne({
			user: newUser._id,
			kind: vars.tokenTypes.resetPassword,
			expireAt: { $gt: new Date().toISOString() },
		}).session(session)
	);
	if (deleteResetPasswordTokenError) {
		handleTransactionError(session);
		return next(deleteResetPasswordTokenError);
	}

	const [sendEmailError, sendEmail] = await emailService.send({
		to: newUser,
		from: vars.email.sender,
		filename: "password-updated",
		subject: `[${vars.app.name}] Resetting Password Confirmation.`,
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

	// Commit the transaction
	await session.commitTransaction();
	session.endSession();

	req.flash("success", "successfully updated password.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			flashes: req.flash(),
		})
	);
};
