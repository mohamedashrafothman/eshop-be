import allowMethods from "allow-methods";
import { Router } from "express";
import * as authController from "../../../controllers/auth";
import * as citiesController from "../../../controllers/cities";
import permission from "../../../middlewares/permission";
import unprocessableEntityValidator from "../../../middlewares/validator";
import PermissionType from "../../../utils/helpers/permissions";

// Defining express router
const router = Router();

// Endpoints
router
	.route("/")
	.all(allowMethods(["get", "post"]))
	.get(citiesController.getCities)
	.post(
		authController.passportJWTAuthenticate,
		permission(PermissionType.MANAGE_SETTINGS),
		citiesController.validator("create"),
		unprocessableEntityValidator,
		citiesController.postNewCity
	);

router
	.route("/:city")
	.all(
		allowMethods(["get", "patch", "delete"]),
		authController.passportJWTAuthenticate,
		permission(PermissionType.MANAGE_SETTINGS)
	)
	.get(citiesController.getSingleCity)
	.patch(
		citiesController.validator("update"),
		unprocessableEntityValidator,
		citiesController.updateSingleCity
	)
	.delete(citiesController.deleteSingleCity);

router
	.route("/:city/restore")
	.all(
		allowMethods(["patch"]),
		authController.passportJWTAuthenticate,
		permission(PermissionType.MANAGE_SETTINGS)
	)
	.patch(citiesController.restoreSingleCity);

// Exporting router
export default router;
