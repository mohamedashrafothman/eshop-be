import { NextFunction, Request, Response } from "express";
import { validationResult, type FieldValidationError } from "express-validator";
import createError from "http-errors";
import httpStatus from "http-status";
import { formatValidationErrorMessagesResponse } from "../utils/helpers";

/**
 * Express middleware to handle validation errors.
 *
 * @summary Checks for validation errors, adds them to the flash if any, and returns an error.
 * @description This middleware is a wrapper around express-validator's validationResult.
 * It checks if there are any validation errors, adds them to the flash if any, and returns
 * a 422 Unprocessable Entity error with the validation errors as the response body.
 *
 * @param {Object} req - Express request object.
 * @param {Object} _res - Express response object (not used).
 * @param {Function} next - Express next middleware function to handle errors.
 * @returns {void}
 */
const middleware = (req: Request, _res: Response, next: NextFunction): void => {
	// Get the validation errors if any
	const validationErrors = validationResult(req);
	if (validationErrors.isEmpty()) return next();

	// If there are validation errors, add them to the flash and return an error
	req.flash(
		"danger",
		formatValidationErrorMessagesResponse(
			validationErrors.array({ onlyFirstError: true }) as FieldValidationError[]
		)
	);
	const error = createError(httpStatus.UNPROCESSABLE_ENTITY);
	return next({ ...(error || {}), status: error.status });
};

export default middleware;
