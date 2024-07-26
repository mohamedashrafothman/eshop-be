import allowMethods from "allow-methods";
import { Router } from "express";
import { default as usersController } from "../../controllers/users";
import permission from "../../middlewares/permission";
import vars from "../../utils/vars";

const router = Router();

// Endpoints
router
	.route("/")
	.all(allowMethods(["get"]), permission.check(vars.auth.roles.admin))
	.get(usersController.getUsers);
router
	.route("/me")
	.all(allowMethods(["get"]))
	.get(usersController.getCurrentAuthenticatedUser);
router
	.route("/:user")
	.all(allowMethods(["get", "patch", "delete"]), permission.check(vars.auth.roles.admin))
	.get(usersController.getSingleUser)
	.patch(usersController.validator("update"), usersController.updateSingleUser)
	.delete(usersController.deleteSingleUser);
router
	.route("/:user/restore")
	.all(allowMethods(["patch"]), permission.check(vars.auth.roles.admin))
	.patch(usersController.restoreSingleUser);

// Exporting router
export default router;
