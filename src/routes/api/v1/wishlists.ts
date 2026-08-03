import allowMethods from "allow-methods";
import { Router } from "express";
import * as wishlistsController from "../../../controllers/wishlists";
import permission from "../../../middlewares/permission";
import unprocessableEntityValidator from "../../../middlewares/validator";
import PermissionType from "../../../utils/helpers/permissions";

// Defining express router
const router = Router();

// Endpoints
router
	.route("/")
	.all(allowMethods(["get", "post", "delete"]))
	.get(permission(PermissionType.READ_WISHLISTS), wishlistsController.getSingleWishlist)
	.post(
		permission(PermissionType.CREATE_WISHLIST),
		wishlistsController.validator("add"),
		unprocessableEntityValidator,
		wishlistsController.addToWishlist
	)
	.delete(permission(PermissionType.DELETE_WISHLIST), wishlistsController.emptyWishlist);

router
	.route("/:product")
	.all(allowMethods(["delete"]), permission(PermissionType.DELETE_WISHLIST))
	.delete(wishlistsController.removeFromWishlist);

// Exporting router
export default router;
