import allowMethods from "allow-methods";
import { Router } from "express";
import * as authController from "../../../controllers/auth";
import * as countriesController from "../../../controllers/countries";
import permission from "../../../middlewares/permission";
import unprocessableEntityValidator from "../../../middlewares/validator";
import PermissionType from "../../../utils/helpers/permissions";

// Defining express router
const router = Router();

// Endpoints
router
	.route("/")
	.all(allowMethods(["get", "post"]))
	.get(countriesController.getCountries)
	.post(
		authController.passportJWTAuthenticate,
		permission(PermissionType.MANAGE_SETTINGS),
		countriesController.validator("create"),
		unprocessableEntityValidator,
		countriesController.postNewCountry
	);

router
	.route("/:country")
	.all(
		allowMethods(["get", "patch", "delete"]),
		authController.passportJWTAuthenticate,
		permission(PermissionType.MANAGE_SETTINGS)
	)
	.get(countriesController.getSingleCountry)
	.patch(
		countriesController.validator("update"),
		unprocessableEntityValidator,
		countriesController.updateSingleCountry
	)
	.delete(countriesController.deleteSingleCountry);

router
	.route("/:country/restore")
	.all(
		allowMethods(["patch"]),
		authController.passportJWTAuthenticate,
		permission(PermissionType.MANAGE_SETTINGS)
	)
	.patch(countriesController.restoreSingleCountry);

// Exporting router
export default router;
