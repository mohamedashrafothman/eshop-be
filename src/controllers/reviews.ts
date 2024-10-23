import { NextFunction, Request, Response } from "express";
import { body, ValidationChain } from "express-validator";

/**
 * Validates the input fields based on the method provided.
 */
export const validator = (method: "create" | "update"): ValidationChain[] => {
	switch (method) {
		case "create":
			return [
				body("title")
					.trim()
					.escape()
					.notEmpty()
					.withMessage("You must supply a title!")
					.isLength({ max: 100 })
					.withMessage("Title must be at most 100 characters long!"),
				body("description")
					.optional()
					.trim()
					.escape()
					.notEmpty()
					.withMessage("Description is required!")
					.isLength({ max: 1000 })
					.withMessage("Description must be at most 1000 characters long!"),
				body("rating")
					.isNumeric()
					.withMessage("You must supply a rating!")
					.isInt({ min: 0, max: 5 })
					.withMessage(
						"Rating must be an integer greater than or equal 0 and less than or equal 5!"
					)
					.toInt(),
				body("product")
					.isMongoId()
					.withMessage("Invalid country id!")
					.notEmpty()
					.withMessage("Product is required!"),
			];
		case "update":
			return [
				body("title")
					.optional()
					.trim()
					.escape()
					.notEmpty()
					.withMessage("You must supply a title!")
					.isLength({ max: 100 })
					.withMessage("Title must be at most 100 characters long!"),
				body("description")
					.optional()
					.trim()
					.escape()
					.notEmpty()
					.withMessage("Description is required!")
					.isLength({ max: 1000 })
					.withMessage("Description must be at most 1000 characters long!"),
				body("rating")
					.optional()
					.isNumeric()
					.withMessage("You must supply a rating!")
					.isInt({ min: 0, max: 5 })
					.withMessage(
						"Rating must be an integer greater than or equal 0 and less than or equal 5!"
					)
					.toInt(),
				body("product")
					.optional()
					.isMongoId()
					.withMessage("Invalid country id!")
					.notEmpty()
					.withMessage("Product is required!"),
			];
		default:
			return [];
	}
};

export const postNewReview = async (req: Request, res: Response, next: NextFunction) => {
	// TODO: Implement post new review functionality.
};

export const getReviews = async (req: Request, res: Response, next: NextFunction) => {
	// TODO: Implement get reviews functionality.
};

export const getSingleReview = async (req: Request, res: Response, next: NextFunction) => {
	// TODO: Implement get single review functionality.
};

export const updateSingleReview = async (req: Request, res: Response, next: NextFunction) => {
	// TODO: Implement update single review functionality.
};

export const deleteSingleReview = async (req: Request, res: Response, next: NextFunction) => {
	// TODO: Implement delete single review functionality.
};

export const restoreSingleReview = async (req: Request, res: Response, next: NextFunction) => {
	// TODO: Implement restore single review functionality.
};
