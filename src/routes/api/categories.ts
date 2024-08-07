import allowMethods from "allow-methods";
import { Router } from "express";
import * as categoriesController from "../../controllers/category";
import permission from "../../middlewares/permission";
import unprocessableEntityValidator from "../../middlewares/validator";
import vars from "../../utils/vars";

const router = Router();

// Endpoints
router
	.route("/")
	.all(allowMethods(["post", "get"]))
	.get(categoriesController.getCategories)
	.post(
		permission.check([[vars.auth.roles.superAdmin], [vars.auth.roles.admin]]),
		categoriesController._validator("create"),
		unprocessableEntityValidator,
		categoriesController.postNewCategory
	);
router
	.route("/:category")
	.all(allowMethods(["get", "patch", "delete"]))
	.get(categoriesController.getSingleCategory)
	.patch(
		permission.check([[vars.auth.roles.superAdmin], [vars.auth.roles.admin]]),
		categoriesController._validator("update"),
		unprocessableEntityValidator,
		categoriesController.updateSingleCategory
	)
	.delete(
		permission.check([[vars.auth.roles.superAdmin], [vars.auth.roles.admin]]),
		categoriesController.deleteSingleCategory
	);

// Exporting router
export default router;
