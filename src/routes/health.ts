import allowMethods from "allow-methods";
import { Router } from "express";
import * as healthController from "../controllers/health";
import permission from "../middlewares/permission";
import PermissionType from "../utils/helpers/permissions";

// Defining express router
const router = Router();

// Endpoints
router
	.route("/")
	.all(allowMethods(["get"]))
	.get(permission(PermissionType.MANAGE_SETTINGS), healthController.getHealth);

// Exporting router
export default router;
