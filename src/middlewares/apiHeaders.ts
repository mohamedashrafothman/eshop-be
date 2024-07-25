import { NextFunction, Request, Response } from "express";
import createError from "http-errors";
import vars from "../utils/vars";

const middleware = (req: Request, _res: Response, next: NextFunction) => {
	next(
		(req.get("Content-Type") !== vars.api.acceptableMediaType && createError.UnsupportedMediaType()) ||
			(req.get("Accept") !== vars.api.acceptableMediaType && createError.NotAcceptable())
	);
};
export default middleware;
