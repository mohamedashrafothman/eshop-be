import allowMethods from "allow-methods";
import { Router } from "express";
import * as authController from "../../../controllers/auth";
import * as policiesController from "../../../controllers/policies";
import permission from "../../../middlewares/permission";
import unprocessableEntityValidator from "../../../middlewares/validator";
import PermissionType from "../../../utils/helpers/permissions";

// Defining express router
const router = Router();

// Endpoints
router
	.route("/")
	.all(allowMethods(["get", "post"]))
	.get(policiesController.getPolicies)
	.post(
		authController.passportJWTAuthenticate,
		permission(PermissionType.MANAGE_SETTINGS),
		policiesController.validator("create"),
		unprocessableEntityValidator,
		policiesController.postNewPolicy
	);

router
	.route("/:policy")
	.all(allowMethods(["get", "patch", "delete"]))
	.get(policiesController.getSinglePolicy)
	.patch(
		authController.passportJWTAuthenticate,
		permission(PermissionType.MANAGE_SETTINGS),
		policiesController.validator("update"),
		unprocessableEntityValidator,
		policiesController.updateSinglePolicy
	)
	.delete(
		authController.passportJWTAuthenticate,
		permission(PermissionType.MANAGE_SETTINGS),
		policiesController.deleteSinglePolicy
	);

router
	.route("/:policy/restore")
	.all(
		allowMethods(["patch"]),
		authController.passportJWTAuthenticate,
		permission(PermissionType.MANAGE_SETTINGS)
	)
	.patch(policiesController.restoreSinglePolicy);

// Exporting router
export default router;
