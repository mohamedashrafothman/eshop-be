import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body, ValidationChain } from "express-validator";
import createError from "http-errors";
import httpStatus from "http-status";
import mongoose from "mongoose";
import Product, { type IProductDocument } from "../models/Product";
import Review from "../models/Review";
import { formatResponseObject, handleTransactionError } from "../utils/helpers";

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
	// TODO: add order functionality

	// check if user logged in
	if (!req.user) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	// start transaction
	const session = await mongoose.startSession();
	session.startTransaction();

	// check if product exists
	let existsProductError: Error | null;
	let existsProduct: IProductDocument | undefined | null;
	[existsProductError, existsProduct] = await to(
		Product.findOne({ _id: req.body.product }).session(session)
	);
	if (existsProductError || !existsProduct) {
		handleTransactionError(session);
		return next(existsProductError);
	}

	// check if review exists
	const [existsReviewError, existsReview] = await to(
		Review.findOne({ user: req.user._id, product: req.body.product }).session(session)
	);
	if (existsReviewError || existsReview) {
		handleTransactionError(session);
		let error;
		if (existsReview) error = createError(httpStatus.CONFLICT, "Review already submitted!");
		return next(
			existsReviewError ||
				(existsReview && error && { ...(error || {}), status: error.status }) ||
				null
		);
	}

	// create review
	const [createdReviewError, createdReview] = await to(
		Review.create([{ ...(req.body || {}), user: req.user._id }], { session })
	);
	if (createdReviewError) {
		handleTransactionError(session);
		return next(createdReviewError);
	}

	// add review to product
	const [updateProductError] = await to(
		Product.updateOne(
			{ _id: existsProduct._id },
			{
				$addToSet: { reviews: createdReview[0]._id },
				$inc: { reviewCount: 1 },
				$set: {
					averageRating: (existsProduct.reviews.length > 0
						? (existsProduct.averageRating * existsProduct.reviewCount +
								req.body.rating) /
							(existsProduct.reviewCount + 1)
						: req.body.rating
					).toFixed(2),
				},
			}
		).session(session)
	);
	if (updateProductError) {
		handleTransactionError(session);
		return next(updateProductError);
	}

	// commit the transaction
	await session.commitTransaction();
	session.endSession();

	req.flash("success", "Review created successfully.");
	res.status(httpStatus.CREATED).json(
		formatResponseObject({
			status: httpStatus.CREATED,
			entities: { data: createdReview[0].toJSON() },
			flashes: req.flash(),
		})
	);
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
