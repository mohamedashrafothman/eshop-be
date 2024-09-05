import { Router } from "express";
import apiHeaders from "../middlewares/apiHeaders";
import apiRouter from "./api";
import healthRouter from "./health";

const router = Router();

// Nested routes
router.use("/api", apiHeaders, apiRouter);
router.use("/health", healthRouter);

// Exporting router
export default router;
