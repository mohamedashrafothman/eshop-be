import { Router } from "express";
import versionOneRouter from "./v1";

// defining express router
const router = Router();

// endpoints
router.use("/v1", versionOneRouter);

// exporting router
export default router;
