import { Router } from "express";
import * as authController from "../../controllers/auth";
import addressesRouter from "./addresses";
import authRouter from "./auth";
import usersRouter from "./users";

const router = Router();

// Nested routes
router.use("/auth", authRouter);
router.use("/users", authController._passportJWTAuthenticate, usersRouter);
router.use("/addresses", authController._passportJWTAuthenticate, addressesRouter);

// Exporting router
export default router;
