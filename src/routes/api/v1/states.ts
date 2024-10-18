import allowMethods from "allow-methods";
import { Router } from "express";
import * as authController from "../../../controllers/auth";
import * as statesController from "../../../controllers/states";
import permission from "../../../middlewares/permission";
import unprocessableEntityValidator from "../../../middlewares/validator";
import vars from "../../../utils/vars";

// defining express router
const router = Router();

// endpoints
router
	.route("/")
	.all(allowMethods(["get", "post"]))
	.get(statesController.getStates)
	.post(
		authController.passportJWTAuthenticate,
		permission.check([[vars.auth.roles.superAdmin], [vars.auth.roles.admin]]),
		statesController.validator("create"),
		unprocessableEntityValidator,
		statesController.postNewState
	);

router
	.route("/:state")
	.all(
		allowMethods(["get", "patch", "delete"]),
		authController.passportJWTAuthenticate,
		permission.check([[vars.auth.roles.superAdmin], [vars.auth.roles.admin]])
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
		permission.check([[vars.auth.roles.superAdmin], [vars.auth.roles.admin]])
	)
	.patch(statesController.restoreSingleState);

// exporting router
export default router;
