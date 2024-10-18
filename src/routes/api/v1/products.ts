import allowMethods from "allow-methods";
import { Router } from "express";
import * as authController from "../../../controllers/auth";
import * as productsController from "../../../controllers/products";
import permission from "../../../middlewares/permission";
import unprocessableEntityValidator from "../../../middlewares/validator";
import vars from "../../../utils/vars";

// defining express router
const router = Router();

// endpoints
router
	.route("/")
	.all(allowMethods(["post", "get"]))
	.get(authController.passportJWTSerialize, productsController.getProducts)
	.post(
		authController.passportJWTAuthenticate,
		permission.check([[vars.auth.roles.superAdmin], [vars.auth.roles.admin]]),
		productsController.uploadImages,
		productsController.validator("create"),
		unprocessableEntityValidator,
		productsController.postNewProduct
	);

router
	.route("/:product")
	.all(allowMethods(["get", "patch", "delete"]))
	.get(authController.passportJWTSerialize, productsController.getSingleProduct)
	.patch(
		authController.passportJWTAuthenticate,
		permission.check([[vars.auth.roles.superAdmin], [vars.auth.roles.user]]),
		productsController.uploadImages,
		productsController.validator("update"),
		unprocessableEntityValidator,
		productsController.updateSingleProduct
	)
	.delete(
		authController.passportJWTAuthenticate,
		permission.check([[vars.auth.roles.superAdmin], [vars.auth.roles.user]]),
		productsController.deleteSingleProduct
	);

router
	.route("/:product/restore")
	.all(
		allowMethods(["patch"]),
		authController.passportJWTAuthenticate,
		permission.check([[vars.auth.roles.superAdmin], [vars.auth.roles.user]])
	)
	.patch(productsController.restoreSingleProduct);

// exporting router
export default router;
