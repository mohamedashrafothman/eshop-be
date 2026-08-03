import allowMethods from "allow-methods";
import { Router } from "express";
import * as addressesController from "../../../controllers/addresses";
import permission from "../../../middlewares/permission";
import unprocessableEntityValidator from "../../../middlewares/validator";
import PermissionType from "../../../utils/helpers/permissions";

// Defining express router
const router = Router();

// Endpoints
router
	.route("/")
	.all(allowMethods(["post", "get"]))
	.get(permission(PermissionType.READ_ADDRESSES), addressesController.getAddresses)
	.post(
		permission(PermissionType.CREATE_ADDRESS),
		addressesController.validator("create"),
		unprocessableEntityValidator,
		addressesController.postNewAddress
	);

router
	.route("/:address")
	.all(allowMethods(["get", "patch", "delete"]))
	.get(permission(PermissionType.READ_ADDRESS), addressesController.getSingleAddress)
	.patch(
		permission(PermissionType.UPDATE_ADDRESS),
		addressesController.validator("update"),
		unprocessableEntityValidator,
		addressesController.updateSingleAddress
	)
	.delete(permission(PermissionType.DELETE_ADDRESS), addressesController.deleteSingleAddress);

router
	.route("/:address/shipping-methods")
	.all(allowMethods(["get"]))
	.get(
		permission(PermissionType.READ_ADDRESS),
		addressesController.getSingleAddressShippingMethods
	);

// Exporting router
export default router;
