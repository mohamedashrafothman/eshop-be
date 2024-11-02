import allowMethods from "allow-methods";
import { Router } from "express";
import * as wishlistsController from "../../../controllers/wishlists";
import unprocessableEntityValidator from "../../../middlewares/validator";

// Defining express router
const router = Router();

// Endpoints
router
	.route("/")
	.all(allowMethods(["get", "post", "delete"]))
	.get(wishlistsController.getSingleWishlist)
	.post(
		wishlistsController.validator("add"),
		unprocessableEntityValidator,
		wishlistsController.addToWishlist
	)
	.delete(wishlistsController.emptyWishlist);

router
	.route("/:product")
	.all(allowMethods(["delete"]))
	.delete(wishlistsController.removeFromWishlist);

// Exporting router
export default router;
