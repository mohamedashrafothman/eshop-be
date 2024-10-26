import allowMethods from "allow-methods";
import { Router } from "express";
import * as shippingMethodsController from "../../../controllers/shippingMethods";
import unprocessableEntityValidator from "../../../middlewares/validator";

// Defining express router
const router = Router();

// Endpoints
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

// Exporting router
export default router;
