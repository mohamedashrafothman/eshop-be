import allowMethods from "allow-methods";
import { Router } from "express";
import passport from "passport";
import { default as authController } from "../../controllers/auth";
import vars from "../../utils/vars";

const router = Router();

// Endpoints
router
	.route("/logout")
	.all(allowMethods(["post", "get"]), passport.authenticate("jwt", { session: false }))
	.post(authController.logout)
	.get(authController.logout);
router
	.route("/register")
	.all(allowMethods(["post"]))
	.post(authController.validator("register"), authController.postRegister);
router
	.route("/login")
	.all(allowMethods(["post"]))
	.post(authController.validator("login"), authController.postLogin);
router
	.route("/refresh-token")
	.all(allowMethods(["post"]))
	.post(authController.validator("refresh-token"), authController.postRefreshToken);
router
	.route("/password/forgot")
	.all(allowMethods(["post"]))
	.post(authController.validator("forgot-password"), authController.postForgotPassword);
router
	.route("/password/reset/:token")
	.all(allowMethods(["post"]))
	.post(authController.validator("reset-password"), authController.postResetPassword);
router
	.route("/email/verify/:token")
	.all(allowMethods(["get"]), passport.authenticate("jwt", { session: false }))
	.get(authController.getEmailVerification);
router
	.route("/email/resend")
	.all(allowMethods(["get"]), passport.authenticate("jwt", { session: false }))
	.get(authController.getResendEmailVerification);
router
	.route(`/:provider(${Object.keys(vars.auth.strategies.social).join("|")})`)
	.all(allowMethods(["post"]), (req, res, next) =>
		!req.headers.authorization ? passport.authenticate("jwt", { session: false })(req, res, next) : next()
	)
	.post(authController.validator("social-user"), authController.postSocialUser);
router
	.route(`/:provider(${Object.keys(vars.auth.strategies.social).join("|")})/unlink`)
	.all(allowMethods(["get"]), passport.authenticate("jwt", { session: false }))
	.get(authController.getSocialUnlink);

// Exporting router
export default router;
