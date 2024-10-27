import allowMethods from "allow-methods";
import { Router } from "express";
import * as healthController from "../controllers/health";

// Defining express router
const router = Router();

// Endpoints
router
	.route("/")
	.all(allowMethods(["get"]))
	.get(healthController.getHealth);

// Exporting router
export default router;
