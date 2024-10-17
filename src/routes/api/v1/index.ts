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
import productsRouter from "./products";
import reviewsRouter from "./reviews";
import statesRouter from "./states";
import taxesRouter from "./taxes";
import usersRouter from "./users";

// defining express router
const router = Router();

// endpoints
router.use("/auth", authRouter);
router.use("/users", authController.passportJWTAuthenticate, usersRouter);
router.use("/addresses", authController.passportJWTAuthenticate, addressesRouter);
router.use("/categories", categoriesRouter);
router.use("/brands", brandsRouter);
router.use("/products", productsRouter);
router.use(
	"/cart",
	authController.passportJWTAuthenticate,
	permission.check(vars.auth.roles.user),
	cartRouter
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
router.use("/reviews", reviewsRouter);

// exporting router
export default router;
