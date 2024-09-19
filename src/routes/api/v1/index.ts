import { Router } from "express";
import * as authController from "../../../controllers/auth";
import addressesRouter from "./addresses";
import authRouter from "./auth";
import brandsRouter from "./brands";
import categoriesRouter from "./categories";
import productsRouter from "./products";
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

// exporting router
export default router;
