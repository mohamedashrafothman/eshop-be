import allowMethods from "allow-methods";
import { Router } from "express";
import * as authController from "../../../controllers/auth";
import * as reviewsController from "../../../controllers/reviews";
import permission from "../../../middlewares/permission";
import unprocessableEntityValidator from "../../../middlewares/validator";
import PermissionType from "../../../utils/helpers/permissions";

// Defining express router
const router = Router();

// Endpoints
router
	.route("/")
	.all(allowMethods(["post", "get"]))
	.get(authController.passportJWTSerialize, reviewsController.getReviews)
	.post(
		authController.passportJWTAuthenticate,
		permission(PermissionType.CREATE_REVIEW),
		reviewsController.validator("create"),
		unprocessableEntityValidator,
		reviewsController.postNewReview
	);

router
	.route("/:review")
	.all(allowMethods(["get", "patch", "delete"]), authController.passportJWTAuthenticate)
	.get(permission(PermissionType.READ_REVIEW), reviewsController.getSingleReview)
	.patch(
		permission(PermissionType.UPDATE_REVIEW),
		reviewsController.validator("update"),
		unprocessableEntityValidator,
		reviewsController.updateSingleReview
	)
	.delete(permission(PermissionType.DELETE_REVIEW), reviewsController.deleteSingleReview);

router
	.route("/:review/restore")
	.all(
		allowMethods(["patch"]),
		authController.passportJWTAuthenticate,
		permission(PermissionType.RESTORE_REVIEW)
	)
	.patch(reviewsController.restoreSingleReview);

// Exporting router
export default router;
