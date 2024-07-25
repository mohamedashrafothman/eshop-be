import csrf from "csurf";
import { NextFunction, Request, Response } from "express";
import vars from "../utils/vars";

const middleware = (req: Request, res: Response, next: NextFunction) =>
	req.get("Content-Type") !== vars.api.acceptableMediaType || req.get("Accept") !== vars.api.acceptableMediaType
		? csrf({ cookie: true })(req, res, next)
		: next();

export default middleware;
