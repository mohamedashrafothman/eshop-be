import allowMethods from "allow-methods";
import { Router } from "express";
import * as usersController from "../../../controllers/users";
import permission from "../../../middlewares/permission";
import unprocessableEntityValidator from "../../../middlewares/validator";
import PermissionType from "../../../utils/helpers/permissions";

// Defining express router
const router = Router();

// Endpoints
router
	.route("/")
	.all(allowMethods(["get", "post"]))
	.get(permission(PermissionType.READ_USERS), usersController.getUsers)
	.post(
		permission(PermissionType.CREATE_USER),
		usersController.validator("create"),
		unprocessableEntityValidator,
		usersController.postNewUser
	);

router
	.route("/me")
	.all(allowMethods(["get"]))
	.get(permission(PermissionType.READ_USER), usersController.getCurrentAuthenticatedUser);

router
	.route("/:user")
	.all(allowMethods(["get", "patch", "delete"]))
	.get(permission(PermissionType.READ_USER), usersController.getSingleUser)
	.patch(
		permission(PermissionType.UPDATE_USER),
		usersController.validator("update"),
		unprocessableEntityValidator,
		usersController.updateSingleUser
	)
	.delete(permission(PermissionType.DELETE_USER), usersController.deleteSingleUser);

router
	.route("/:user/restore")
	.all(allowMethods(["patch"]), permission(PermissionType.RESTORE_USER))
	.patch(usersController.restoreSingleUser);

router
	.route("/:user/email/verify/:token")
	.all(allowMethods(["get"]))
	.get(usersController.getUserEmailVerification);

router
	.route("/:user/email/resend")
	.all(allowMethods(["get"]))
	.get(usersController.getResendEmailVerification);

// Exporting router
export default router;
