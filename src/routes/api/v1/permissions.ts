import allowMethods from "allow-methods";
import { Router } from "express";
import * as permissionController from "../../../controllers/permission";
import permission from "../../../middlewares/permission";
// import unprocessableEntityValidator from "../../../middlewares/validator";
import PermissionType from "../../../utils/helpers/permissions";

// Defining express router
const router = Router();

// Endpoints
router
	.route("/")
	.all(allowMethods(["get"]), permission(PermissionType.READ_PERMISSIONS))
	.get(permissionController.getPermissions);

// Exporting router
export default router;
