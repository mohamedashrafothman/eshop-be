import allowMethods from "allow-methods";
import { Router } from "express";
import * as shippingMethodsController from "../../../controllers/shippingMethods";
import permission from "../../../middlewares/permission";
import unprocessableEntityValidator from "../../../middlewares/validator";
import PermissionType from "../../../utils/helpers/permissions";

// Defining express router
const router = Router();

// Endpoints
router
	.route("/")
	.all(allowMethods(["get", "post"]))
	.get(shippingMethodsController.getShippingMethods)
	.post(
		permission(PermissionType.MANAGE_SETTINGS),
		shippingMethodsController.validator("create"),
		unprocessableEntityValidator,
		shippingMethodsController.postNewShippingMethod
	);

router
	.route("/:method")
	.all(allowMethods(["get", "patch", "delete"]), permission(PermissionType.MANAGE_SETTINGS))
	.get(shippingMethodsController.getSingleShippingMethod)
	.patch(
		shippingMethodsController.validator("update"),
		unprocessableEntityValidator,
		shippingMethodsController.updateSingleShippingMethod
	)
	.delete(shippingMethodsController.deleteSingleShippingMethod);

router
	.route("/:method/restore")
	.all(allowMethods(["patch"]), permission(PermissionType.MANAGE_SETTINGS))
	.patch(shippingMethodsController.restoreSingleShippingMethod);

// Exporting router
export default router;
