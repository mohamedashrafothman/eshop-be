import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body, ValidationChain } from "express-validator";
import createError from "http-errors";
import httpStatus, { HttpStatus } from "http-status";
import mongoose, { ClientSession, PaginateOptions } from "mongoose";
import IReview from "../interfaces/Review.interface";
import Order from "../models/Order";
import { IOrderItemDocument } from "../models/OrderItem";
import Product, { IProductDocument } from "../models/Product";
import Review, { IReviewDocument } from "../models/Review";
import {
	formatResponseObject,
	FormatResponseObjectType,
	handleTransactionError,
} from "../utils/helpers";
import vars from "../utils/vars";

/**
 * Validates the input fields based on the method provided.
 */
export const validator = (method: "create" | "update"): ValidationChain[] => {
	switch (method) {
		case "create":
			return [
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
						"Rating must an integer greater than or equal 0 and less than or equal 5!"
					)
					.toInt(),
				body("product")
					.isMongoId()
					.withMessage("Invalid product id!")
					.notEmpty()
					.withMessage("Product is required!"),
				body("order")
					.isMongoId()
					.withMessage("Invalid order id!")
					.notEmpty()
					.withMessage("Order is required!"),
			];
		case "update":
			return [
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
						"Rating must an integer an integer greater than or equal 0 and less than or equal 5!"
					)
					.toInt(),
			];
		default:
			return [];
	}
};

/**
 * @summary Creates a new review.
 * @description This function validates the request body to ensure that it contains the required fields,
 * and then creates a new review document in the database.
 *
 * @param {Request} req - Express request object containing the review data in the body.
 * @param {string} req.params.product - The ID of the product to review.
 * @param {string} req.params.order - The ID of the order containing the product.
 * @param {string} [req.params.comment] - The comment for the review (optional).
 * @param {number} req.params.rating - The rating for the review.
 * @param {Response} res - Express response object.
 * @param {NextFunction} next - Express next middleware function to handle errors.
 *
 * @returns {void} 201 - Success response with the created review data.
 * @property {Object} res.body.data - The created review object.
 * @throws {Error} 401 - Returns an error if the user is not authenticated.
 * @throws {Error} 400 - Returns an error if the user has already reviewed the product before,
 * or if the product does not belong to the user orders in complete status.
 * @throws {Error} - Returns an error if there is an issue during the database operations.
 */
