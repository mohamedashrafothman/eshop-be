import { NextFunction, Request, Response } from "express";
import createError from "http-errors";
import httpStatus from "http-status";
import {
	formatResponseObject,
	formatValidationErrorMessagesResponse,
	isFunction,
} from "../utils/helpers";

const notFoundErrorHandler = (_req: Request, _res: Response, next: NextFunction) =>
	next(createError(httpStatus.NOT_FOUND, "The resources you're looking for is Not found."));
const internalServerErrorHandler = (
	error: Error,
	req: Request,
	res: Response,
	_next: NextFunction
) => {
	// destructuring the error object
	const {
		status: errorStatus = httpStatus.INTERNAL_SERVER_ERROR,
		message: errorMessage = httpStatus["500_MESSAGE"],
		code: errorCode,
		path: errorPath,
		value: errorValue,
		name: errorName,
		success: _success,
		...errorRest
	} = Object.assign({}, JSON.parse(JSON.stringify(error, Object.getOwnPropertyNames(error))));

	// default error message, and status
	let message = errorMessage;
	let status = errorStatus;

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
		if (isFunction(req.flash))
			req.flash(
				"danger",
				formatValidationErrorMessagesResponse(Object.values(errorRest.errors))
			);
	}

	// return response
	if (isFunction(req.flash)) req.flash("danger", message);
	res.status(status).json(
		formatResponseObject({
			...(errorRest || {}),
			success: false,
			status,
			...(isFunction(req.flash) ? { flashes: req.flash() } : { message }),
		})
	);
};

export { internalServerErrorHandler, notFoundErrorHandler };
