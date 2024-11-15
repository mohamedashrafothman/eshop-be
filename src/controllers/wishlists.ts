import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body, ValidationChain } from "express-validator";
import createError from "http-errors";
import httpStatus, { HttpStatus } from "http-status";
import { PaginateOptions } from "mongoose";
import Product, { IProductDocument } from "../models/Product";
import Wishlist from "../models/Wishlist";
import { formatResponseObject, FormatResponseObjectType } from "../utils/helpers";

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
 * @summary Retrieves the wishlist for the currently logged-in user.
 * @description Attempts to retrieve the wishlist for the currently logged-in user from the database.
 * If the user is not logged in, it returns a 401 error. If there is an error during the database
 * operation, it returns a 500 error. If the wishlist is retrieved successfully, it is returned in the
 * response.
 *
 * @param {Request} req - Express request object containing the user details.
 * @param {Response} res - Express response object.
 * @param {NextFunction} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with the wishlist data.
 *   * @property {Object} entities.data - The retrieved wishlist product list.
 * @throws {Error} 401 - Returns an error if the user is not authenticated.
 * @throws {Error} 500 - Returns an error if the wishlist retrieval fails.
 */
export const getSingleWishlist = async (
	req: Request<
		{},
		FormatResponseObjectType<IProductDocument, HttpStatus["OK"]>,
		Pick<PaginateOptions, "sort" | "page" | "limit" | "offset" | "pagination">
	>,
	res: Response<FormatResponseObjectType<IProductDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Check if user logged in
	if (req.isUnauthenticated() || !req.user) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	// List of sort options
	const sort: { name: string; value: object }[] = [
		{ name: "Name A-Z", value: { name: 1 } },
		{ name: "Name Z-A", value: { name: -1 } },
		{ name: "Price Ascending", value: { price: 1 } },
		{ name: "Price Descending", value: { price: -1 } },
		{ name: "Created Date Ascending", value: { createdAt: 1 } },
		{ name: "Created Date Descending", value: { createdAt: -1 } },
	];

	// Create an aggregation pipeline to retrieve the wishlist products
	const aggregation = Wishlist.aggregate()
		.match({ user: req.user._id })
		.unwind("$products")
		.lookup({
			from: "products",
			localField: "products",
			foreignField: "_id",
			as: "productDetails",
		})
		.unwind("$productDetails")
		.lookup({
			from: "attachments",
			localField: "productDetails.images",
			foreignField: "_id",
			as: "productDetails.images",
		})
		.unwind({ path: "$productDetails.images", preserveNullAndEmptyArrays: true })
		.lookup({
			from: "attachments",
			localField: "productDetails.thumbnail",
			foreignField: "_id",
			as: "productDetails.thumbnail",
		})
		.unwind({ path: "$productDetails.thumbnail", preserveNullAndEmptyArrays: true })
		.lookup({
			from: "brands",
			localField: "productDetails.brand",
			foreignField: "_id",
			as: "productDetails.brand",
		})
		.unwind({ path: "$productDetails.brand", preserveNullAndEmptyArrays: true })
		.lookup({
			from: "categories",
			localField: "productDetails.category",
			foreignField: "_id",
			as: "productDetails.category",
		})
		.unwind({ path: "$productDetails.category", preserveNullAndEmptyArrays: true })
		.lookup({
			from: "users",
			localField: "productDetails.user",
			foreignField: "_id",
			as: "productDetails.user",
		})
		.unwind({ path: "$productDetails.user", preserveNullAndEmptyArrays: true })
		.replaceRoot("$productDetails");

	// Attempt to retrieve the wishlist products using the given query and pagination options,
	// and if there was an error, return the error and end the request
	const [paginatedWishlistProductsError, paginatedWishlistProducts] = await to(
		Wishlist.aggregatePaginate(
			aggregation,
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
 * @summary Adds a product to the logged-in user's wishlist.
 * @description Handles the addition of a product to the user's wishlist.
 * The method checks if the user is authenticated, verifies the existence of the product,
 * and updates the wishlist with the new product. If the wishlist does not exist, it is created.
 * A success message is set upon successful creation.
 *
 * @param {Object} req - Express request object containing parameters and user details.
 * @param {Object} req.body - The data for adding a product to the wishlist. Must include a valid product id.
 * @param {string} req.body.product - The id of the product to be added to the wishlist.
 * @param {Response} res - Express response object.
 * @param {NextFunction} next - Express next middleware function to handle errors.
 *
 * @returns {void} 201 - Success response indicating the wishlist was created successfully.
 *   * @property {Object} entities.data - The created wishlist products list.
 *   * @property {Array} flashes - Success message for wishlist creation.
 * @throws {Error} 401 - Returns an error if the user is not authenticated.
 * @throws {Error} 404 - Returns an error if the product or wishlist does not exist.
 * @throws {Error} 500 - Returns an error if there is an issue during the database operations or transaction.
 */
export const addToWishlist = async (
	req: Request<{}, FormatResponseObjectType<{}, HttpStatus["OK"]>, { product: string }>,
	res: Response<FormatResponseObjectType<{}, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Check if user logged in
	if (req.isUnauthenticated() || !req.user) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

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
 * @summary Removes a product from the user's wishlist.
 * @description Handles the removal of a product from the user's wishlist.
 * The method checks if the user is authenticated, verifies the existence of the wishlist item
 * and the product's stock, and updates the wishlist with the new product. If the product already
 * exists in the wishlist, it is updated with the new quantity. If the wishlist item exists in the wishlist,
 * it is updated with the new quantity.
 *
 * @param {Request} req - Express request object containing parameters and user details.
 * @param {Object} req.params - URL parameters for the request.
 * @param {String} req.params.product - The product identifier, either a slug or an ObjectId.
 * @param {Response} res - Express response object.
 * @param {NextFunction} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response indicating the wishlist was updated successfully.
 *   * @property {Object} res.body.data - The updated wishlist products list.
 * @throws {Error} 401 - Returns an error if the user is not authenticated.
 * @throws {Error} 404 - Returns an error if the wishlist item or product does not exist.
 * @throws {Error} 400 - Returns an error if the product stock is insufficient or invalid data is provided.
 * @throws {Error} 500 - Returns an error if there is an issue during the database operations or transaction.
 */
export const removeFromWishlist = async (
	req: Request<{ product: string }, FormatResponseObjectType<{}, HttpStatus["OK"]>, {}>,
	res: Response<FormatResponseObjectType<{}, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Check if user logged in
	if (req.isUnauthenticated() || !req.user) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

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
 * @summary Empties the user's wishlist.
 * @description This function removes all items from the user's wishlist and deletes the wishlist itself.
 * It checks if the user is authenticated, retrieves the wishlist for the logged-in user, and deletes
 * all wishlist items as well as the wishlist. If the user is not authenticated, it returns a 401 error. If
 * there is an issue during database operations, it returns a 500 error. Upon success, it returns
 * a 200 response indicating the wishlist was cleared successfully.
 *
 * @param {Request} req - Express request object containing user details.
 * @param {Response} res - Express response object.
 * @param {NextFunction} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response indicating the wishlist was cleared successfully.
 * @property {Object} res.body.data - An empty list.
 * @throws {Error} 401 - Returns an error if the user is not authenticated.
 * @throws {Error} 500 - Returns an error if there is an issue during the database operations.
 */
export const emptyWishlist = async (
	req: Request<{}, FormatResponseObjectType<{}, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<{}, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Check if user logged in
	if (req.isUnauthenticated() || !req.user) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	// Attempt to retrieve a wishlist from the database for logged in user,
	// and if there was an error, return the error and end the request
	const [wishlistError] = await to(Wishlist.findOneAndDelete({ user: req.user._id }));
	if (wishlistError) return next(wishlistError);

	// Return the retrieved wishlist in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, entities: { data: {} } })
	);
};
