import allowMethods from "allow-methods";
import { Router } from "express";
import * as shippingMethodsController from "../../../controllers/shippingMethod";
import unprocessableEntityValidator from "../../../middlewares/validator";

// defining express router
const router = Router();

// endpoints
router
	.route("/")
	.all(allowMethods(["get", "post"]))
	.get(shippingMethodsController.getShippingMethods)
	.post(
		shippingMethodsController.validator("create"),
		unprocessableEntityValidator,
		shippingMethodsController.postNewShippingMethod
	);

router
	.route("/:method")
	.all(allowMethods(["get", "patch", "delete"]))
	.get(shippingMethodsController.getSingleShippingMethod)
	.patch(
		shippingMethodsController.validator("update"),
		unprocessableEntityValidator,
		shippingMethodsController.updateSingleShippingMethod
	)
	.delete(shippingMethodsController.deleteSingleShippingMethod);

router
	.route("/:method/restore")
	.all(allowMethods(["patch"]))
	.patch(shippingMethodsController.restoreSingleShippingMethod);

// exporting router
export default router;
