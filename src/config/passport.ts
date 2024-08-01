import passport from "passport";
import { Strategy as FacebookStrategy } from "passport-facebook";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { ExtractJwt, Strategy as JwtStrategy } from "passport-jwt";
import { Strategy as LocalStrategy } from "passport-local";
import * as authController from "../controllers/auth";
import vars from "../utils/vars";

// serialize and deserialize user
passport.serializeUser(authController._passportSerializeUser);
passport.deserializeUser(authController._passportDeserializeUser);

// sign in using http bearer token
passport.use(
	new JwtStrategy(
		{
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			secretOrKey: vars.auth.strategies.jwt.accessTokenSecret,
		},
		authController._passportJWTStrategy
	)
);

// sign in using local email and password
passport.use(
	new LocalStrategy(
		{
			usernameField: vars.auth.strategies.locale.usernameField,
			passwordField: vars.auth.strategies.locale.passwordField,
			passReqToCallback: true,
		},
		authController._passportLocalStrategy
	)
);

// sign in using facebook
passport.use(
	new FacebookStrategy(
		{
			clientID: vars.auth.strategies.social.facebook.clientId,
			clientSecret: vars.auth.strategies.social.facebook.secret,
			callbackURL: vars.auth.strategies.social.facebook.callbackUrl,
			profileFields: vars.auth.strategies.social.facebook.profileFields,
			passReqToCallback: true,
		},
		authController._passportFacebookStrategy
	)
);

// sign in using google
passport.use(
	new GoogleStrategy(
		{
			clientID: vars.auth.strategies.social.google.clientId,
			clientSecret: vars.auth.strategies.social.google.secret,
			callbackURL: vars.auth.strategies.social.google.callbackUrl,
			scope: vars.auth.strategies.social.google.profileFields,
			passReqToCallback: true,
		},
		authController._passportGoogleStrategy
	)
);
