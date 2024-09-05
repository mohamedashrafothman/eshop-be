import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { formatResponseObject } from "../utils/helpers";

export const getHealth = async (req: Request, res: Response, next: NextFunction) => {
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, message: httpStatus["200_MESSAGE"] })
	);
};
