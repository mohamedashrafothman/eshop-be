import allowMethods from "allow-methods";
import { Router } from "express";
import * as authController from "../../../controllers/auth";
import * as categoriesController from "../../../controllers/categories";
import permission from "../../../middlewares/permission";
import unprocessableEntityValidator from "../../../middlewares/validator";
import PermissionType from "../../../utils/helpers/permissions";

// Defining express router
const router = Router();

// Endpoints
router
	.route("/")
	.all(allowMethods(["get", "post"]))
	.get(authController.passportJWTSerialize, categoriesController.getCategories)
	.post(
		authController.passportJWTAuthenticate,
		permission(PermissionType.CREATE_CATEGORY),
		categoriesController.uploadCategoryIcon,
		categoriesController.validator("create"),
		unprocessableEntityValidator,
		categoriesController.postNewCategory
	);

router
	.route("/:category")
	.all(allowMethods(["get", "patch", "delete"]))
	.get(authController.passportJWTSerialize, categoriesController.getSingleCategory)
	.all(authController.passportJWTAuthenticate)
	.patch(
		permission(PermissionType.UPDATE_CATEGORY),
		categoriesController.uploadCategoryIcon,
		categoriesController.validator("update"),
		unprocessableEntityValidator,
		categoriesController.updateSingleCategory
	)
	.delete(permission(PermissionType.DELETE_CATEGORY), categoriesController.deleteSingleCategory);

router
	.route("/:category/restore")
	.all(
		allowMethods(["patch"]),
		authController.passportJWTAuthenticate,
		permission(PermissionType.RESTORE_CATEGORY)
	)
	.patch(categoriesController.restoreSingleCategory);

// Exporting router
export default router;
