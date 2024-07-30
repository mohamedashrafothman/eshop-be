import { NextFunction, Request, Response } from "express";
import createError from "http-errors";
import httpStatus from "http-status";
import { formatResponseObject, formatValidationErrorMessagesResponse } from "../utils/helpers";

const notFoundErrorHandler = (_req: Request, _res: Response, next: NextFunction) =>
	next(createError(httpStatus.NOT_FOUND, "The resources you're looking for is Not found."));
const internalServerErrorHandler = (error: Error, req: Request, res: Response, _next: NextFunction) => {
	const {
		status: errorStatus = httpStatus.INTERNAL_SERVER_ERROR,
		message: errorMessage = httpStatus["500_MESSAGE"],
		code: errorCode,
		path: errorPath,
		value: errorValue,
		name: errorName,
		success: _success,
		...errorRest
	} = Object.assign({}, JSON.parse(JSON.stringify(error)));

	// default error message, and status
	let message: string = errorMessage;
	let status: number = errorStatus;

	// handling database duplicate key error
	if (errorCode === 11000) {
		message = "Duplicate key error";
		status = httpStatus.CONFLICT;
	}

	// handling database cast error
	if (errorName === "CastError") {
		message = `Invalid value for ${errorPath}: ${errorValue}`;
		status = httpStatus.BAD_REQUEST;
	}

	// handle database validation error
	if (errorName === "ValidationError") {
		message = httpStatus["422_MESSAGE"];
		status = httpStatus.UNPROCESSABLE_ENTITY;
		req.flash("danger", formatValidationErrorMessagesResponse(Object.values(errorRest.errors)));
	}

	// return response
	req.flash("danger", message);
	res.status(status).json(
		formatResponseObject({
			...(errorRest || {}),
			success: false,
			status,
			flashes: req.flash(),
		})
	);
};

export { internalServerErrorHandler, notFoundErrorHandler };
