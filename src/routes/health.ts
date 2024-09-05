import allowMethods from "allow-methods";
import { Router } from "express";
import * as healthController from "../controllers/health";

// defining express router
const router = Router();

// endpoints
router
	.route("/")
	.all(allowMethods(["get"]))
	.get(healthController.getHealth);

// exporting router
export default router;
