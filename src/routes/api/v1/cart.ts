import allowMethods from "allow-methods";
import { Router } from "express";
import * as cartController from "../../../controllers/cart";
import unprocessableEntityValidator from "../../../middlewares/validator";

// defining express router
const router = Router();

// endpoints
router
	.route("/")
	.all(allowMethods(["post", "get", "delete"]))
	.get(cartController.getSingleCart)
	.post(
		cartController.validator("create"),
		unprocessableEntityValidator,
		cartController.addToCart
	)
	.delete(cartController.emptyCart);

router
	.route("/:cartItem")
	.all(allowMethods(["patch", "delete"]))
	.patch(
		cartController.validator("update"),
		unprocessableEntityValidator,
		cartController.updateCartItem
	)
	.delete(cartController.removeFromCart);

// exporting router
export default router;
