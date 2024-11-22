import allowMethods from "allow-methods";
import { Router } from "express";
import * as authController from "../../../controllers/auth";
import * as policiesController from "../../../controllers/policies";
import permission from "../../../middlewares/permission";
import unprocessableEntityValidator from "../../../middlewares/validator";
import vars from "../../../utils/vars";

// Defining express router
const router = Router();

// Endpoints
router
	.route("/")
	.all(allowMethods(["get", "post"]))
	.get(policiesController.getPolicies)
	.post(
		authController.passportJWTAuthenticate,
		permission.check([[vars.auth.roles.superAdmin], [vars.auth.roles.admin]]),
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
		permission.check([[vars.auth.roles.superAdmin], [vars.auth.roles.admin]]),
		policiesController.validator("update"),
		unprocessableEntityValidator,
		policiesController.updateSinglePolicy
	)
	.delete(
		authController.passportJWTAuthenticate,
		permission.check([[vars.auth.roles.superAdmin], [vars.auth.roles.admin]]),
		policiesController.deleteSinglePolicy
	);

router
	.route("/:policy/restore")
	.all(
		allowMethods(["patch"]),
		authController.passportJWTAuthenticate,
		permission.check([[vars.auth.roles.superAdmin], [vars.auth.roles.admin]])
	)
	.patch(policiesController.restoreSinglePolicy);

// Exporting router
export default router;