export const postNewReview = async (
	req: Request<
		{},
		FormatResponseObjectType<IReviewDocument, HttpStatus["CREATED"]>,
		Pick<IReview, "comment" | "rating" | "product"> & { order: string }
	>,
	res: Response<FormatResponseObjectType<IReviewDocument, HttpStatus["CREATED"]>>,
	next: NextFunction
): Promise<void> => {
	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	// Check if user logged in
	if (req.isUnauthenticated() || !req.user || ![vars.auth.roles.user].includes(req.user.role)) {
		const error = createError(httpStatus.UNAUTHORIZED);
		handleTransactionError(session);
		return next({ ...(error || {}), status: error.status });
	}

	// Destructure the request body to get product, comment, and rating data
	const { product, comment, rating, order } = req.body;

	// Check if the product exists, and if there was an error,
	// return the error and end the request
	let productExists: IProductDocument | null | undefined;
	let productError: Error | null = null;
	[productError, productExists] = await to(Product.findOne({ _id: product }).session(session));
	if (productError || !productExists) {
		handleTransactionError(session);
		return next();
	}

	// Check if the order exists, and if there was an error,
	// return the error and end the request
	const [orderError, orderExists] = await to(
		Order.findOne({ _id: order, user: req.user._id })
			.populate({ path: "items" })
			.session(session)
	);
	if (orderError || !orderExists) {
		handleTransactionError(session);
		return next();
	}

	// Check if user reviewed the product before, and if there was an error,
	// return the error and end the request
	const [reviewError, reviewExists] = await to(
		Review.findOne({ product, user: req.user._id }).session(session)
	);
	if (reviewError || reviewExists) {
		const error = createError(
			httpStatus.BAD_REQUEST,
			"You have already reviewed this product before."
		);
		handleTransactionError(session);
		return next({ ...(error || {}), status: error.status });
	}

	// Check if the product in order
	const orderItems = orderExists.items as IOrderItemDocument[];
	const productInOrder = orderItems.find((orderItem) => orderItem.product.toString() === product);
	if (!productInOrder) {
		const error = createError(httpStatus.BAD_REQUEST, "You can't review this product.");
		handleTransactionError(session);
		return next({ ...(error || {}), status: error.status });
	}

	// Check if the order is completed
	if (orderExists.status !== vars.order.status.completed) {
		const error = createError(
			httpStatus.BAD_REQUEST,
			"You can only review products from completed orders."
		);
		handleTransactionError(session);
		return next({ ...(error || {}), status: error.status });
	}

	// Create a new review from the request body data, and if there was an error,
	// return the error and end the request
	const [createdReviewError, createdReview] = await to(
		Review.create([{ product, user: req.user._id, rating, ...(comment && { comment }) }], {
			session,
		})
	);
	if (createdReviewError) {
		handleTransactionError(session);
		return next(createdReviewError);
	}

	// Add the review to the product reviews array
	productExists = Object.assign(productExists, {
		reviews: [...(productExists.reviews || []), createdReview[0]._id],
	});
	const [saveError] = await to(productExists.save({ session }));
	if (saveError) {
		handleTransactionError(session);
		return next(saveError);
	}

	// Commit the transaction
	await session.commitTransaction();
	session.endSession();

	// Set a flash message to indicate that the review was created successfully,
	// and return the created review in the response
	req.flash("success", "Review created successfully.");
	res.status(httpStatus.CREATED).json(
		formatResponseObject({
			status: httpStatus.CREATED,
			entities: { data: createdReview[0] },
			flashes: req.flash(),
		})
	);
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

export const getReviewsForProduct = async (
	req: Request<
		{ product: string },
		FormatResponseObjectType<IReviewDocument, HttpStatus["OK"]>,
		{},
		Partial<
			Pick<PaginateOptions, "sort" | "page" | "limit" | "offset" | "pagination"> & {
				deleted?: boolean | number;
			}
		>
	>,
	res: Response<FormatResponseObjectType<IReviewDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// TODO: Implement get reviews for product functionality.
};

/**
 * @summary Retrieves a single review by identifier.
 * @description Fetches a review based on the provided identifier, which can be either a slug or an ObjectId.
 * Handles errors and returns the review data if found.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.params - URL parameters for the request.
 * @param {String} req.params.review - The review identifier, either a slug or an ObjectId.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with the review data.
 *   * @property {Object} entities.data - The retrieved review object.
 * @throws {Error} 401 - Returns an error if the user is not authenticated.
 * @throws {Error} 404 - Returns an error if no review is found.
 * @throws {Error} 500 - Returns an error if the review retrieval fails.
 */
export const getSingleReview = async (
	req: Request<{ review: string }, FormatResponseObjectType<IReviewDocument, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<IReviewDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Check if user logged in
	if (
		req.isUnauthenticated() ||
		!req.user ||
		![vars.auth.roles.superAdmin, vars.auth.roles.admin].includes(req.user.role)
	) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	// Retrieve the review ID from the request parameters
	const { review: reviewIdentifier } = req.params || {};

	// Attempt to retrieve a review from the database with the given ID,
	// and if there was an error or no review was found, return the error and end the request
	const [reviewError, review] = await to(
		Review.findOne({ _id: reviewIdentifier }).populate({ path: "user" })
	);
	if (reviewError || !review) return next(reviewError);

	// Return the retrieved review in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, entities: { data: review } })
	);
};

/**
 * @summary Updates a single review by its ID.
 * @description This method updates a review's details, including its comment and rating.
 * The method handles errors and returns a success response when the review is successfully updated.
 *
 * @param {Object} req - Express request object.
 * @param {String} req.params.review - The ID of the review to update.
 * @param {Object} req.body - The updated review data. Optionally includes `comment` and `rating` fields.
 * @param {String} [req.body.comment] - The updated comment of the review.
 * @param {String} [req.body.rating] - The updated rating of the review.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response indicating the review was updated.
 *   * @property {Object} entities.data - The retrieved updated review object.
 * @throws {Error} 401 - Returns an error if the user is not authenticated.
 * @throws {Error} 404 - If no review is found with the provided identifier.
 * @throws {Error} 500 - If an error occurs during the update process.
 */
