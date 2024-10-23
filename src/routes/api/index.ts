import { Router } from "express";
import versionOneRouter from "./v1";

// Defining express router
const router = Router();

// Endpoints
router.use("/v1", versionOneRouter);

// Exporting router
export default router;
