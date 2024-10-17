import { NextFunction, Request, Response } from "express";

export const validator = (method: string) => {
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
