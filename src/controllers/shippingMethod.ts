import { NextFunction, Request, Response } from "express";
import { ValidationChain } from "express-validator";
import { PaginateOptions } from "mongoose";
import IShippingMethod from "../interfaces/ShippingMethod.interface";

/**
 * Validates the input fields based on the method provided.
 */
export const validator = (method: "create" | "update"): ValidationChain[] => {
	switch (method) {
		case "create":
			return [];
		case "update":
			return [];
		default:
			return [];
	}
};

export const postNewShippingMethod = async (
	req: Request<{}, {}, IShippingMethod>,
	res: Response,
	next: NextFunction
) => {};

export const getShippingMethods = async (
	req: Request<
		{},
		{},
		{},
		Pick<PaginateOptions, "sort" | "page" | "limit" | "offset" | "pagination"> & {
			q?: string;
			deleted?: boolean | number;
		}
	>,
	res: Response,
	next: NextFunction
) => {};

export const getSingleShippingMethod = async (
	req: Request<{ method: string }>,
	res: Response,
	next: NextFunction
) => {};

export const updateSingleShippingMethod = async (
	req: Request<{ method: string }, {}, Partial<IShippingMethod>>,
	res: Response,
	next: NextFunction
) => {};

export const deleteSingleShippingMethod = async (
	req: Request<{ method: string }>,
	res: Response,
	next: NextFunction
) => {};

export const restoreSingleShippingMethod = async (
	req: Request<{ method: string }>,
	res: Response,
	next: NextFunction
) => {};
