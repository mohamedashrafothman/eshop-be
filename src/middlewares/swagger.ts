import { NextFunction, Request, Response } from "express";
import swaggerUi from "swagger-ui-express";
import swaggerSpec from "../config/swagger";

const middleware = [
	swaggerUi.serve,
	(req: Request, res: Response, next: NextFunction) =>
		swaggerUi.setup(swaggerSpec)(req, res, next),
];

export default middleware;
