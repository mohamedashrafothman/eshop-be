import allowMethods from "allow-methods";
import { Router } from "express";
import * as authController from "../../../controllers/auth";
import * as citiesController from "../../../controllers/cities";
import permission from "../../../middlewares/permission";
import unprocessableEntityValidator from "../../../middlewares/validator";
import vars from "../../../utils/vars";

// defining express router
const router = Router();

// endpoints
router
	.route("/")
	.all(allowMethods(["get", "post"]))
	.get(citiesController.getCities)
	.post(
		authController.passportJWTAuthenticate,
		permission.check([[vars.auth.roles.superAdmin], [vars.auth.roles.admin]]),
		citiesController.validator("create"),
		unprocessableEntityValidator,
		citiesController.postNewCity
	);
router
	.route("/:city")
	.all(
		allowMethods(["get", "patch", "delete"]),
		authController.passportJWTAuthenticate,
		permission.check([[vars.auth.roles.superAdmin], [vars.auth.roles.admin]])
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
		permission.check([[vars.auth.roles.superAdmin], [vars.auth.roles.admin]])
	)
	.patch(citiesController.restoreSingleCity);

// exporting router
export default router;
