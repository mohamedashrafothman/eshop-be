import allowMethods from "allow-methods";
import { Router } from "express";
import * as zonesController from "../../../controllers/zones";
import unprocessableEntityValidator from "../../../middlewares/validator";

// defining express router
const router = Router();

// endpoints
router
	.route("/")
	.all(allowMethods(["get", "post"]))
	.get(zonesController.getZones)
	.post(
		zonesController.validator("create"),
		unprocessableEntityValidator,
		zonesController.postNewZone
	);

router
	.route("/:zone")
	.all(allowMethods(["get", "patch", "delete"]))
	.get(zonesController.getSingleZone)
	.patch(
		zonesController.validator("update"),
		unprocessableEntityValidator,
		zonesController.updateSingleZone
	)
	.delete(zonesController.deleteSingleZone);

router
	.route("/:zone/restore")
	.all(allowMethods(["patch"]))
	.patch(zonesController.restoreSingleZone);

// exporting router
export default router;
