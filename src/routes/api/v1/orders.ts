import allowMethods from "allow-methods";
import { Router } from "express";
import * as ordersController from "../../../controllers/orders";
import permission from "../../../middlewares/permission";
import unprocessableEntityValidator from "../../../middlewares/validator";
import PermissionType from "../../../utils/helpers/permissions";

// Defining express router
const router = Router();

// Endpoints
router
	.route("/")
	.all(allowMethods(["get", "post"]))
	.get(permission(PermissionType.READ_ORDERS), ordersController.getOrders)
	.post(
		permission(PermissionType.CREATE_ORDER),
		ordersController.validator("create"),
		unprocessableEntityValidator,
		ordersController.postNewOrder
	);

router
	.route("/:order")
	.all(allowMethods(["get", "patch", "delete"]))
	.get(permission(PermissionType.READ_ORDER), ordersController.getSingleOrder)
	.patch(
		permission(PermissionType.UPDATE_ORDER),
		ordersController.validator("update"),
		unprocessableEntityValidator,
		ordersController.updateSingleOrder
	)
	.delete(permission(PermissionType.DELETE_ORDER), ordersController.deleteSingleOrder);

router
	.route("/:order/items/:orderItem")
	.all(allowMethods(["patch"]), permission(PermissionType.UPDATE_ORDER))
	.patch(
		ordersController.validator("item/update"),
		unprocessableEntityValidator,
		ordersController.updateOrderItem
	);

router
	.route("/:order/restore")
	.all(allowMethods(["patch"]), permission(PermissionType.RESTORE_ORDER))
	.patch(ordersController.restoreSingleOrder);

// Exporting router
export default router;
