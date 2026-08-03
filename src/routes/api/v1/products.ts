import allowMethods from "allow-methods";
import { Router } from "express";
import * as authController from "../../../controllers/auth";
import * as productsController from "../../../controllers/products";
import * as reviewsController from "../../../controllers/reviews";
import permission from "../../../middlewares/permission";
import unprocessableEntityValidator from "../../../middlewares/validator";
import PermissionType from "../../../utils/helpers/permissions";

// Defining express router
const router = Router();

// Endpoints
router
	.route("/")
	.all(allowMethods(["post", "get"]))
	.get(authController.passportJWTSerialize, productsController.getProducts)
	.post(
		authController.passportJWTAuthenticate,
		permission(PermissionType.MANAGE_SETTINGS),
		productsController.uploadImages,
		productsController.validator("create"),
		unprocessableEntityValidator,
		productsController.postNewProduct
	);

router
	.route("/home")
	.all(allowMethods(["get"]))
	.get(
		productsController.validator("home"),
		unprocessableEntityValidator,
		productsController.getHomeProductsList
	);

router
	.route("/:product")
	.all(allowMethods(["get", "patch", "delete"]))
	.get(authController.passportJWTSerialize, productsController.getSingleProduct)
	.patch(
		authController.passportJWTAuthenticate,
		permission(PermissionType.MANAGE_SETTINGS),
		productsController.uploadImages,
		productsController.validator("update"),
		unprocessableEntityValidator,
		productsController.updateSingleProduct
	)
	.delete(
		authController.passportJWTAuthenticate,
		permission(PermissionType.MANAGE_SETTINGS),
		productsController.deleteSingleProduct
	);

router
	.route("/:product/restore")
	.all(
		allowMethods(["patch"]),
		authController.passportJWTAuthenticate,
		permission(PermissionType.MANAGE_SETTINGS)
	)
	.patch(productsController.restoreSingleProduct);

router
	.route("/:product/reviews")
	.all(allowMethods(["get"]))
	.get(reviewsController.getReviewsForProduct);

// Exporting router
export default router;
