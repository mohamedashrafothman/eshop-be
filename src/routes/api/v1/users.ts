import allowMethods from "allow-methods";
import { Router } from "express";
import * as usersController from "../../../controllers/users";
import permission from "../../../middlewares/permission";
import unprocessableEntityValidator from "../../../middlewares/validator";
import vars from "../../../utils/vars";

// Defining express router
const router = Router();

// Endpoints
router
	.route("/")
	.all(allowMethods(["get", "post"]), permission.check(vars.auth.roles.superAdmin))
	.get(usersController.getUsers)
	.post(
		usersController.validator("create"),
		unprocessableEntityValidator,
		usersController.postNewUser
	);

router
	.route("/me")
	.all(allowMethods(["get"]))
	.get(usersController.getCurrentAuthenticatedUser);

router
	.route("/:user")
	.all(allowMethods(["get", "patch", "delete"]))
	.get(permission.check(vars.auth.roles.superAdmin), usersController.getSingleUser)
	.patch(
		usersController.validator("update"),
		unprocessableEntityValidator,
		usersController.updateSingleUser
	)
	.delete(permission.check(vars.auth.roles.superAdmin), usersController.deleteSingleUser);

router
	.route("/:user/restore")
	.all(allowMethods(["patch"]), permission.check(vars.auth.roles.superAdmin))
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
