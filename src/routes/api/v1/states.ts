import allowMethods from "allow-methods";
import { Router } from "express";
import * as authController from "../../../controllers/auth";
import * as statesController from "../../../controllers/states";
import permission from "../../../middlewares/permission";
import unprocessableEntityValidator from "../../../middlewares/validator";
import PermissionType from "../../../utils/helpers/permissions";

// Defining express router
const router = Router();

// Endpoints
router
	.route("/")
	.all(allowMethods(["get", "post"]))
	.get(statesController.getStates)
	.post(
		authController.passportJWTAuthenticate,
		permission(PermissionType.MANAGE_SETTINGS),
		statesController.validator("create"),
		unprocessableEntityValidator,
		statesController.postNewState
	);

router
	.route("/:state")
	.all(
		allowMethods(["get", "patch", "delete"]),
		authController.passportJWTAuthenticate,
		permission(PermissionType.MANAGE_SETTINGS)
	)
	.get(statesController.getSingleState)
	.patch(
		statesController.validator("update"),
		unprocessableEntityValidator,
		statesController.updateSingleState
	)
	.delete(statesController.deleteSingleState);

router
	.route("/:state/restore")
	.all(
		allowMethods(["patch"]),
		authController.passportJWTAuthenticate,
		permission(PermissionType.MANAGE_SETTINGS)
	)
	.patch(statesController.restoreSingleState);

// Exporting router
export default router;
