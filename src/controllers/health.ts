import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { formatResponseObject } from "../utils/helpers";

/**
 * @summary Health check endpoint.
 * @description Responds with a status of 200 OK to indicate that the server is healthy and operational. Useful for monitoring and health checks.
 *
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response indicating the server is healthy.
 *   * @property {string} message - A message confirming the server's healthy status.
 */
export const getHealth = async (req: Request, res: Response, next: NextFunction) => {
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, message: httpStatus["200_MESSAGE"] })
	);
};
