import allowMethods from "allow-methods";
import { Router } from "express";
import * as cartController from "../../../controllers/cart";
import unprocessableEntityValidator from "../../../middlewares/validator";

// Defining express router
const router = Router();

// Endpoints
router
	.route("/")
	.all(allowMethods(["get", "post", "delete"]))
	.get(cartController.getSingleCart)
	.post(
		cartController.validator("create"),
		unprocessableEntityValidator,
		cartController.addToCart
	)
	.delete(cartController.emptyCart);

router
	.route("/items/:cartItem")
	.all(allowMethods(["patch", "delete"]))
	.patch(
		cartController.validator("update"),
		unprocessableEntityValidator,
		cartController.updateCartItem
	)
	.delete(cartController.removeItemFromCart);

router
	.route("/shipping-methods")
	.all(allowMethods(["post"]))
	.post(
		cartController.validator("set-shipping"),
		unprocessableEntityValidator,
		cartController.postShippingMethod
	);

router
	.route("/payment-methods")
	.all(allowMethods(["post"]))
	.post(
		cartController.validator("set-payment"),
		unprocessableEntityValidator,
		cartController.postPaymentMethod
	);

// Exporting router
export default router;
