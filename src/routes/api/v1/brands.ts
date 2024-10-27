import allowMethods from "allow-methods";
import { Router } from "express";
import * as authController from "../../../controllers/auth";
import * as brandsController from "../../../controllers/brands";
import permission from "../../../middlewares/permission";
import unprocessableEntityValidator from "../../../middlewares/validator";
import vars from "../../../utils/vars";

// Defining express router
const router = Router();

// Endpoints
router
	.route("/")
	.all(allowMethods(["get", "post"]))
	.get(authController.passportJWTSerialize, brandsController.getBrands)
	.post(
		authController.passportJWTAuthenticate,
		permission.check([[vars.auth.roles.superAdmin], [vars.auth.roles.admin]]),
		brandsController.uploadBrandLogo,
		brandsController.validator("create"),
		unprocessableEntityValidator,
		brandsController.postNewBrand
	);

router
	.route("/:brand")
	.all(
		allowMethods(["get", "patch", "delete"]),
		authController.passportJWTAuthenticate,
		permission.check([[vars.auth.roles.superAdmin], [vars.auth.roles.admin]])
	)
	.get(brandsController.getSingleBrand)
	.patch(
		brandsController.uploadBrandLogo,
		brandsController.validator("update"),
		unprocessableEntityValidator,
		brandsController.updateSingleBrand
	)
	.delete(brandsController.deleteSingleBrand);

router
	.route("/:brand/restore")
	.all(
		allowMethods(["patch"]),
		authController.passportJWTAuthenticate,
		permission.check(vars.auth.roles.superAdmin)
	)
	.patch(brandsController.restoreSingleBrand);

// Exporting router
export default router;
