import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body, ValidationChain } from "express-validator";
import createError from "http-errors";
import httpStatus, { HttpStatus } from "http-status";
import { ObjectId } from "mongodb";
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
	SortItemType,
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
 * @openapi
 * /v1/reviews:
 *   post:
 *     summary: Creates a new review.
 *     description: Creates a review for a product from a completed order. Requires User role.
 *     tags:
 *       - Reviews
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - product
 *               - rating
 *               - order
 *             properties:
 *               product:
 *                 type: string
 *                 description: Product ID
 *               order:
 *                 type: string
 *                 description: Order ID
 *               rating:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 5
 *               comment:
 *                 type: string
 *                 maxLength: 1000
 *     responses:
 *       "201":
 *         description: Review created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 201
 *                 entities:
 *                   type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Reviews'
 *                 flashes:
 *                   type: object
 *       "400":
 *         description: Validation error or invalid state (e.g., already reviewed, order not completed).
 *       "401":
 *         description: Unauthorized.
 *       "500":
 *         description: Internal Server Error.
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

/**
 * @openapi
 * /v1/reviews:
 *   get:
 *     summary: Retrieves a paginated list of reviews.
 *     description: Fetches reviews with filtering, sorting, and pagination.
 *     tags:
 *       - Reviews
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search query.
 *       - in: query
 *         name: deleted
 *         schema:
 *           type: boolean
 *         description: Include deleted reviews (Admin only).
 *       - in: query
 *         name: minRating
 *         schema:
 *           type: number
 *       - in: query
 *         name: maxRating
 *         schema:
 *           type: number
 *     responses:
 *       "200":
 *         description: List of reviews.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 entities:
 *                   type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Reviews'
 *                     meta:
 *                       type: object
 *                       properties:
 *                         pagination:
 *                           type: object
 *       "500":
 *         description: Internal Server Error.
 */
export const getReviews = async (
	req: Request<
		{},
		FormatResponseObjectType<IReviewDocument, HttpStatus["OK"]>,
		{},
		Partial<
			Pick<PaginateOptions, "sort" | "page" | "limit" | "offset" | "pagination"> & {
				deleted?: boolean | number;
				minRating?: number;
				maxRating?: number;
			}
		>
	>,
	res: Response<FormatResponseObjectType<IReviewDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Destructure the query parameters (req.query) into
	// deleted (include deleted countries), minRating, maxRating, and query(pagination & sorting options)
	const { deleted, minRating = 0, maxRating = 0 } = req.query || {};

	// Check if the query includes a deleted flag
	const isFilterByDeletedAllowed: boolean = "deleted" in req.query;

	// List of sort options
	const sort: SortItemType<"rating" | "createdAt">[] = [
		{ name: "Rating A-Z", value: { rating: 1 } },
		{ name: "Rating Z-A", value: { rating: -1 } },
		{ name: "Created Date Ascending", value: { createdAt: 1 } },
		{ name: "Created Date Descending", value: { createdAt: -1 } },
	];

	// Attempt to retrieve the reviews using the given query and pagination options,
	// and if there was an error, return the error and end the request
	const [paginatedReviewsError, paginatedReviews] = await to(
		Review.paginate<IReviewDocument>(
			{
				// If the query includes a deleted flag, include deleted products
				...((isFilterByDeletedAllowed && { deleted: Boolean(deleted) }) || {}),
				// Filter reviews by price range
				...(((minRating || maxRating) && {
					rating: {
						...(minRating && { $gte: minRating }),
						...(maxRating && { $lte: maxRating }),
					},
				}) ||
					{}),
			},
			// Use the query parameters for pagination and sorting
			{
				...("sort" in req.query && { sort: req.query.sort }),
				...("page" in req.query && { page: Number(req.query.page) }),
				...("limit" in req.query && { limit: Number(req.query.limit) }),
				...("offset" in req.query && { offset: Number(req.query.offset) }),
				...("pagination" in req.query && { pagination: Boolean(req.query.pagination) }),
				populate: [
					{ path: "product", select: "-_id name" },
					{ path: "user", select: "-_id name" },
				],
			}
		)
	);
	if (paginatedReviewsError) return next(paginatedReviewsError);

	// Destructure the paginated reviews into the list of reviews (docs) and pagination metadata
	const { docs, ...pagination } = paginatedReviews;

	// Return the list of reviews, pagination metadata, and sort options in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: [...(docs || [])], meta: { pagination, sort } },
		})
	);
};

