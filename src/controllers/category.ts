import { NextFunction, Request, Response } from "express";
import { body } from "express-validator";

export const _validator = (method: string) => {
	switch (method) {
		case "create":
		case "update":
			return [
				body("name").trim().escape().notEmpty().withMessage("You must supply a name!"),
				body("description")
					.trim()
					.escape()
					.notEmpty()
					.withMessage("You must supply a street!"),
				body("icon")
					.if((_value, { req }) => !req.body.parent)
					.notEmpty()
					.withMessage("For parent categories you must add an icon."),
			];
		default:
			return [];
	}
};

export const postNewCategory = async (req: Request, res: Response, next: NextFunction) => {};
export const getCategories = async (req: Request, res: Response, next: NextFunction) => {};
export const getSingleCategory = async (req: Request, res: Response, next: NextFunction) => {};
export const updateSingleCategory = async (req: Request, res: Response, next: NextFunction) => {};
export const deleteSingleCategory = async (req: Request, res: Response, next: NextFunction) => {};
