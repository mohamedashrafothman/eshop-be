import allowMethods from "allow-methods";
import { Router } from "express";
import * as authController from "../../controllers/auth";
import * as categoriesController from "../../controllers/category";
import permission from "../../middlewares/permission";
import unprocessableEntityValidator from "../../middlewares/validator";
import vars from "../../utils/vars";

// defining express router
const router = Router();

// endpoints
router
	.route("/")
	.all(allowMethods(["get", "post"]))
	.get(categoriesController.getCategories)
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
	.all(allowMethods(["get", "patch", "delete"]))
	.get(categoriesController.getSingleCategory)
	.patch(
		authController.passportJWTAuthenticate,
		permission.check([[vars.auth.roles.superAdmin], [vars.auth.roles.admin]]),
		categoriesController.uploadCategoryIcon,
		categoriesController.validator("update"),
		unprocessableEntityValidator,
		categoriesController.updateSingleCategory
	)
	.delete(
		authController.passportJWTAuthenticate,
		permission.check([[vars.auth.roles.superAdmin], [vars.auth.roles.admin]]),
		categoriesController.deleteSingleCategory
	);

// exporting router
export default router;
