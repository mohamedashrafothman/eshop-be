import allowMethods from "allow-methods";
import { Router } from "express";
import * as rolesController from "../../../controllers/roles";
import permission from "../../../middlewares/permission";
import unprocessableEntityValidator from "../../../middlewares/validator";
import PermissionType from "../../../utils/helpers/permissions";

// Defining express router
const router = Router();

// Endpoints
router
	.route("/")
	.all(allowMethods(["get", "post"]))
	.get(permission(PermissionType.READ_ROLES), rolesController.getRoles)
	.post(
		permission(PermissionType.CREATE_ROLE),
		rolesController.validator("create"),
		unprocessableEntityValidator,
		rolesController.postNewRole
	);

router
	.route("/:roleId")
	.all(allowMethods(["get", "patch", "delete"]))
	.get(permission(PermissionType.READ_ROLE), rolesController.getSingleRole)
	.patch(
		permission(PermissionType.UPDATE_ROLE),
		rolesController.validator("update"),
		unprocessableEntityValidator,
		rolesController.updateSingleRole
	)
	.delete(permission(PermissionType.DELETE_ROLE), rolesController.deleteSingleRole);

router
	.route("/:roleId/restore")
	.all(allowMethods(["patch"]), permission(PermissionType.RESTORE_ROLE))
	.patch(rolesController.restoreSingleRole);

// Exporting router
export default router;
