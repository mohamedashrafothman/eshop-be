import allowMethods from "allow-methods";
import { Router } from "express";
import * as shippingMethodsController from "../../../controllers/shippingMethods";
import permission from "../../../middlewares/permission";
import unprocessableEntityValidator from "../../../middlewares/validator";
import vars from "../../../utils/vars";

// Defining express router
const router = Router();

// Endpoints
router
	.route("/")
	.all(allowMethods(["get", "post"]))
	.get(shippingMethodsController.getShippingMethods)
	.post(
		permission.check([[vars.auth.roles.superAdmin], [vars.auth.roles.admin]]),
		shippingMethodsController.validator("create"),
		unprocessableEntityValidator,
		shippingMethodsController.postNewShippingMethod
	);

router
	.route("/:method")
	.all(
		allowMethods(["get", "patch", "delete"]),
		permission.check([[vars.auth.roles.superAdmin], [vars.auth.roles.admin]])
	)
	.get(shippingMethodsController.getSingleShippingMethod)
	.patch(
		shippingMethodsController.validator("update"),
		unprocessableEntityValidator,
		shippingMethodsController.updateSingleShippingMethod
	)
	.delete(shippingMethodsController.deleteSingleShippingMethod);

router
	.route("/:method/restore")
	.all(
		allowMethods(["patch"]),
		permission.check([[vars.auth.roles.superAdmin], [vars.auth.roles.admin]])
	)
	.patch(shippingMethodsController.restoreSingleShippingMethod);

// Exporting router
export default router;
