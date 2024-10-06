import allowMethods from "allow-methods";
import { Router } from "express";
import * as cartController from "../../../controllers/cart";
import unprocessableEntityValidator from "../../../middlewares/validator";

// defining express router
const router = Router();

// endpoints
router
	.route("/")
	.all(allowMethods(["post"]))
	.post(cartController.validator("add"), unprocessableEntityValidator, cartController.addToCart);

router
	.route("/:cart")
	.all(allowMethods(["get", "patch", "delete"]))
	.get(cartController.getSingleCart)
	.patch(
		cartController.validator("update"),
		unprocessableEntityValidator,
		cartController.updateCart
	)
	.delete(cartController.emptyCart);

router
	.route("/:cart/:product")
	.all(allowMethods(["delete"]))
	.delete(cartController.removeFromCart);

// exporting router
export default router;
