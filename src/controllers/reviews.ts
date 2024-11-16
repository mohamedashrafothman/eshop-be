import { NextFunction, Request, Response } from "express";
import { body, ValidationChain } from "express-validator";
import { HttpStatus } from "http-status";
import { PaginateOptions } from "mongoose";
import IReview from "../interfaces/Review.interface";
import { IReviewDocument } from "../models/Review";
import { FormatResponseObjectType } from "../utils/helpers";

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
				body("comment")
					.optional()
					.trim()
					.escape()
					.notEmpty()
					.withMessage("Comment is required!")
					.isLength({ max: 1000 })
					.withMessage("Comment must be at most 1000 characters long!"),
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
				body("comment")
					.optional()
					.trim()
					.escape()
					.notEmpty()
					.withMessage("Comment is required!")
					.isLength({ max: 1000 })
					.withMessage("Comment must be at most 1000 characters long!"),
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

export const postNewReview = async (
	req: Request<
		{},
		FormatResponseObjectType<IReviewDocument, HttpStatus["CREATED"]>,
		Pick<IReview, "title" | "comment" | "rating" | "product">
	>,
	res: Response<FormatResponseObjectType<IReviewDocument, HttpStatus["CREATED"]>>,
	next: NextFunction
): Promise<void> => {
	// TODO: Implement post new review functionality.
};

export const getReviews = async (
	req: Request<
		{},
		FormatResponseObjectType<IReviewDocument, HttpStatus["OK"]>,
		{},
		Partial<
			Pick<PaginateOptions, "sort" | "page" | "limit" | "offset" | "pagination"> & {
				q?: string;
				deleted?: boolean | number;
			}
		>
	>,
	res: Response<FormatResponseObjectType<IReviewDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// TODO: Implement get reviews functionality.
};

export const getSingleReview = async (
	req: Request<{ review: string }, FormatResponseObjectType<IReviewDocument, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<IReviewDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// TODO: Implement get single review functionality.
};

export const updateSingleReview = async (
	req: Request<
		{ review: string },
		FormatResponseObjectType<IReviewDocument, HttpStatus["OK"]>,
		Partial<Pick<IReview, "title" | "comment" | "rating" | "product">> & {
			icon?: Express.Multer.File;
		}
	>,
	res: Response<FormatResponseObjectType<IReviewDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// TODO: Implement update single review functionality.
};

export const deleteSingleReview = async (
	req: Request<{ review: string }, FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// TODO: Implement delete single review functionality.
};

export const restoreSingleReview = async (
	req: Request<{ review: string }, FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// TODO: Implement restore single review functionality.
};
