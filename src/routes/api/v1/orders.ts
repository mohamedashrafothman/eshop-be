import allowMethods from "allow-methods";
import { Router } from "express";
import * as ordersController from "../../../controllers/orders";
import permission from "../../../middlewares/permission";
import unprocessableEntityValidator from "../../../middlewares/validator";
import vars from "../../../utils/vars";

// Defining express router
const router = Router();

// Endpoints
router
	.route("/")
	.all(allowMethods(["get", "post"]))
	.get(ordersController.getOrders)
	.post(
		permission.check(vars.auth.roles.user),
		ordersController.validator("create"),
		unprocessableEntityValidator,
		ordersController.postNewOrder
	);

router
	.route("/:order")
	.all(allowMethods(["get", "patch", "delete"]))
	.get(ordersController.getSingleOrder)
	.patch(
		ordersController.validator("update"),
		unprocessableEntityValidator,
		ordersController.updateSingleOrder
	)
	.delete(
		permission.check([[vars.auth.roles.admin], [vars.auth.roles.superAdmin]]),
		ordersController.deleteSingleOrder
	);

router
	.route("/:order/items/:orderItem")
	.all(
		allowMethods(["patch"]),
		permission.check([[vars.auth.roles.admin], [vars.auth.roles.superAdmin]])
	)
	.patch(
		ordersController.validator("item/update"),
		unprocessableEntityValidator,
		ordersController.updateOrderItem
	);

router
	.route("/:order/restore")
	.all(
		allowMethods(["patch"]),
		permission.check([[vars.auth.roles.admin], [vars.auth.roles.superAdmin]])
	)
	.patch(ordersController.restoreSingleOrder);

// Exporting router
export default router;
