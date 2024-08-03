// import allowMethods from "allow-methods";
import allowMethods from "allow-methods";
import { Router } from "express";
import * as addressesController from "../../controllers/addresses";
import permission from "../../middlewares/permission";
import unprocessableEntityValidator from "../../middlewares/validator";
import vars from "../../utils/vars";

const router = Router();

// Endpoints
router
	.route("/")
	.all(permission.check(vars.auth.roles.user), allowMethods(["post"]))
	.post(
		addressesController._validator("create"),
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
		addressesController._validator("update"),
		unprocessableEntityValidator,
		addressesController.updateSingleAddress
	)
	.delete(addressesController.deleteSingleAddress);

// Exporting router
export default router;
