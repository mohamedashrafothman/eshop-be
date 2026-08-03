import allowMethods from "allow-methods";
import { Router } from "express";
import * as authController from "../../../controllers/auth";
import * as brandsController from "../../../controllers/brands";
import permission from "../../../middlewares/permission";
import unprocessableEntityValidator from "../../../middlewares/validator";
import PermissionType from "../../../utils/helpers/permissions";

// Defining express router
const router = Router();

// Endpoints
router
	.route("/")
	.all(allowMethods(["get", "post"]))
	.get(authController.passportJWTSerialize, brandsController.getBrands)
	.post(
		authController.passportJWTAuthenticate,
		permission(PermissionType.CREATE_BRAND),
		brandsController.uploadBrandLogo,
		brandsController.validator("create"),
		unprocessableEntityValidator,
		brandsController.postNewBrand
	);

router
	.route("/:brand")
	.all(allowMethods(["get", "patch", "delete"]), authController.passportJWTAuthenticate)
	.get(permission(PermissionType.READ_BRAND), brandsController.getSingleBrand)
	.patch(
		permission(PermissionType.UPDATE_BRAND),
		brandsController.uploadBrandLogo,
		brandsController.validator("update"),
		unprocessableEntityValidator,
		brandsController.updateSingleBrand
	)
	.delete(permission(PermissionType.DELETE_BRAND), brandsController.deleteSingleBrand);

router
	.route("/:brand/restore")
	.all(
		allowMethods(["patch"]),
		authController.passportJWTAuthenticate,
		permission(PermissionType.RESTORE_BRAND)
	)
	.patch(brandsController.restoreSingleBrand);

// Exporting router
export default router;
