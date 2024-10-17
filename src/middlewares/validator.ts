import { NextFunction, Request, Response } from "express";
import { validationResult } from "express-validator";
import createError from "http-errors";
import httpStatus from "http-status";
import { formatValidationErrorMessagesResponse } from "../utils/helpers";

/**
 * @summary Express middleware to handle express-validator validation errors.
 * @description It flashes the validation errors and sends a 422 Unprocessable Entity
 * response if there are any validation errors. Otherwise, it calls the next
 * middleware or route handler.
 *
 * @param {Request} req - The Express request object.
 * @param {Response} _res - The Express response object. Not used.
 * @param {NextFunction} next - The Express next middleware or route handler.
 *
 * @returns {Promise<void>} - Returns nothing.
 * @throws {Error} 422 - Returns an error if there are validation errors.
 */
const middleware = (req: Request, _res: Response, next: NextFunction) => {
	// Get the validation errors if any
	const validationErrors = validationResult(req);
	if (validationErrors.isEmpty()) return next();

	// If there are validation errors, add them to the flash and return an error
	req.flash("danger", formatValidationErrorMessagesResponse(validationErrors.array()));
	const error = createError(httpStatus.UNPROCESSABLE_ENTITY);
	return next({ ...(error || {}), status: error.status });
};

export default middleware;
