import { Router } from "express";
import * as authController from "../../../controllers/auth";
import permission from "../../../middlewares/permission";
import vars from "../../../utils/vars";
import addressesRouter from "./addresses";
import authRouter from "./auth";
import brandsRouter from "./brands";
import cartRouter from "./cart";
import categoriesRouter from "./categories";
import citiesRouter from "./cities";
import countriesRouter from "./countries";
import couponsRouter from "./coupons";
import ordersRouter from "./orders";
import paymentMethodsRouter from "./paymentMethods";
import policiesRouter from "./policies";
import productsRouter from "./products";
import reviewsRouter from "./reviews";
import shippingMethodsRouter from "./shippingMethods";
import statesRouter from "./states";
import taxesRouter from "./taxes";
import usersRouter from "./users";
import wishlistsRouter from "./wishlists";
import zonesRouter from "./zones";

// Defining express router
const router = Router();

// Endpoints
router.use("/auth", authRouter);
router.use("/users", authController.passportJWTAuthenticate, usersRouter);
router.use("/addresses", authController.passportJWTAuthenticate, addressesRouter);
router.use("/categories", categoriesRouter);
router.use("/brands", brandsRouter);
router.use("/products", productsRouter);
router.use(
	"/wishlists",
	authController.passportJWTAuthenticate,
	permission.check(vars.auth.roles.user),
	wishlistsRouter
);
router.use(
	"/taxes",
	authController.passportJWTAuthenticate,
	permission.check([[vars.auth.roles.superAdmin], [vars.auth.roles.admin]]),
	taxesRouter
);
router.use("/countries", countriesRouter);
router.use("/states", statesRouter);
router.use("/cities", citiesRouter);
router.use(
	"/zones",
	authController.passportJWTAuthenticate,
	permission.check([[vars.auth.roles.superAdmin], [vars.auth.roles.admin]]),
	zonesRouter
);
router.use("/shipping-methods", authController.passportJWTAuthenticate, shippingMethodsRouter);
router.use("/payment-methods", authController.passportJWTAuthenticate, paymentMethodsRouter);
router.use(
	"/coupons",
	authController.passportJWTAuthenticate,
	permission.check([[vars.auth.roles.superAdmin], [vars.auth.roles.admin]]),
	couponsRouter
);
router.use(
	"/cart",
	authController.passportJWTAuthenticate,
	permission.check(vars.auth.roles.user),
	cartRouter
);
router.use("/orders", authController.passportJWTAuthenticate, ordersRouter);
router.use("/reviews", reviewsRouter);
router.use("/policies", policiesRouter);

// Exporting router
export default router;
