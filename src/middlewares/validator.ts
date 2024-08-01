import { NextFunction, Request, Response } from "express";
import { validationResult } from "express-validator";
import createError from "http-errors";
import httpStatus from "http-status";
import { formatValidationErrorMessagesResponse } from "../utils/helpers";

const middleware = (req: Request, _res: Response, next: NextFunction) => {
	const validationErrors = validationResult(req);
	if (!validationErrors.isEmpty()) {
		req.flash("danger", formatValidationErrorMessagesResponse(validationErrors.array()));
		return next(createError(httpStatus.UNPROCESSABLE_ENTITY));
	}
	next();
};

export default middleware;
