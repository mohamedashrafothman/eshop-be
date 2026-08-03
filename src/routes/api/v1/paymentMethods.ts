import allowMethods from "allow-methods";
import { Router } from "express";
import * as paymentMethodsController from "../../../controllers/paymentMethods";
import permission from "../../../middlewares/permission";
import unprocessableEntityValidator from "../../../middlewares/validator";
import PermissionType from "../../../utils/helpers/permissions";

// Defining express router
const router = Router();

// Endpoints
router
	.route("/")
	.all(allowMethods(["get", "post"]))
	.get(paymentMethodsController.getPaymentMethods)
	.post(
		permission(PermissionType.MANAGE_SETTINGS),
		paymentMethodsController.uploadPaymentMethodIcon,
		paymentMethodsController.validator("create"),
		unprocessableEntityValidator,
		paymentMethodsController.postNewPaymentMethod
	);

router
	.route("/:method")
	.all(allowMethods(["get", "patch", "delete"]), permission(PermissionType.MANAGE_SETTINGS))
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
	.all(allowMethods(["patch"]), permission(PermissionType.MANAGE_SETTINGS))
	.patch(paymentMethodsController.restoreSinglePaymentMethod);

// Exporting router
export default router;
