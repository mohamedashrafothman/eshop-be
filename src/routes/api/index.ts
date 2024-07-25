import { Router } from "express";
import passport from "passport";
import authRouter from "./auth";
import usersRouter from "./users";

const router = Router();

// Nested routes
router.use("/auth", authRouter);
router.use("/users", passport.authenticate("jwt", { session: false }), usersRouter);

// Exporting router
export default router;
