import allowMethods from "allow-methods";
import { Router } from "express";
import * as paymentMethodsController from "../../../controllers/paymentMethods";
import unprocessableEntityValidator from "../../../middlewares/validator";

// Defining express router
const router = Router();

// Endpoints
router
	.route("/")
	.all(allowMethods(["get", "post"]))
	.get(paymentMethodsController.getPaymentMethods)
	.post(
		paymentMethodsController.uploadPaymentMethodIcon,
		paymentMethodsController.validator("create"),
		unprocessableEntityValidator,
		paymentMethodsController.postNewPaymentMethod
	);

router
	.route("/:method")
	.all(allowMethods(["get", "patch", "delete"]))
	.get(paymentMethodsController.getSinglePaymentMethod)
	.patch(
		paymentMethodsController.uploadPaymentMethodIcon,
		paymentMethodsController.validator("update"),
		unprocessableEntityValidator,
		paymentMethodsController.updateSinglePaymentMethod
	)
	.delete(paymentMethodsController.deleteSinglePaymentMethod);

router
	.route("/:method/restore")
	.all(allowMethods(["patch"]))
	.patch(paymentMethodsController.restoreSinglePaymentMethod);

// Exporting router
export default router;