/**
 * @openapi
 * /v1/products/{product}/reviews:
 *   get:
 *     summary: Retrieves reviews for a specific product.
 *     description: Fetches reviews for a given product ID.
 *     tags:
 *       - Reviews
 *     parameters:
 *       - in: path
 *         name: product
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID.
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *     responses:
 *       "200":
 *         description: Product reviews and statistics.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 entities:
 *                   type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Reviews'
 *                     stats:
 *                       type: object
 *                     meta:
 *                       type: object
 *                       properties:
 *                         pagination:
 *                           type: object
 *       "500":
 *         description: Internal Server Error.
 */
export const getReviewsForProduct = async (
	req: Request<
		{ product: string },
		FormatResponseObjectType<
			Pick<IReviewDocument, "rating" | "comment" | "createdAt"> & {
				user: { name: string };
			},
			HttpStatus["OK"]
		>,
		{},
		Partial<Pick<PaginateOptions, "sort" | "page" | "limit" | "offset" | "pagination">>
	>,
	res: Response<
		FormatResponseObjectType<
			Pick<IReviewDocument, "rating" | "comment" | "createdAt"> & {
				user: { name: string };
			},
			HttpStatus["OK"]
		>
	>,
	next: NextFunction
): Promise<void> => {
	// Extract the product identifier from request parameters
	const { product: productIdentifier } = req.params || {};

	// List of sort options
	const sort: SortItemType<"rating" | "createdAt">[] = [
		{ name: "Rating A-Z", value: { rating: 1 } },
		{ name: "Rating Z-A", value: { rating: -1 } },
		{ name: "Created Date Ascending", value: { createdAt: 1 } },
		{ name: "Created Date Descending", value: { createdAt: -1 } },
	];

	// Create an aggregation pipeline to retrieve the product reviews statistics
	const [statsError, stats] = await to(
		Review.aggregate<{
			total: number;
			average: number;
			rating: { rating: number; count: number }[];
		}>([
			{ $match: { product: new ObjectId(productIdentifier) } },
			{
				$bucket: {
					groupBy: "$rating",
					boundaries: [1, 2, 3, 4, 5, 6],
					default: "Other",
					output: { count: { $sum: 1 } },
				},
			},
			{ $sort: { _id: 1 } },
			{
				$group: {
					_id: null,
					total: { $sum: "$count" },
					average: { $sum: { $multiply: ["$_id", "$count"] } },
					ratings: { $push: { rating: "$_id", count: "$count" } },
				},
			},
			{
				$project: {
					_id: 0,
					total: 1,
					average: {
						$cond: {
							if: { $eq: ["$total", 0] },
							then: 0,
							else: { $divide: ["$average", "$total"] },
						},
					},
					ratings: {
						$map: {
							input: [1, 2, 3, 4, 5],
							as: "rating",
							in: {
								rating: "$$rating",
								count: {
									$reduce: {
										input: "$ratings",
										initialValue: 0,
										in: {
											$cond: {
												if: { $eq: ["$$this.rating", "$$rating"] },
												then: "$$this.count",
												else: "$$value",
											},
										},
									},
								},
							},
						},
					},
				},
			},
		])
	);
	if (statsError) return next(statsError);

	// Attempt to retrieve the product reviews using the given query and pagination options,
	// and if there was an error, return the error and end the request
	const [paginatedProductReviewsError, paginatedProductReviews] = await to(
		Review.aggregatePaginate<
			Pick<IReviewDocument, "rating" | "comment" | "createdAt"> & {
				user: { name: string };
			}
		>(
			Review.aggregate([
				{ $match: { product: new ObjectId(productIdentifier) } },
				{
					$lookup: {
						from: "users",
						localField: "user",
						foreignField: "_id",
						as: "userDetails",
					},
				},
				{ $unwind: { path: "$userDetails", preserveNullAndEmptyArrays: true } },
				{ $set: { user: "$userDetails" } },
				{ $unset: "userDetails" },
				{ $project: { rating: 1, comment: 1, createdAt: 1, "user.name": 1 } },
			]),
			// Use the query parameters for pagination and sorting
			{
				...("sort" in req.query && {
					sort: req.query.sort,
					...("price" in (req.query.sort as object) && {
						sort: {
							"price.sale": (req.query.sort as { price: any }).price,
							"price.normal": (req.query.sort as { price: any }).price,
						},
					}),
				}),
				...("page" in req.query && { page: Number(req.query.page) }),
				...("limit" in req.query && { limit: Number(req.query.limit) }),
				...("offset" in req.query && { offset: Number(req.query.offset) }),
				...("pagination" in req.query && { pagination: Boolean(req.query.pagination) }),
			}
		)
	);
	if (paginatedProductReviewsError) return next(paginatedProductReviewsError);

	// Destructure the paginated product reviews into the list of reviews (docs) and pagination metadata
	const { docs, ...pagination } = paginatedProductReviews;

	// Return the list of product reviews, statistics, pagination metadata, and sort options in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: {
				data: [...(docs || [])],
				stats: { ...(stats?.[0] || {}) },
				meta: { pagination, sort },
			},
		})
	);
};

