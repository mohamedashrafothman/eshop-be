import { NextFunction, Request, Response } from "express";
import { ValidationChain } from "express-validator";

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

export const postNewCity = async (req: Request, res: Response, next: NextFunction) => {};

export const getCities = async (req: Request, res: Response, next: NextFunction) => {};

export const getSingleCity = async (req: Request, res: Response, next: NextFunction) => {};

export const updateSingleCity = async (req: Request, res: Response, next: NextFunction) => {};

export const deleteSingleCity = async (req: Request, res: Response, next: NextFunction) => {};

export const restoreSingleCity = async (req: Request, res: Response, next: NextFunction) => {};
