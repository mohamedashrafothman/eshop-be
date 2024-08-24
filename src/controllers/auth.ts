import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body } from "express-validator";
import createError from "http-errors";
import httpStatus from "http-status";
import jsonwebtoken, { type JwtPayload, type VerifyErrors } from "jsonwebtoken";
import passport, { type Profile } from "passport";
import { type VerifiedCallback } from "passport-jwt";
import { type IVerifyOptions } from "passport-local";
import Email from "../models/Email";
import Token from "../models/Token";
import User, { type IUserDocument } from "../models/User";
import emailService from "../services/email";
import { formatResponseObject } from "../utils/helpers";
import vars from "../utils/vars";

export const validator = (method: string) => {
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
				body("name").trim().escape().notEmpty().withMessage("You must supply a name!"),
				body("providerId").notEmpty().withMessage("Provider id can't be blank!").trim(),
				body("providerToken")
					.trim()
					.notEmpty()
					.withMessage("Provider access token can't be blank!"),
				body("picture").optional(),
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

export const _passportLocalStrategy = async (
	req: Request,
	email: IUserDocument["email"],
	password: IUserDocument["password"],
	done: (error: any, user?: Express.User | false, options?: IVerifyOptions) => void
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
	done: VerifiedCallback
) => {
	const [userError, user] = await to(User.findOne({ _id }));
	if (userError) return done(userError, false);
	if (!user) return done(null, false);

	const [tokenError, token] = await to(
		Token.findOne({
			user: user._id,
			kind: vars.tokenTypes.jwt,
			expireAt: { $gt: Date.now() },
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
	done: (error: any, user?: any, info?: any) => void
) => {
	if (req.isAuthenticated()) {
		const [existsUserError, existsUser] = await to(User.findOne({ google: profile?.id }));
		if (existsUserError) return done(existsUserError);
		if (existsUser) {
			req.flash(
				"danger",
				"There is already an account using this email address. Sign in to that account and link it with Google manually from Account Settings."
			);
			return done(null);
		}

		let userError = null;
		let user;

		[userError, user] = await to(User.findOne({ _id: req.user._id }));
		if (userError) return done(userError);
		if (!user) return done(new Error("No User Found"));

		user = Object.assign(user, {
			...(profile?.id ? { google: profile.id } : {}),
			...(!user?.name && profile?.displayName ? { name: profile.displayName } : {}),
			emailVerified: true,
			active: true,
		});

		const [tokenError, token] = await to(
			Token.findOne({ user: user._id, kind: vars.tokenTypes.google })
		);
		if (tokenError) return done(tokenError);

		let newRefreshTokenError;

		if (!token) {
			[newRefreshTokenError] = await to(
				Token.create({
					user: user._id,
					token: accessToken,
					kind: vars.tokenTypes.google,
				})
			);
		} else {
			[newRefreshTokenError] = await to(
				Token.updateOne(
					{ user: user._id, kind: vars.tokenTypes.google },
					{ $set: { token: accessToken } }
				)
			);
		}

		if (newRefreshTokenError) return done(newRefreshTokenError);

		const [saveError] = await to(user.save());
		if (saveError) return done(saveError);

		req.flash("success", "Google Account has been linked!");
		return done(null, user);
	}

	const [existsUserError, existsUser] = await to(User.findOne({ google: profile?.id }));
	if (existsUserError) return done(existsUserError);
	if (existsUser) {
		const [updatedUserError] = await to(
			User.updateOne(
				{ _id: existsUser?._id },
				{ $set: { active: true, emailVerified: true } }
			)
		);
		if (updatedUserError) return done(updatedUserError);

		const [userError, user] = await to(User.findOne({ _id: existsUser?._id }));
		if (userError) return done(userError);

		req.flash("success", "Welcome Back!");
		return done(null, user);
	}

	const [existsEmailError, existsEmail] = await to(
		User.findOne({ email: profile?.emails?.[0]?.value || "" })
	);
	if (existsEmailError) return done(existsEmailError);
	if (existsEmail) {
		req.flash(
			"danger",
			`There is already an account using this email address. Sign in to that account and link it with Google manually from Account Settings.`
		);
		return done(null);
	}

	const user = {
		name: profile.displayName,
		email: profile?.emails?.[0]?.value || "",
		google: profile.id,
		active: true,
		emailVerified: true,
	};

	const [newUserError, newUser] = await to(User.create(user));
	if (newUserError) return done(newUserError);

	const [newRefreshTokenError] = await to(
		Token.create({
			user: newUser._id,
			token: accessToken,
			kind: vars.tokenTypes.google,
		})
	);
	if (newRefreshTokenError) return done(newRefreshTokenError);

	req.flash("success", "Welcome Back!");
	return done(null, newUser);
};

export const _passportFacebookStrategy = async (
	req: Request,
	accessToken: string,
	_refreshToken: string,
	profile: Profile,
	done: (error: any, user?: any, info?: any) => void
) => {
	if (req.isAuthenticated()) {
		const [existsUserError, existsUser] = await to(User.findOne({ facebook: profile?.id }));
		if (existsUserError) return done(existsUserError);
		if (existsUser) {
			req.flash(
				"danger",
				"There is already an account using this email address. Sign in to that account and link it with Facebook manually from Account Settings."
			);
			return done(
				new Error(
					"There is already an account using this email address. Sign in to that account and link it with Facebook manually from Account Settings."
				)
			);
		}

		let [userError, user] = await to(User.findOne({ _id: req.user._id }));
		if (userError) return done(userError);
		if (!user) return done(new Error("No User Found"));

		user = Object.assign(user, {
			...(profile?.id ? { facebook: profile.id } : {}),
			...(!user?.name &&
			(profile?.name?.givenName || profile?.name?.middleName || profile?.name?.familyName)
				? {
						name: `${profile.name.givenName} ${profile.name.middleName} ${profile.name.familyName}`,
					}
				: {}),
			...(!user?.picture
				? {
						picture: `https://graph.facebook.com/${profile.id}/picture?type=large`,
					}
				: {}),
			emailVerified: true,
			active: true,
		});

		const [tokenError, token] = await to(
			Token.findOne({
				user: user._id,
				kind: vars.tokenTypes.facebook,
			})
		);
		if (tokenError) return done(tokenError);

		let newRefreshTokenError;

		if (!token) {
			[newRefreshTokenError] = await to(
				Token.create({
					user: user._id,
					token: accessToken,
					kind: vars.tokenTypes.facebook,
				})
			);
		} else {
			[newRefreshTokenError] = await to(
				Token.updateOne(
					{ user: user._id, kind: vars.tokenTypes.facebook },
					{ $set: { token: accessToken } }
				)
			);
		}
		if (newRefreshTokenError) return done(newRefreshTokenError);

		const [saveError] = await to(user.save());
		if (saveError) return done(saveError);

		req.flash("success", "Facebook Account has been linked!");
		return done(null, user);
	}

	const [existsUserError, existsUser] = await to(User.findOne({ facebook: profile?.id }));
	if (existsUserError) return done(existsUserError);
	if (existsUser) {
		const [updatedUserError] = await to(
			User.updateOne(
				{ _id: existsUser?._id },
				{ $set: { active: true, emailVerified: true } }
			)
		);
		if (updatedUserError) return done(updatedUserError);

		const [userError, user] = await to(User.findOne({ _id: existsUser?._id }));
		if (userError) return done(userError);

		req.flash("success", "Welcome Back!");
		return done(null, user);
	}

	const [existsEmailError, existsEmail] = await to(
		User.findOne({ email: profile?.emails?.[0]?.value || "" })
	);
	if (existsEmailError) return done(existsEmailError);
	if (existsEmail) {
		req.flash(
			"danger",
			`There is already an account using this email address. Sign in to that account and link it with Google manually from Account Settings.`
		);
		return done(null);
	}

	const user = {
		name:
			profile.displayName ||
			`${profile?.name?.givenName || ""} ${profile?.name?.middleName || ""} ${
				profile?.name?.familyName || ""
			}`,
		picture: `https://graph.facebook.com/${profile.id}/picture?type=large`,
		email: profile?.emails?.[0]?.value || "",
		facebook: profile.id,
		active: true,
		emailVerified: true,
	};

	const [newUserError, newUser] = await to(User.create(user));
	if (newUserError) return done(newUserError);

	const [newRefreshTokenError] = await to(
		Token.create({
			user: newUser._id,
			token: accessToken,
			kind: vars.tokenTypes.facebook,
		})
	);
	if (newRefreshTokenError) return done(newRefreshTokenError);

	req.flash("success", "Welcome Back!");
	return done(null, newUser);
};

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
 * @param {string} req.params.provider - The social provider name (e.g., 'google', 'facebook').
 * @param {Object} req.body - Social login data including provider ID, email, name, and provider access token.
 *   * @property {string} req.body.providerId - User's ID in the social provider.
 *   * @property {string} req.body.email - User's email address.
 *   * @property {string} req.body.name - User's name.
 *   * @property {string} req.body.picture - User's profile picture URL (optional).
 *   * @property {string} req.body.providerToken - Access token received from the social provider.
 *
 * @returns {object} 200 - Success response containing user data, access and refresh tokens, and a success message.
 *   * @property {object} entities.data - The user data.
 */
export const postSocialUser = async (req: Request, res: Response, next: NextFunction) => {
	if (req.isAuthenticated()) {
		const [existsUserError, existsUser] = await to(
			User.findOne({ [req.params.provider]: req.body.providerId })
		);
		if (existsUserError) return next(existsUserError);
		if (existsUser) {
			req.flash(
				"danger",
				`There is already an account using this email address. Sign in to that account and link it with Google manually from Account Settings.`
			);
			return next();
		}

		let [userError, user] = await to(User.findOne({ _id: req.user._id }));
		if (userError) return next(userError);
		if (!user) return next();

		user = Object.assign(user, {
			[req.params.provider]: req.body.providerId,
			...(req?.body?.name ? { name: req.body.name } : {}),
			...(req?.body?.picture ? { picture: req.body.picture } : {}),
			emailVerified: true,
			active: true,
		});

		const [tokenError, token] = await to(
			Token.findOne({
				user: user._id,
				kind: vars.tokenTypes?.[req.params.provider as keyof typeof vars.tokenTypes] || "",
			})
		);
		if (tokenError) return next(tokenError);

		let newSocialProviderTokenError;

		if (!token) {
			[newSocialProviderTokenError] = await to(
				Token.create({
					user: user._id,
					token: req.body.providerToken,
					kind: vars.tokenTypes[req.params.provider as keyof typeof vars.tokenTypes],
				})
			);
		} else {
			[newSocialProviderTokenError] = await to(
				Token.updateOne(
					{
						user: user._id,
						kind: vars.tokenTypes[req.params.provider as keyof typeof vars.tokenTypes],
					},
					{ $set: { token: req.body.providerToken } }
				)
			);
		}
		if (newSocialProviderTokenError) return next(newSocialProviderTokenError);

		const [saveError] = await to(user.save());
		if (saveError) return next(saveError);

		const accessToken = jsonwebtoken.sign(
			{
				sub: user._id.toString(),
				iat: Math.floor(Date.now() / 1000),
			},
			vars.auth.strategies.jwt.accessTokenSecret,
			{
				expiresIn: `${vars.auth.strategies.jwt.accessTokenExpiresInMinutes}m`,
			}
		);
		const refreshToken = jsonwebtoken.sign(
			{
				sub: user._id.toString(),
				iat: Math.floor(Date.now() / 1000),
			},
			vars.auth.strategies.jwt.refreshTokenSecret,
			{
				expiresIn: `${vars.auth.strategies.jwt.refreshTokenExpiresInDays}d`,
			}
		);

		const [newRefreshTokenError] = await to(
			Token.create({
				user: user._id,
				token: refreshToken,
				kind: vars.tokenTypes.jwt,
				expireAt:
					Date.now() +
					1000 * 60 * 60 * 24 * vars.auth.strategies.jwt.refreshTokenExpiresInDays,
			})
		);
		if (newRefreshTokenError) return next(newRefreshTokenError);

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
	}

	const [existsUserError, existsUser] = await to(
		User.findOne({ [req.params.provider]: req.body.providerId })
	);
	if (existsUserError) return next(existsUserError);
	if (existsUser) {
		const [updatedUserError] = await to(
			User.updateOne(
				{ _id: existsUser?._id },
				{ $set: { active: true, emailVerified: true } }
			)
		);
		if (updatedUserError) return next(updatedUserError);

		const [userError, user] = await to(User.findOne({ _id: existsUser?._id }));
		if (userError) return next(userError);
		if (!user) return next();

		const accessToken = jsonwebtoken.sign(
			{
				sub: user._id.toString(),
				iat: Math.floor(Date.now() / 1000),
			},
			vars.auth.strategies.jwt.accessTokenSecret,
			{
				expiresIn: `${vars.auth.strategies.jwt.accessTokenExpiresInMinutes}m`,
			}
		);
		const refreshToken = jsonwebtoken.sign(
			{
				sub: user._id.toString(),
				iat: Math.floor(Date.now() / 1000),
			},
			vars.auth.strategies.jwt.refreshTokenSecret,
			{
				expiresIn: `${vars.auth.strategies.jwt.refreshTokenExpiresInDays}d`,
			}
		);

		const [userRefreshTokenError, userRefreshToken] = await to(
			Token.findOne({
				user: user._id,
				kind: vars.tokenTypes.jwt,
				expireAt: { $gt: Date.now() },
			})
		);
		if (userRefreshTokenError) return next(userRefreshTokenError);

		let newRefreshTokenError;

		if (!userRefreshToken) {
			[newRefreshTokenError] = await to(
				Token.create({
					user: user._id,
					token: refreshToken,
					kind: vars.tokenTypes.jwt,
					expireAt:
						Date.now() +
						1000 * 60 * 60 * 24 * vars.auth.strategies.jwt.refreshTokenExpiresInDays,
				})
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
				)
			);
		}
		if (newRefreshTokenError) return next(newRefreshTokenError);

		req.flash("success", "Welcome Back!");
		return res.status(httpStatus.OK).json(
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
	}

	const [existsEmailError, existsEmail] = await to(User.findOne({ email: req.body.email }));
	if (existsEmailError) return next(existsEmailError);
	if (existsEmail) {
		req.flash(
			"danger",
			`There is already an account using this email address. Sign in to that account and link it with Google manually from Account Settings.`
		);
		return next();
	}

	const [newUserError, newUser] = await to(
		User.create({
			email: req.body.email,
			name: req.body.name,
			...(req.body.picture && { picture: req.body.picture }),
			[req.params.provider]: req.body.providerId,
			active: true,
			emailVerified: true,
		})
	);
	if (newUserError) return next(newUserError);

	const [newSocialProviderTokenError] = await to(
		Token.create({
			user: newUser._id,
			token: req.body.providerToken,
			kind: vars.tokenTypes[req.params.provider as keyof typeof vars.tokenTypes],
		})
	);
	if (newSocialProviderTokenError) return next(newSocialProviderTokenError);

	const accessToken = jsonwebtoken.sign(
		{ sub: newUser._id.toString(), iat: Math.floor(Date.now() / 1000) },
		vars.auth.strategies.jwt.accessTokenSecret,
		{
			expiresIn: `${vars.auth.strategies.jwt.accessTokenExpiresInMinutes}m`,
		}
	);
	const refreshToken = jsonwebtoken.sign(
		{ sub: newUser._id.toString(), iat: Math.floor(Date.now() / 1000) },
		vars.auth.strategies.jwt.refreshTokenSecret,
		{
			expiresIn: `${vars.auth.strategies.jwt.refreshTokenExpiresInDays}d`,
		}
	);

	const [newRefreshTokenError] = await to(
		Token.create({
			user: newUser._id,
			token: refreshToken,
			kind: vars.tokenTypes.jwt,
			expireAt:
				Date.now() +
				1000 * 60 * 60 * 24 * vars.auth.strategies.jwt.refreshTokenExpiresInDays,
		})
	);
	if (newRefreshTokenError) return next(newRefreshTokenError);

	req.flash("success", "Account Registered Successfully");
	res.status(httpStatus.CREATED).json(
		formatResponseObject({
			status: httpStatus.CREATED,
			entities: {
				data: {
					...(newUser?.toJSON() || {}),
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
 * @param {string} req.params.provider - The social provider name (e.g., 'google', 'facebook').

 * @returns {object} 200 - Success response with a success message.
 */
export const getSocialUnlink = async (req: Request, res: Response, next: NextFunction) => {
	const { provider } = req.params || {};
	const _id = req.user?.id || "";

	const [deleteTokenError] = await to(
		Token.deleteOne({
			user: _id,
			kind: vars.tokenTypes[provider as keyof typeof vars.tokenTypes],
		})
	);
	if (deleteTokenError) return next(deleteTokenError);

	const [updateUserError] = await to(User.updateOne({ _id }, { $unset: { [provider]: 1 } }));
	if (updateUserError) return next(updateUserError);

	req.flash("success", `${provider} account has been unlinked.`);
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Logs in a user with email and password.
 * @description Attempts to authenticate a user using their email and password. If successful, activates the user's account (if inactive) and generates access and refresh tokens for the user.
 *
 * @param {Object} req - Express request object.
 * @param {string} req.body.email - User's email address.
 * @param {string} req.body.password - User's password.
 *
 * @returns {object} 200 - Success response containing user data, access and refresh tokens, and a success message.
 *   * @property {object} entities.data - The user data.
 */
export const postLogin = async (req: Request, res: Response, next: NextFunction) => {
	const { email } = req.body;
	const [userError, user] = await to(User.findOne({ email }));
	if (userError) return next(userError);
	if (!user) return next();

	user.comparePassword(req.body.password, async (compareError, isMatch) => {
		if (compareError) return next(compareError);
		if (!isMatch) {
			req.flash("danger", "Your credentials doesn't match our records.");
			const error = createError(httpStatus.UNPROCESSABLE_ENTITY);
			return next({ ...(error || {}), status: error.status });
		}

		const [updateUserError] = await to(
			User.updateOne({ email: user.email, active: false }, { $set: { active: true } })
		);
		if (updateUserError) return next(updateUserError);

		const accessToken = jsonwebtoken.sign(
			{
				sub: user._id.toString(),
				iat: Math.floor(Date.now() / 1000),
			},
			vars.auth.strategies.jwt.accessTokenSecret,
			{
				expiresIn: `${vars.auth.strategies.jwt.accessTokenExpiresInMinutes}m`,
			}
		);
		const refreshToken = jsonwebtoken.sign(
			{
				sub: user._id.toString(),
				iat: Math.floor(Date.now() / 1000),
			},
			vars.auth.strategies.jwt.refreshTokenSecret,
			{
				expiresIn: `${vars.auth.strategies.jwt.refreshTokenExpiresInDays}d`,
			}
		);

		const [userRefreshTokenError, userRefreshToken] = await to(
			Token.findOne({
				user: user._id,
				kind: vars.tokenTypes.jwt,
				expireAt: { $gt: Date.now() },
			})
		);
		if (userRefreshTokenError) return next(userRefreshTokenError);
		let newRefreshTokenError;

		if (!userRefreshToken) {
			[newRefreshTokenError] = await to(
				Token.create({
					user: user._id,
					token: refreshToken,
					kind: vars.tokenTypes.jwt,
					expireAt:
						Date.now() +
						1000 * 60 * 60 * 24 * vars.auth.strategies.jwt.refreshTokenExpiresInDays,
				})
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
				)
			);
		}
		if (newRefreshTokenError) return next(newRefreshTokenError);

		req.flash("success", "Welcome Back!");
		return res.status(httpStatus.OK).json(
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
	});
};

/**
 * @summary Logs out the current user.
 * @description Revokes all tokens associated with the user and deactivates the user account.
 *
 * @returns {object} 200 - Success response with a success message.
 */
export const logout = async (req: Request, res: Response, next: NextFunction) => {
	const _id = req?.user?._id || "";

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
		})
	);
	if (deleteTokenError) return next(deleteTokenError);

	const [updateUserError] = await to(User.updateOne({ _id }, { $set: { active: false } }));
	if (updateUserError) return next(updateUserError);

	req.logout((err) => {
		if (err) return next(err);

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
 * @param {string} req.body.refreshToken - The user's refresh token.
 *
 * @returns {object} 200 - Success response containing a new access token and a refresh token.
 *   * @property {object} entities.data - The data containing new tokens.
 */
export const postRefreshToken = async (req: Request, res: Response, next: NextFunction) => {
	const { refreshToken: refreshToken } = req.body as {
		refreshToken: string;
	};
	const [userRefreshTokenError, userRefreshToken] = await to(
		Token.findOne({
			token: refreshToken,
			kind: vars.tokenTypes.jwt,
			expireAt: { $gt: Date.now() },
		})
	);
	if (userRefreshTokenError) return next(userRefreshTokenError);
	if (!userRefreshToken) {
		req.flash("danger", "Token has been expired, please login again!");
		return res.status(httpStatus.FORBIDDEN).json(
			formatResponseObject({
				status: httpStatus.FORBIDDEN,
				flashes: req.flash(),
			})
		);
	}

	jsonwebtoken.verify(
		refreshToken,
		vars.auth.strategies.jwt.refreshTokenSecret,
		async (error: VerifyErrors | null, payload: JwtPayload | string | undefined) => {
			if (error)
				return next(
					formatResponseObject({
						status: httpStatus.FORBIDDEN,
						error,
					})
				);
			const _id = payload?.sub || "";
			const accessToken = jsonwebtoken.sign(
				{ sub: _id.toString(), iat: Math.floor(Date.now() / 1000) },
				vars.auth.strategies.jwt.accessTokenSecret,
				{
					expiresIn: `${vars.auth.strategies.jwt.accessTokenExpiresInMinutes}m`,
				}
			);
			const refreshToken = jsonwebtoken.sign(
				{ sub: _id.toString(), iat: Math.floor(Date.now() / 1000) },
				vars.auth.strategies.jwt.refreshTokenSecret,
				{
					expiresIn: `${vars.auth.strategies.jwt.refreshTokenExpiresInDays}d`,
				}
			);

			const [newRefreshTokenError] = await to(
				Token.updateOne(
					{
						token: refreshToken,
						kind: vars.tokenTypes.jwt,
						expireAt: { $gt: Date.now() },
					},
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
				)
			);
			if (newRefreshTokenError) return next(newRefreshTokenError);

			return res.status(httpStatus.OK).json(
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
		}
	);
};

/**
 * @summary Initiates password reset process for a user.
 * @description Sends a password reset email to the user's email address if the email exists in the user database.
 *
 * @param {Object} req - Express request object.
 * @param {string} req.body.email - The user's email address.
 *
 * @returns {object} 200 - Success response with a success message.
 */
export const postForgotPassword = async (req: Request, res: Response, next: NextFunction) => {
	const { email } = req.body;
	const [userError, user] = await to(User.findOne({ email }));
	if (userError) return next(userError);
	if (!user) {
		req.flash("danger", "No account found with this email.");
		const error = createError(httpStatus.NOT_FOUND);
		return next({ ...(error || {}), status: error.status });
	}

	const token = await user.createHashToken();
	const [resetPasswordTokenError, resetPasswordToken] = await to(
		Token.findOne({
			user: user._id,
			kind: vars.tokenTypes.resetPassword,
			expireAt: { $gt: Date.now() },
		})
	);
	if (resetPasswordTokenError) return next(resetPasswordTokenError);

	let newRefreshTokenError;

	if (!resetPasswordToken) {
		[newRefreshTokenError] = await to(
			Token.create({
				user: user._id,
				token,
				kind: vars.tokenTypes.resetPassword,
				expireAt: Date.now() + 1000 * 60 * 60 * vars.password.resetTimeLimitInHours,
			})
		);
	} else {
		[newRefreshTokenError] = await to(
			Token.updateOne(
				{
					user: user._id,
					kind: vars.tokenTypes.resetPassword,
					expireAt: { $gt: Date.now() },
				},
				{
					$set: {
						token,
						expireAt: Date.now() + 1000 * 60 * 60 * vars.password.resetTimeLimitInHours,
					},
				}
			)
		);
	}

	if (newRefreshTokenError) return next(newRefreshTokenError);

	const [sendEmailError, sendEmail] = await emailService.send({
		to: user,
		from: vars.email.sender,
		filename: "password-reset",
		subject: `[${vars.app.name}] Resetting Password.`,
		actionUrl: `${vars.app.frontEndUrl}/auth/password/reset/${token}`,
	});
	if (sendEmailError) return next(sendEmailError);

	const [newEmailError] = await to(Email.create(sendEmail));
	if (newEmailError) return next(newEmailError);

	req.flash("success", "You have been emailed a reset password link.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Resets a user's password using a valid password reset token.
 * @description Updates the password for a user identified by a valid password reset token.
 *
 * @param {Object} req - Express request object.
 * @param {string} req.params.token - The password reset token received via email.
 * @param {Object} req.body - Request body containing the new password.
 * @param {string} req.body.password - The new password for the user.
 * @param {string} req.body.passwordConfirmation - The new password confirmation for the user.

 * @returns {object} 200 - Success response with a success message.
 */
export const postResetPassword = async (req: Request, res: Response, next: NextFunction) => {
	const [resetPasswordTokenError, resetPasswordToken] = await to(
		Token.findOne({
			token: req.params.token,
			kind: vars.tokenTypes.resetPassword,
			expireAt: { $gt: Date.now() },
		})
	);
	if (resetPasswordTokenError) return next(resetPasswordTokenError);
	if (!resetPasswordToken) {
		req.flash("danger", "token is invalid or has expired.");
		const error = createError(httpStatus.NOT_FOUND);
		return next({ ...(error || {}), status: error.status });
	}

	let userError = null;
	let user: IUserDocument | null | undefined;

	[userError, user] = await to(User.findOne({ _id: resetPasswordToken.user }));
	if (userError) return next(userError);
	if (!user) return next();

	user = Object.assign(user, {
		...(req?.body?.password ? { password: req.body.password } : {}),
	});

	const [newUserError, newUser] = await to<IUserDocument>(user.save());
	if (newUserError) return next(newUserError);

	const [deleteResetPasswordTokenError] = await to(
		Token.deleteOne({
			user: newUser._id,
			kind: vars.tokenTypes.resetPassword,
			expireAt: { $gt: Date.now() },
		})
	);
	if (deleteResetPasswordTokenError) return next(deleteResetPasswordTokenError);

	const [sendEmailError, sendEmail] = await emailService.send({
		to: newUser,
		from: vars.email.sender,
		filename: "password-updated",
		subject: `[${vars.app.name}] Resetting Password Confirmation.`,
		siteName: vars.app.name,
	});
	if (sendEmailError) return next(sendEmailError);

	const [newEmailError] = await to(Email.create(sendEmail));
	if (newEmailError) return next(newEmailError);

	req.flash("success", "successfully updated password.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Verifies a user's email using a valid email verification token.
 * @description Marks a user's email as verified if the provided email verification token is valid and not expired.
 *
 * @param {Object} req - Express request object.
 * @param {string} req.params.token - The email verification token received via email.
 *
 * @returns {object} 200 - Success response with a success message.
 */
export const getEmailVerification = async (req: Request, res: Response, next: NextFunction) => {
	const [verifyEmailTokenError, verifyEmailToken] = await to(
		Token.findOne({
			token: req.params.token,
			kind: vars.tokenTypes.verifyEmail,
			expireAt: { $gt: Date.now() },
		})
	);
	if (verifyEmailTokenError) return next(verifyEmailTokenError);
	if (!verifyEmailToken) {
		req.flash("danger", "token is invalid or has expired.");
		const error = createError(httpStatus.NOT_FOUND);
		return next({ ...(error || {}), status: error.status });
	}

	const [userError] = await to(
		User.findOneAndUpdate(
			{ _id: verifyEmailToken.user, emailVerified: { $ne: true } },
			{ $set: { emailVerified: true } }
		)
	);
	if (userError) return next(userError);

	const [deleteVerifyEmailTokenError] = await to(
		Token.deleteOne({
			token: req.params.token,
			kind: vars.tokenTypes.verifyEmail,
			expireAt: { $gt: Date.now() },
		})
	);
	if (deleteVerifyEmailTokenError) return next(deleteVerifyEmailTokenError);

	req.flash("success", "Your account has been Verified");
	return res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Resend an email verification link to a user who hasn't verified their email yet.
 * @description Sends a new email verification token to a user if their email is not verified and a valid verification token doesn't already exist.
 *
 * @returns {object} 200 - Success response with a success message.
 */
export const getResendEmailVerification = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const [userError, user] = await to(
		User.findOne({
			_id: req?.user?._id || "",
			emailVerified: { $ne: true },
		})
	);
	if (userError) return next(userError);
	if (!user) {
		req.flash("danger", "Email Already Verified!");
		const error = createError(httpStatus.NOT_FOUND);
		return next({ ...(error || {}), status: error.status });
	}

	const [userRefreshTokenError, userRefreshToken] = await to(
		Token.findOne({
			user: user._id,
			kind: vars.tokenTypes.verifyEmail,
			expireAt: { $gt: Date.now() },
		})
	);
	if (userRefreshTokenError) return next(userRefreshTokenError);

	const token = await user.createHashToken();

	let newRefreshTokenError;
	if (!userRefreshToken) {
		[newRefreshTokenError] = await to(
			Token.create({
				user: user._id,
				token,
				kind: vars.tokenTypes.verifyEmail,
				expireAt: Date.now() + 1000 * 60 * vars.email.emailVerifyTokenExpiresInMinutes,
			})
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
			)
		);
	}

	if (newRefreshTokenError) return next(newRefreshTokenError);

	const [sendEmailError, sendEmail] = await emailService.send({
		to: user,
		from: vars.email.sender,
		filename: "verify-user",
		subject: `[${vars.app.name}] Verify User Account.`,
		actionUrl: `${vars.app.frontEndUrl}/auth/email/verify/${token}`,
	});
	if (sendEmailError) return next(sendEmailError);

	const [newEmailError] = await to(Email.create(sendEmail));
	if (newEmailError) return next(newEmailError);

	req.flash("success", "Email Verification sent successfully!");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			flashes: req.flash(),
		})
	);
};
