import allowMethods from "allow-methods";
import { Router } from "express";
import * as addressesController from "../../controllers/addresses";
import permission from "../../middlewares/permission";
import unprocessableEntityValidator from "../../middlewares/validator";
import vars from "../../utils/vars";

// defining express router
const router = Router();

// endpoints
router
	.route("/")
	.all(allowMethods(["post", "get"]))
	.get(permission.check(vars.auth.roles.superAdmin), addressesController.getAddresses)
	.post(
		permission.check([[vars.auth.roles.superAdmin], [vars.auth.roles.user]]),
		addressesController.validator("create"),
		unprocessableEntityValidator,
		addressesController.postNewAddress
	);
router
	.route("/:address")
	.all(
		allowMethods(["get", "patch", "delete"]),
		permission.check([[vars.auth.roles.superAdmin], [vars.auth.roles.user]])
	)
	.get(addressesController.getSingleAddress)
	.patch(
		addressesController.validator("update"),
		unprocessableEntityValidator,
		addressesController.updateSingleAddress
	)
	.delete(addressesController.deleteSingleAddress);

// exporting router
export default router;
