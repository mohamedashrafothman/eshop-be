import allowMethods from "allow-methods";
import { Router } from "express";
import * as authController from "../../../controllers/auth";
import * as categoriesController from "../../../controllers/categories";
import permission from "../../../middlewares/permission";
import unprocessableEntityValidator from "../../../middlewares/validator";
import vars from "../../../utils/vars";

// Defining express router
const router = Router();

// Endpoints
router
	.route("/")
	.all(allowMethods(["get", "post"]))
	.get(authController.passportJWTSerialize, categoriesController.getCategories)
	.post(
		authController.passportJWTAuthenticate,
		permission.check([[vars.auth.roles.superAdmin], [vars.auth.roles.admin]]),
		categoriesController.uploadCategoryIcon,
		categoriesController.validator("create"),
		unprocessableEntityValidator,
		categoriesController.postNewCategory
	);

router
	.route("/:category")
	.get(
		allowMethods(["get"]),
		authController.passportJWTSerialize,
		categoriesController.getSingleCategory
	)
	.all(
		allowMethods(["patch", "delete"]),
		authController.passportJWTAuthenticate,
		permission.check([[vars.auth.roles.superAdmin], [vars.auth.roles.admin]])
	)
	.patch(
		categoriesController.uploadCategoryIcon,
		categoriesController.validator("update"),
		unprocessableEntityValidator,
		categoriesController.updateSingleCategory
	)
	.delete(categoriesController.deleteSingleCategory);

router
	.route("/:category/restore")
	.all(
		allowMethods(["patch"]),
		authController.passportJWTAuthenticate,
		permission.check(vars.auth.roles.superAdmin)
	)
	.patch(categoriesController.restoreSingleCategory);

// Exporting router
export default router;
