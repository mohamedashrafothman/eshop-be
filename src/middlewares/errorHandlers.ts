import errorHandler from "errorhandler";
import { NextFunction, Request, Response } from "express";
import createError from "http-errors";
import httpStatus from "http-status";
import { formatResponseObject, type FormatResponseObjectType } from "../utils/helpers";
import vars from "../utils/vars";

const notFoundErrorHandler = (_req: Request, _res: Response, next: NextFunction) =>
	next(createError(httpStatus.NOT_FOUND, "The resources you're looking for is Not found."));
const internalServerErrorHandler = !vars.isProduction
	? errorHandler({ log: false })
	: (error: Error & FormatResponseObjectType<null>, req: Request, res: Response, _next: NextFunction) => {
			const {
				status = httpStatus.INTERNAL_SERVER_ERROR,
				message = "Whoops, something went wrong!",
				...err
			} = error;
			req.flash("danger", message);
			res.status(status).json(formatResponseObject({ status, flashes: req.flash(), ...(err || {}) }));
			// eslint-disable-next-line no-mixed-spaces-and-tabs
	  };

export { internalServerErrorHandler, notFoundErrorHandler };
