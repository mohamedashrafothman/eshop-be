import { NextFunction, Request, Response } from "express";
import createError from "http-errors";
import httpStatus from "http-status";
import { formatResponseObject, type FormatResponseObjectType } from "../utils/helpers";

const notFoundErrorHandler = (_req: Request, _res: Response, next: NextFunction) =>
	next(createError(httpStatus.NOT_FOUND, "The resources you're looking for is Not found."));
const internalServerErrorHandler = (
	error: Error & FormatResponseObjectType<null>,
	req: Request,
	res: Response,
	_next: NextFunction
) => {
	const {
		status = httpStatus.INTERNAL_SERVER_ERROR,
		message = "Whoops, something went wrong!",
		success: _success,
		...err
	} = error;
	req.flash("danger", message);
	if (!res.headersSent)
		res.status(status).json(
			formatResponseObject({
				success: false,
				status,
				flashes: req.flash(),
				...(err || {}),
			})
		);
};

export { internalServerErrorHandler, notFoundErrorHandler };
