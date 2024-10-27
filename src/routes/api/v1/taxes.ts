import allowMethods from "allow-methods";
import { Router } from "express";
import * as taxesController from "../../../controllers/taxes";
import unprocessableEntityValidator from "../../../middlewares/validator";

// Defining express router
const router = Router();

// Endpoints
router
	.route("/")
	.all(allowMethods(["post", "get"]))
	.get(taxesController.getTaxes)
	.post(
		taxesController.validator("create"),
		unprocessableEntityValidator,
		taxesController.postNewTax
	);

router
	.route("/:tax")
	.all(allowMethods(["get", "patch", "delete"]))
	.get(taxesController.getSingleTax)
	.patch(
		taxesController.validator("update"),
		unprocessableEntityValidator,
		taxesController.updateSingleTax
	)
	.delete(taxesController.deleteSingleTax);

router
	.route("/:tax/restore")
	.all(allowMethods(["patch"]))
	.patch(taxesController.restoreSingleTax);

// Exporting router
export default router;
