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

export const postNewState = async (req: Request, res: Response, next: NextFunction) => {};

export const getStates = async (req: Request, res: Response, next: NextFunction) => {};

export const getSingleState = async (req: Request, res: Response, next: NextFunction) => {};

export const updateSingleState = async (req: Request, res: Response, next: NextFunction) => {};

export const deleteSingleState = async (req: Request, res: Response, next: NextFunction) => {};

export const restoreSingleState = async (req: Request, res: Response, next: NextFunction) => {};
