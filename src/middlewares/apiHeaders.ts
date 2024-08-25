import { NextFunction, Request, Response } from "express";
import createError from "http-errors";
import {
	isAPIAcceptableAcceptHeader,
	isAPIAcceptableMediaTypeHeader,
} from "../utils/helpers/server";

const middleware = (req: Request, _res: Response, next: NextFunction) => {
	// check if request contains API header "Content-Type" in case it's not GET or HEAD method.
	if (!["GET", "HEAD"]?.includes(req.method) && !isAPIAcceptableMediaTypeHeader(req)) {
		const error = createError.UnsupportedMediaType();
		return next({ ...(error || {}), status: error.status });
	}

	// check if request contains API header "Accept".
	if (!isAPIAcceptableAcceptHeader(req)) {
		const error = createError.NotAcceptable();
		return next({ ...(error || {}), status: error.status });
	}

	// pass control to next middleware
	next();
};
export default middleware;
