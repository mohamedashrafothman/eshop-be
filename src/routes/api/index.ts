import { Router } from "express";
import * as authController from "../../controllers/auth";
import authRouter from "./auth";
import usersRouter from "./users";

const router = Router();

// Nested routes
router.use("/auth", authRouter);
router.use("/users", authController._passportJWTAuthenticate, usersRouter);

// Exporting router
export default router;
