import allowMethods from "allow-methods";
import { Router } from "express";
import * as authController from "../../controllers/auth";
import * as usersController from "../../controllers/users";
import { loginRateLimiter } from "../../middlewares/rateLimiter";
import unprocessableEntityValidator from "../../middlewares/validator";
import vars from "../../utils/vars";

const router = Router();

// Endpoints
router
	.route("/logout")
	.all(allowMethods(["post", "get"]), authController._passportJWTAuthenticate)
	.post(authController.logout)
	.get(authController.logout);
router
	.route("/register")
	.all(allowMethods(["post"]))
	.post(
		usersController._validator("create"),
		unprocessableEntityValidator,
		usersController.postNewUser
	);
router
	.route("/login")
	.all(allowMethods(["post"]))
	.post(
		loginRateLimiter,
		authController._validator("login"),
		unprocessableEntityValidator,
		authController.postLogin
	);
router
	.route("/refresh-token")
	.all(allowMethods(["post"]))
	.post(
		authController._validator("refresh-token"),
		unprocessableEntityValidator,
		authController.postRefreshToken
	);
router
	.route("/password/forgot")
	.all(allowMethods(["post"]))
	.post(
		authController._validator("forgot-password"),
		unprocessableEntityValidator,
		authController.postForgotPassword
	);
router
	.route("/password/reset/:token")
	.all(allowMethods(["post"]))
	.post(
		authController._validator("reset-password"),
		unprocessableEntityValidator,
		authController.postResetPassword
	);
router
	.route("/email/verify/:token")
	.all(allowMethods(["get"]), authController._passportJWTAuthenticate)
	.get(authController.getEmailVerification);
router
	.route("/email/resend")
	.all(allowMethods(["get"]), authController._passportJWTAuthenticate)
	.get(authController.getResendEmailVerification);
router
	.route(`/:provider(${Object.keys(vars.auth.strategies.social).join("|")})`)
	.all(allowMethods(["post"]), (req, res, next) =>
		!req.headers.authorization
			? authController._passportJWTAuthenticate(req, res, next)
			: next()
	)
	.post(
		authController._validator("social-user"),
		unprocessableEntityValidator,
		authController.postSocialUser
	);
router
	.route(`/:provider(${Object.keys(vars.auth.strategies.social).join("|")})/unlink`)
	.all(allowMethods(["get"]), authController._passportJWTAuthenticate)
	.get(authController.getSocialUnlink);

// Exporting router
export default router;