/**
 * @openapi
 * /v1/reviews/{review}:
 *   get:
 *     summary: Retrieves a single review.
 *     description: Fetches a review by ID. Requires Admin or SuperAdmin role.
 *     tags:
 *       - Reviews
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: review
 *         required: true
 *         schema:
 *           type: string
 *         description: Review ID.
 *     responses:
 *       "200":
 *         description: Review details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 entities:
 *                   type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Reviews'
 *       "401":
 *         description: Unauthorized.
 *       "404":
 *         description: Review not found.
 *       "500":
 *         description: Internal Server Error.
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
 * @openapi
 * /v1/reviews/{review}:
 *   patch:
 *     summary: Updates a single review.
 *     description: Updates review details (comment, rating).
 *     tags:
 *       - Reviews
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: review
 *         required: true
 *         schema:
 *           type: string
 *         description: Review ID.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               comment:
 *                 type: string
 *                 maxLength: 1000
 *               rating:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 5
 *     responses:
 *       "200":
 *         description: Review updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 entities:
 *                   type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Reviews'
 *                 flashes:
 *                   type: object
 *       "401":
 *         description: Unauthorized.
 *       "404":
 *         description: Review not found.
 *       "500":
 *         description: Internal Server Error.
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
 * @openapi
 * /v1/reviews/{review}:
 *   delete:
 *     summary: Deletes a single review.
 *     description: Soft-deletes a review. Requires Admin or SuperAdmin role.
 *     tags:
 *       - Reviews
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: review
 *         required: true
 *         schema:
 *           type: string
 *         description: Review ID.
 *     responses:
 *       "200":
 *         description: Review deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 flashes:
 *                   type: object
 *       "401":
 *         description: Unauthorized.
 *       "404":
 *         description: Review not found.
 *       "500":
 *         description: Internal Server Error.
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
 * @openapi
 * /v1/reviews/{review}/restore:
 *   patch:
 *     summary: Restores a single review.
 *     description: Restores a soft-deleted review. Requires Admin or SuperAdmin role.
 *     tags:
 *       - Reviews
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: review
 *         required: true
 *         schema:
 *           type: string
 *         description: Review ID.
 *     responses:
 *       "200":
 *         description: Review restored successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 flashes:
 *                   type: object
 *       "401":
 *         description: Unauthorized.
 *       "404":
 *         description: Review not found.
 *       "500":
 *         description: Internal Server Error.
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
