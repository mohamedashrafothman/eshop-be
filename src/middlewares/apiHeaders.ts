import { NextFunction, Request, Response } from "express";
import createError from "http-errors";
import { isAPIAcceptableAcceptHeader, isAPIAcceptableMediaTypeHeader } from "../utils/helpers/server";

const middleware = (req: Request, _res: Response, next: NextFunction) => {
	next(
		(!isAPIAcceptableMediaTypeHeader(req) && createError.UnsupportedMediaType()) ||
			(!isAPIAcceptableAcceptHeader(req) && createError.NotAcceptable())
	);
};
export default middleware;
