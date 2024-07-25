import { Router } from "express";
import apiHeaders from "../middlewares/apiHeaders";
import apiRouter from "./api";

const router = Router();

// Nested routes
router.use("/api", apiHeaders, apiRouter);

// Exporting router
export default router;
