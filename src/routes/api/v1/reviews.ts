import allowMethods from "allow-methods";
import { Router } from "express";
import * as authController from "../../../controllers/auth";
import * as reviewsController from "../../../controllers/reviews";
import permission from "../../../middlewares/permission";
import unprocessableEntityValidator from "../../../middlewares/validator";
import vars from "../../../utils/vars";

// defining express router
const router = Router();

// endpoints
router
	.route("/")
	.all(allowMethods(["post", "get"]))
	.get(authController.passportJWTSerialize, reviewsController.getReviews)
	.post(
		authController.passportJWTAuthenticate,
		permission.check([vars.auth.roles.user]),
		reviewsController.validator("create"),
		unprocessableEntityValidator,
		reviewsController.postNewReview
	);

router
	.route("/:review")
	.all(allowMethods(["get", "patch", "delete"]), authController.passportJWTAuthenticate)
	.get(
		permission.check([[vars.auth.roles.superAdmin], [vars.auth.roles.admin]]),
		reviewsController.getSingleReview
	)
	.patch(
		reviewsController.validator("update"),
		unprocessableEntityValidator,
		reviewsController.updateSingleReview
	)
	.delete(reviewsController.deleteSingleReview);

router
	.route("/:review/restore")
	.all(
		allowMethods(["patch"]),
		authController.passportJWTAuthenticate,
		permission.check([[vars.auth.roles.superAdmin], [vars.auth.roles.admin]])
	)
	.patch(reviewsController.restoreSingleReview);

// exporting router
export default router;
