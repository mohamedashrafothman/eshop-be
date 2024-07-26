import { Router } from "express";
import passport from "passport";
import addressesRouter from "./addresses";
import authRouter from "./auth";
import usersRouter from "./users";

const router = Router();

// Nested routes
router.use("/auth", authRouter);
router.use("/users", passport.authenticate("jwt", { session: false }), usersRouter);
router.use("/addresses", passport.authenticate("jwt", { session: false }), addressesRouter);

// Exporting router
export default router;
