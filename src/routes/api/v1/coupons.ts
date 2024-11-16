import allowMethods from "allow-methods";
import { Router } from "express";
import * as couponsController from "../../../controllers/coupons";
import unprocessableEntityValidator from "../../../middlewares/validator";

// Defining express router
const router = Router();

// Endpoints
router
	.route("/")
	.all(allowMethods(["post", "get"]))
	.get(couponsController.getCoupons)
	.post(
		couponsController.validator("create"),
		unprocessableEntityValidator,
		couponsController.postNewCoupon
	);

router
	.route("/:coupon")
	.all(allowMethods(["get", "patch", "delete"]))
	.get(couponsController.getSingleCoupon)
	.patch(
		couponsController.validator("update"),
		unprocessableEntityValidator,
		couponsController.updateSingleCoupon
	)
	.delete(couponsController.deleteSingleCoupon);

router
	.route("/:coupon/restore")
	.all(allowMethods(["patch"]))
	.patch(couponsController.restoreSingleCoupon);

// Exporting router
export default router;
