import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { formatResponseObject } from "../utils/helpers";

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     description: Responds with a status of 200 OK to indicate that the server is healthy.
 *     tags:
 *       - Health
 *     responses:
 *       200:
 *         description: Server is healthy
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: OK
 */
export const getHealth = async (req: Request, res: Response, next: NextFunction) => {
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, message: httpStatus["200_MESSAGE"] })
	);
};