export const updateSingleReview = async (
	req: Request<
		{ review: string },
		FormatResponseObjectType<IReviewDocument, HttpStatus["OK"]>,
		Partial<Pick<IReview, "comment" | "rating">>
	>,
	res: Response<FormatResponseObjectType<IReviewDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	// Check if user logged in
	if (req.isUnauthenticated() || !req.user) {
		const error = createError(httpStatus.UNAUTHORIZED);
		handleTransactionError(session);
		return next({ ...(error || {}), status: error.status });
	}

	// Retrieve the review ID from the request parameters
	const { review: reviewIdentifier } = req.params || {};

	// Destructure the request body to get comment, and rating data
	const { comment, rating } = req.body;

	// Check if the review is found, and if there was an error,
	// return the error and end the request
	const [reviewError, reviewExists] = await to(
		Review.findOne({
			_id: reviewIdentifier,
			...([vars.auth.roles.user].includes(req.user.role) ? { user: req.user._id } : {}),
		}).session(session)
	);
	if (reviewError || !reviewExists) {
		handleTransactionError(session);
		return next(reviewError);
	}

	// Get review product data, and if there was an error,
	// return the error and end the request
	const [productError, productExists] = await to(
		Product.findOne({ _id: reviewExists.product }).session(session)
	);
	if (productError || !productExists) {
		handleTransactionError(session);
		return next();
	}

	// Merge the old review data with the new review comment or rating
	const newReview = Object.assign(reviewExists, {
		...(comment && { comment }),
		...(rating && { rating }),
	});
	// Get the product reviews from the product
	let productReviews = [
		...(productExists.reviews?.map((review) => review?._id?.toString() || review?.toString()) ||
			[]),
	] as string[];
	// Find the index of the review in the product reviews array
	const productReviewIndex = productReviews.indexOf(reviewExists?._id?.toString());

	// Save the updated review to the database, and if there is an error during saving,
	// pass the error to the next middleware
	const [saveReviewError, updatedReview] = await to(newReview.save({ session }));
	if (saveReviewError) {
		handleTransactionError(session);
		return next(saveReviewError);
	}

	if (productReviewIndex <= -1) {
		handleTransactionError(session);
		return next();
	}

	// Merge the old product reviews data with the new product review id
	productReviews = [
		...(productReviews.slice(0, productReviewIndex) || []),
		reviewExists._id,
		...(productReviews.slice(productReviewIndex + 1) || []),
	] as string[];
	const newProduct = Object.assign(productExists, {
		reviews: productReviews,
	}) as IProductDocument;

	// Save the updated product to the database, and if there is an error during saving,
	// pass the error to the next middleware
	const [saveProductError] = await to(newProduct.save({ session }));
	if (saveProductError) {
		handleTransactionError(session);
		return next(saveProductError);
	}

	// Commit the transaction
	await session.commitTransaction();
	session.endSession();

	// Set a flash message to indicate that the review was updated successfully,
	// and return the updated review in the response
	req.flash("success", "Review updated successfully.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: updatedReview },
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Deletes a single review by its ID.
 * @description This method deletes a review from the database using the provided identifier.
 * The review is soft-deleted by marking it as deleted, ensuring it can be restored if needed.
 * The method handles errors and returns a success response when the deletion is successful.
 *
 * @param {Object} req - Express request object.
 * @param {String} req.params.review - The ID of the review to delete.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response indicating the review was deleted.
 * @throws {Error} 401 - Returns an error if the user is not authenticated.
 * @throws {Error} 404 - If no review is found with the provided identifier.
 * @throws {Error} 500 - If an error occurs during the deletion process.
 */
export const deleteSingleReview = async (
	req: Request<{ review: string }, FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Check if user logged in
	if (
		req.isUnauthenticated() ||
		!req.user ||
		![vars.auth.roles.superAdmin, vars.auth.roles.admin].includes(req.user.role)
	) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	// Extract the review identifier from request parameters
	const { review: reviewIdentifier } = req.params || {};

	// Attempt to find the review by its ID, and if there is an error or no review is found,
	// pass the error to the next middleware
	const [reviewError, review] = await to(Review.findOne({ _id: reviewIdentifier }));
	if (reviewError || !review) return next(reviewError);

	// Attempt to soft-delete the found review, and if there is an error during the deletion,
	// pass the error to the next middleware
	const [deleteReviewError] = await to(Review.deleteById(review._id, req.user._id));
	if (deleteReviewError) return next(deleteReviewError);

	// Flash success message and respond with success status
	req.flash("success", "Successfully Deleted.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};

/**
 * @summary Restores a single review by its ID.
 * @description This method restores a review that was previously soft-deleted from the database.
 * The method handles errors and returns a success response when the review is successfully restored.
 *
 * @param {Object} req - Express request object.
 * @param {String} req.params.review - The ID of the review to restore.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response indicating the review was restored.
 * @throws {Error} 404 - If no review is found with the provided identifier.
 * @throws {Error} 500 - If an error occurs during the restore process.
 */
export const restoreSingleReview = async (
	req: Request<{ review: string }, FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Extract the review identifier from request parameters
	const { review: reviewIdentifier } = req.params || {};

	// Create a query to find the review by its ID
	const singleReviewQuery = {
		_id: reviewIdentifier,
		deleted: true, // only find soft-deleted countries
	};

	// Attempt to find the review by its ID, and if there is an error or no review is found,
	// pass the error to the next middleware
	const [reviewError, review] = await to(Review.findOneWithDeleted(singleReviewQuery));
	if (reviewError || !review) return next(reviewError);

	// Attempt to restore the found review, and if there is an error during the restoration,
	// pass the error to the next middleware
	const [restoreReviewError] = await to(Review.restore(singleReviewQuery));
	if (restoreReviewError) return next(restoreReviewError);

	// Flash success message and respond with success status
	req.flash("success", "Successfully Restored.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};
