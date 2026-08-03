import to from "await-to-js";
import { NextFunction, Response } from "express";
import { body, ValidationChain } from "express-validator";
import httpStatus, { HttpStatus } from "http-status";
import { PaginateOptions } from "mongoose";
import { AuthenticatedRequest } from "../@types/express";
import Product, { IProductDocument } from "../models/Product";
import Wishlist from "../models/Wishlist";
import {
	formatResponseObject,
	FormatResponseObjectType,
	type SortItemType,
} from "../utils/helpers";

/**
 * Validates the input fields based on the method provided.
 */
export const validator = (method: "add"): ValidationChain[] => {
	switch (method) {
		case "add":
			return [
				body("product")
					.trim()
					.escape()
					.isMongoId()
					.withMessage("Invalid product id!")
					.notEmpty()
					.withMessage("You must supply a product id!"),
			];
		default:
			return [];
	}
};

/**
 * @openapi
 * /v1/wishlists:
 *   get:
 *     summary: Retrieves the user's wishlist
 *     description: Fetches the wishlist for the logged-in user with pagination support.
 *     tags:
 *       - Wishlists
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Items per page
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *         description: Sort field
 *     responses:
 *       200:
 *         description: Wishlist retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     entities:
 *                       type: object
 *                       properties:
 *                         data:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/Products'
 *                         meta:
 *                           $ref: '#/components/schemas/Meta'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const getSingleWishlist = async (
	req: AuthenticatedRequest<
		{},
		FormatResponseObjectType<IProductDocument, HttpStatus["OK"]>,
		Partial<Pick<PaginateOptions, "sort" | "page" | "limit" | "offset" | "pagination">>
	>,
	res: Response<FormatResponseObjectType<IProductDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// List of sort options
	const sort: SortItemType<"name" | "price" | "createdAt">[] = [
		{ name: "Name A-Z", value: { name: 1 } },
		{ name: "Name Z-A", value: { name: -1 } },
		{ name: "Price Ascending", value: { price: 1 } },
		{ name: "Price Descending", value: { price: -1 } },
		{ name: "Created Date Ascending", value: { createdAt: 1 } },
		{ name: "Created Date Descending", value: { createdAt: -1 } },
	];

	// Attempt to retrieve the wishlist products using the given query and pagination options,
	// and if there was an error, return the error and end the request
	const [paginatedWishlistProductsError, paginatedWishlistProducts] = await to(
		Wishlist.aggregatePaginate<IProductDocument>(
			Wishlist.aggregate([
				{ $match: { user: req.user._id } },
				{ $unwind: "$products" },
				{
					$lookup: {
						from: "products",
						localField: "products",
						foreignField: "_id",
						as: "productDetails",
					},
				},
				{ $unwind: "$productDetails" },
				{
					$lookup: {
						from: "attachments",
						localField: "productDetails.images",
						foreignField: "_id",
						as: "productDetails.images",
					},
				},
				{ $unwind: { path: "$productDetails.images", preserveNullAndEmptyArrays: true } },
				{
					$lookup: {
						from: "attachments",
						localField: "productDetails.thumbnail",
						foreignField: "_id",
						as: "productDetails.thumbnail",
					},
				},
				{
					$unwind: {
						path: "$productDetails.thumbnail",
						preserveNullAndEmptyArrays: true,
					},
				},
				{
					$lookup: {
						from: "brands",
						localField: "productDetails.brand",
						foreignField: "_id",
						as: "productDetails.brand",
					},
				},
				{ $unwind: { path: "$productDetails.brand", preserveNullAndEmptyArrays: true } },
				{
					$lookup: {
						from: "categories",
						localField: "productDetails.category",
						foreignField: "_id",
						as: "productDetails.category",
					},
				},
				{ $unwind: { path: "$productDetails.category", preserveNullAndEmptyArrays: true } },
				{
					$lookup: {
						from: "users",
						localField: "productDetails.user",
						foreignField: "_id",
						as: "productDetails.user",
					},
				},
				{ $unwind: { path: "$productDetails.user", preserveNullAndEmptyArrays: true } },
				{ $replaceRoot: { newRoot: "$productDetails" } },
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
	if (paginatedWishlistProductsError) return next(paginatedWishlistProductsError);

	// Destructure the paginated wishlist products into the list of products (docs) and pagination metadata
	const { docs, ...pagination } = paginatedWishlistProducts;

	// Return the list of wishlist products, pagination metadata, and sort options in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: [...(docs || [])], meta: { pagination, sort } },
		})
	);
};

/**
 * @openapi
 * /v1/wishlists:
 *   post:
 *     summary: Add a product to the wishlist
 *     description: Adds a product ID to the user's wishlist.
 *     tags:
 *       - Wishlists
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
 *             properties:
 *               product:
 *                 type: string
 *                 description: Product ID (MongoDB ObjectId)
 *                 example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: Product added to wishlist successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       404:
 *         description: Product not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       422:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const addToWishlist = async (
	req: AuthenticatedRequest<
		{},
		FormatResponseObjectType<{}, HttpStatus["OK"]>,
		{ product: string }
	>,
	res: Response<FormatResponseObjectType<{}, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Destructure the request body to get product data
	const { product } = req.body;

	// Check if product exists, and if there is an error or no product is found,
	// pass the error to the next middleware
	const [existsProductError, existsProduct] = await to(Product.findOne({ _id: product }));
	if (existsProductError || !existsProduct) return next(existsProductError);

	// Attempt to find the user's wishlist, or create one if it doesn't exist,
	// and if there is an error, pass the error to the next middleware
	const [wishlistError] = await to(
		Wishlist.findOneAndUpdate(
			{ user: req.user._id },
			{ $addToSet: { products: existsProduct._id } },
			{ upsert: true }
		)
	);
	if (wishlistError) return next(wishlistError);

	// Return the retrieved wishlist in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, entities: { data: {} } })
	);
};

/**
 * @openapi
 * /v1/wishlists/{product}:
 *   delete:
 *     summary: Remove a product from the wishlist
 *     description: Removes a product ID from the user's wishlist.
 *     tags:
 *       - Wishlists
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: product
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID (MongoDB ObjectId)
 *         example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: Product removed from wishlist successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const removeFromWishlist = async (
	req: AuthenticatedRequest<
		{ product: string },
		FormatResponseObjectType<{}, HttpStatus["OK"]>,
		{}
	>,
	res: Response<FormatResponseObjectType<{}, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Retrieve the product ID or slug from the request parameters
	const { product: productIdentifier } = req.params || {};

	// Attempt to retrieve a wishlist from the database for logged in user,
	// and if there was an error, return the error and end the request
	const [wishlistError] = await to(
		Wishlist.findOneAndUpdate(
			{ user: req.user._id },
			{ $pull: { products: productIdentifier } }
		)
	);
	if (wishlistError) return next(wishlistError);

	// Return the retrieved wishlist in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, entities: { data: {} } })
	);
};

/**
 * @openapi
 * /v1/wishlists:
 *   delete:
 *     summary: Empty the wishlist
 *     description: Removes all products from the user's wishlist.
 *     tags:
 *       - Wishlists
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Wishlist emptied successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const emptyWishlist = async (
	req: AuthenticatedRequest<{}, FormatResponseObjectType<{}, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<{}, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Attempt to retrieve a wishlist from the database for logged in user,
	// and if there was an error, return the error and end the request
	const [wishlistError] = await to(Wishlist.findOneAndDelete({ user: req.user._id }));
	if (wishlistError) return next(wishlistError);

	// Return the retrieved wishlist in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, entities: { data: {} } })
	);
};
