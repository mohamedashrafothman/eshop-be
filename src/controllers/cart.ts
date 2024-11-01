import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body, query, ValidationChain } from "express-validator";
import createError, { HttpError } from "http-errors";
import httpStatus, { HttpStatus } from "http-status";
import mongoose, { ClientSession } from "mongoose";
import Address from "../models/Address";
import Cart, { ICartDocument } from "../models/Cart";
import CartItem, { ICartItemDocument } from "../models/CartItem";
import PaymentMethod, { IPaymentMethodDocument } from "../models/PaymentMethod";
import Product, { IProductDocument } from "../models/Product";
import ShippingMethod, { IShippingMethodDocument } from "../models/ShippingMethod";
import Tax from "../models/Tax";
import Zone from "../models/Zone";
import {
	formatResponseObject,
	FormatResponseObjectType,
	handleTransactionError,
} from "../utils/helpers";

/**
 * Validates the input fields based on the method provided.
 */
export const validator = (
	method: "create" | "update" | "get-shipping" | "set-shipping" | "set-payment"
): ValidationChain[] => {
	switch (method) {
		case "create":
			return [
				body("product")
					.trim()
					.escape()
					.isMongoId()
					.withMessage("Invalid country id!")
					.notEmpty()
					.withMessage("You must supply a product id!"),
				body("quantity")
					.isNumeric()
					.withMessage("You must supply a quantity!")
					.isInt({ min: 1 })
					.withMessage("quantity must be an integer greater than or equal 1!")
					.toInt(),
				body("color").trim().escape().notEmpty().withMessage("You must supply a color!"),
				body("size").trim().escape().notEmpty().withMessage("You must supply a size!"),
			];
		case "update":
			return [
				body("quantity")
					.isNumeric()
					.withMessage("You must supply a quantity!")
					.isInt({ min: 1 })
					.withMessage("quantity must be an integer greater than or equal 1!")
					.toInt(),
			];
		case "get-shipping":
			return [
				query("address")
					.isMongoId()
					.withMessage("Invalid address id!")
					.notEmpty()
					.withMessage("You must supply an address id as a query param!"),
			];
		case "set-shipping":
			return [
				body("shippingMethod")
					.isMongoId()
					.withMessage("Invalid shipping method id!")
					.notEmpty()
					.withMessage("You must supply a shipping method id!"),
			];
		case "set-payment":
			return [
				body("paymentMethod")
					.isMongoId()
					.withMessage("Invalid payment method id!")
					.notEmpty()
					.withMessage("You must supply a payment method id!"),
			];
		default:
			return [];
	}
};

/**
 * @summary Checks the product stock availability.
 * @description Validates if the product has sufficient stock to fulfill the requested quantity.
 * It ensures that the product has a defined quantity, is not out of stock,
 * and has enough items available in the stock for the given quantity.
 *
 * @param {Partial<IProductDocument>} product - The product object containing the stock quantity.
 * @param {Number} [quantity=0] - The requested quantity to check against the product's stock.
 *
 * @returns {HttpError|null} - Returns an error if the product has no stock quantity, is out of stock, or the requested quantity exceeds the available stock. Returns `null` if there are no issues.
 * @throws {Error} 500 - Returns an error if the product object does not contain a valid quantity field.
 * @throws {Error} 400 - Returns an error if the product is out of stock or does not have enough stock to fulfill the request.
 */
const _checkProductStock = (
	product: Partial<IProductDocument>,
	quantity: number = 0
): HttpError | null => {
	// Check if product has quantity
	if (typeof product.quantity !== "number" || !Object.keys(product).includes("quantity"))
		return createError(httpStatus.INTERNAL_SERVER_ERROR, "passed product has no quantity");

	// Check if product is out of stock
	if (product.quantity === 0)
		return createError(httpStatus.BAD_REQUEST, "Product is out of stock");

	// Check if there's enough product quantity in the stock
	if (product.quantity - quantity < 0)
		return createError(
			httpStatus.BAD_REQUEST,
			"There're no enough product quantity in the stock"
		);

	// No error
	return null;
};

/**
 * @summary Adds a product to the logged-in user's cart.
 * @description Handles the addition of a product to the user's cart.
 * The method checks if the user is authenticated, verifies the existence of the product,
 * and updates the cart with the new product. If the product already exists in the cart,
 * it is updated with the new quantity. If the cart item exists in the cart, it is updated
 * with the new quantity.
 *
 * @param {Request} req - Express request object containing parameters and user details.
 * @param {Response} res - Express response object.
 * @param {NextFunction} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 201 - Success response indicating the cart was created successfully.
 * @property {Object} res.body.data - The updated cart data.
 * @throws {Error} 401 - Returns an error if the user is not authenticated.
 * @throws {Error} 404 - Returns an error if the product or cart item does not exist.
 * @throws {Error} 400 - Returns an error if the product stock is insufficient or invalid data is provided.
 * @throws {Error} 500 - Returns an error if there is an issue during the database operations or transaction.
 */
export const addToCart = async (
	req: Request<
		{},
		FormatResponseObjectType<ICartDocument, HttpStatus["CREATED"]>,
		{ product: string; quantity: number; color: string; size: string }
	>,
	res: Response<FormatResponseObjectType<ICartDocument, HttpStatus["CREATED"]>>,
	next: NextFunction
): Promise<void> => {
	// Check if user logged in
	if (req.isUnauthenticated() || !req?.user) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	// Destructure the request body to get product, quantity, color, and size data
	const { product, quantity, color, size } = req.body;

	// Check if product exists, and if there is an error or no product is found,
	// pass the error to the next middleware
	const [existsProductError, existsProduct] = await to(
		Product.findOne({
			_id: product,
			sizes: { $in: [size] },
			$or: [{ "colors.name": color }, { "colors.value": color }],
		}).session(session)
	);
	if (existsProductError || !existsProduct) {
		handleTransactionError(session);
		return next(existsProductError);
	}

	// Create variables to hold the cart and cart Error.
	let cart: ICartDocument | null | undefined;
	let cartError: Error | null = null;

	// Attempt to find the user's cart, and if there is an error,
	// pass the error to the next middleware
	[cartError, cart] = await to(Cart.findOne({ user: req.user._id }).session(session));
	if (cartError) {
		handleTransactionError(session);
		return next(cartError);
	}

	// Check if cart didn't exist
	if (!cart) {
		// Check if there's enough product quantity in the stock
		const noStockError = _checkProductStock(existsProduct?.toJSON(), quantity);
		if (noStockError) {
			handleTransactionError(session);
			return next({ ...(noStockError || {}), status: noStockError.status });
		}

		// Create cart item
		const [cartItemError, cartItem] = await to(
			CartItem.create([{ product, color, size, quantity }], { session })
		);
		if (cartItemError || !cartItem) {
			handleTransactionError(session);
			return next(cartItemError);
		}

		// Get cart taxes
		const [taxesError, taxes] = await to(
			Tax.find({
				$or: [
					{ applicableToAllProducts: true },
					{
						applicableCategories: {
							$in: [existsProduct?.category?._id || existsProduct?.category],
						},
					},
				],
			}).session(session)
		);
		if (taxesError) {
			handleTransactionError(session);
			return next(taxesError);
		}

		// Create cart
		const [newCartError, newCart] = await to(
			Cart.create(
				[
					{
						user: req.user._id,
						items: [cartItem[0]._id],
						taxes: taxes?.map((tax) => tax?._id || tax),
					},
				],
				{ session }
			)
		);
		if (newCartError || !newCart) {
			handleTransactionError(session);
			return next(newCartError);
		}

		// Commit the transaction
		await session.commitTransaction();
		session.endSession();

		// Set a flash message to indicate that the cart was created successfully,
		// and return the created cart in the response
		req.flash("success", "Product added to cart successfully.");
		res.status(httpStatus.CREATED).json(
			formatResponseObject({
				status: httpStatus.CREATED,
				entities: { data: newCart[0] },
				flashes: req.flash(),
			})
		);
		return;
	}

	// Create variable to hold the cart items array.
	let items: ICartDocument["items"] = cart.items;

	// Check for existing cart item in the cart
	const itemIndex: number = items.findIndex((item) => {
		const cartItem = item as ICartItemDocument;
		return (cartItem?.product?._id || cartItem?.product)?.toString() === product;
	});

	// Update cart if cart items exists before, or add new cart item if not.
	if (itemIndex > -1) {
		let cartItem = items[itemIndex] as ICartItemDocument;
		cartItem = Object.assign(cartItem, { quantity: cartItem.quantity + quantity });

		const noStockError = _checkProductStock(existsProduct.toJSON(), cartItem.quantity);
		if (noStockError) {
			handleTransactionError(session);
			return next({ ...(noStockError || {}), status: noStockError.status });
		}

		const [saveCartItemError] = await to(cartItem.save({ session }));
		if (saveCartItemError) {
			handleTransactionError(session);
			return next(saveCartItemError);
		}

		items = [
			...(items.slice(0, itemIndex) || []),
			cartItem._id,
			...(items.slice(itemIndex + 1) || []),
		] as ICartDocument["items"];
	} else {
		const noStockError = _checkProductStock(existsProduct.toJSON(), quantity);
		if (noStockError) {
			handleTransactionError(session);
			return next({ ...(noStockError || {}), status: noStockError.status });
		}

		const [newCartItemError, newCartItem] = await to(
			CartItem.create([{ product, color, size, quantity }], { session })
		);
		if (newCartItemError || !newCartItem) {
			handleTransactionError(session);
			return next(newCartItemError);
		}

		items = [...(items || []), newCartItem[0]._id] as ICartDocument["items"];
	}

	// Get cart taxes, and if there is an error pass the error to the next middleware
	const [taxesError, taxes] = await to(
		Tax.find({
			$or: [
				{ applicableToAllProducts: true },
				{
					applicableCategories: {
						$in: items?.map((item) => {
							const cartItem = item as ICartItemDocument;
							const cartItemProduct = cartItem?.product as IProductDocument;
							return cartItemProduct?.category?._id || cartItemProduct?.category;
						}),
					},
				},
			],
		}).session(session)
	);
	if (taxesError) {
		handleTransactionError(session);
		return next(taxesError);
	}

	// Merge the request body data into the existing cart object
	cart = Object.assign(cart, { items, taxes: taxes?.map((tax) => tax?._id || tax) });

	// Save the updated cart object to the database, and if there is an error during saving,
	// pass the error to the next middleware
	const [saveCartError] = await to(cart.save({ session }));
	if (saveCartError) {
		handleTransactionError(session);
		return next(saveCartError);
	}

	// Commit the transaction
	await session.commitTransaction();
	session.endSession();

	// Set a flash message to indicate that the cart was created successfully,
	// and return the created cart in the response
	req.flash("success", "Product added to cart successfully.");
	res.status(httpStatus.CREATED).json(
		formatResponseObject({
			status: httpStatus.CREATED,
			entities: { data: cart },
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Retrieves the cart for the currently logged-in user.
 * @description Attempts to retrieve the cart for the currently logged-in user from the database.
 * If the user is not logged in, it returns a 401 error. If there is an error during the database
 * operation, it returns a 500 error. If the cart is retrieved successfully, it is returned in the
 * response.
 *
 * @param {Request} req - Express request object containing the user details.
 * @param {Response} res - Express response object.
 * @param {NextFunction} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with the cart data.
 *   * @property {Object} entities.data - The retrieved cart or empty object.
 * @throws {Error} 401 - Returns an error if the user is not authenticated.
 * @throws {Error} 500 - Returns an error if the cart retrieval fails.
 */
export const getSingleCart = async (
	req: Request<{}, FormatResponseObjectType<ICartDocument | {}, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<ICartDocument | {}, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Check if user logged in
	if (req.isUnauthenticated() || !req?.user) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	// Attempt to retrieve a cart from the database for logged in user,
	// and if there was an error, return the error and end the request
	const [cartError, cart] = await to(Cart.findOne({ user: req.user._id }));
	if (cartError) return next(cartError);

	// Return the retrieved cart in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: cart || {} },
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Removes a product from the user's cart.
 * @description Handles the removal of a product from the user's cart.
 * The method checks if the user is authenticated, verifies the existence of the cart item
 * and the product's stock, and updates the cart with the new product. If the product already
 * exists in the cart, it is updated with the new quantity. If the cart item exists in the cart,
 * it is updated with the new quantity.
 *
 * @param {Request} req - Express request object containing parameters and user details.
 * @param {Object} req.params - URL parameters for the request.
 * @param {String} req.params.cartItem - The cart item identifier, either a slug or an ObjectId.
 * @param {Response} res - Express response object.
 * @param {NextFunction} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response indicating the cart was updated successfully.
 *   * @property {Object} res.body.data - The updated cart data.
 * @throws {Error} 401 - Returns an error if the user is not authenticated.
 * @throws {Error} 404 - Returns an error if the cart item or product does not exist.
 * @throws {Error} 400 - Returns an error if the product stock is insufficient or invalid data is provided.
 * @throws {Error} 500 - Returns an error if there is an issue during the database operations or transaction.
 */
export const removeItemFromCart = async (
	req: Request<
		{ cartItem: string },
		FormatResponseObjectType<ICartDocument | {}, HttpStatus["OK"]>
	>,
	res: Response<FormatResponseObjectType<ICartDocument | {}, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Check if user logged in
	if (req.isUnauthenticated() || !req?.user) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	// Retrieve the cart item ID or slug from the request parameters
	const { cartItem: cartItemIdentifier } = req.params;

	// Attempt to retrieve a cart from the database for logged in user,
	// and if there was an error, return the error and end the request
	const [cartError, cart] = await to(Cart.findOne({ user: req.user._id }).session(session));
	if (cartError || !cart) {
		handleTransactionError(session);
		return next(cartError);
	}

	// Check if the cart item included in the cart items to be removed
	if (
		!cart.items ||
		!cart.items?.map((item) => (item?._id || item).toString())?.includes(cartItemIdentifier)
	) {
		handleTransactionError(session);
		return next();
	}

	// Attempt to retrieve a cart item from the database,
	// and if there was an error, return the error and end the request
	const [cartItemError, cartItem] = await to(
		CartItem.findOne({ _id: cartItemIdentifier }).session(session)
	);
	if (cartItemError || !cartItem) {
		handleTransactionError(session);
		return next(cartItemError);
	}

	// Attempt to delete the cart item from the database,
	// and if there was an error, return the error and end the request
	const [deleteCartItemError] = await to(
		CartItem.deleteOne({ _id: cartItem?._id }).session(session)
	);
	if (deleteCartItemError) {
		handleTransactionError(session);
		return next(deleteCartItemError);
	}

	const cartFilteredItems = cart?.items.filter(
		(item) => (item?._id || item).toString() !== cartItemIdentifier
	) as ICartItemDocument[];
	const isCartItemsEmpty = cartFilteredItems.length === 0;
	let newCart: ICartDocument | null = null;

	// Check if the cart is empty
	if (isCartItemsEmpty) {
		// Delete the cart from the database, and if there is an error during saving,
		// pass the error to the next middleware
		const [deleteCartError] = await to(Cart.deleteOne({ _id: cart._id }).session(session));
		if (deleteCartError) {
			handleTransactionError(session);
			return next(deleteCartError);
		}
	} else {
		// The cart taxes are calculated based on the new cart items
		// and if there is an error during saving, pass the error to the next middleware
		const [taxesError, taxes] = await to(
			Tax.find({
				$or: [
					{ applicableToAllProducts: true },
					{
						applicableCategories: {
							$in: cartFilteredItems?.map(
								(item) =>
									(item?.product as IProductDocument)?.category?._id ||
									(item?.product as IProductDocument)?.category
							),
						},
					},
				],
			}).session(session)
		);
		if (taxesError) {
			handleTransactionError(session);
			return next(taxesError);
		}

		// Merge the old cart data with the new cart taxes and items
		newCart = Object.assign(cart, {
			items: cartFilteredItems?.map((item) => item?._id || item),
			taxes: taxes.map((tax) => tax?._id || tax),
		}) as ICartDocument;

		// Save the updated cart object to the database, and if there is an error during saving,
		// pass the error to the next middleware
		const [saveCartError] = await to(newCart.save({ session }));
		if (saveCartError) {
			handleTransactionError(session);
			return next(saveCartError);
		}
	}

	// Commit the transaction
	await session.commitTransaction();
	session.endSession();

	// Set a flash message to indicate that the cart was updated successfully,
	// and return the updated cart in the response
	req.flash("success", "Product removed from cart successfully.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: newCart || {} },
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Updates the quantity of a specific item in the user's cart.
 * @description Handles the update of a cart item's quantity for the currently logged-in user.
 * The method checks if the user is authenticated, verifies the existence of the cart item,
 * checks product stock availability, and updates the cart item and cart accordingly.
 *
 * @param {Request} req - Express request object containing parameters and user details.
 * @param {Object} req.params - URL parameters for the request.
 * @param {String} req.params.cartItem - The cart item identifier, either a slug or an ObjectId.
 * @param {Object} req.body - Request body containing the new quantity.
 * @param {Number} req.body.quantity - The updated quantity for the cart item.
 * @param {Response} res - Express response object.
 * @param {NextFunction} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response indicating the cart was updated successfully.
 * @property {Object} res.body.data - The updated cart data.
 * @throws {Error} 401 - Returns an error if the user is not authenticated.
 * @throws {Error} 404 - Returns an error if the cart item or product does not exist.
 * @throws {Error} 400 - Returns an error if the product stock is insufficient or invalid data is provided.
 * @throws {Error} 500 - Returns an error if there is an issue during the database operations or transaction.
 */
export const updateCartItem = async (
	req: Request<
		{ cartItem: string },
		FormatResponseObjectType<ICartDocument, HttpStatus["OK"]>,
		{ quantity: number }
	>,
	res: Response<FormatResponseObjectType<ICartDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Check if user logged in
	if (req.isUnauthenticated() || !req?.user) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	// Retrieve the cart item ID or slug from the request parameters
	const { cartItem: cartItemIdentifier } = req.params;

	// Retrieve the quantity from the request body
	const { quantity } = req.body;

	// Attempt to retrieve a cart item from the database,
	// and if there was an error, return the error and end the request
	const [cartItemError, cartItem] = await to(
		CartItem.findOne({ _id: cartItemIdentifier }).populate("product").session(session)
	);
	if (cartItemError || !cartItem) {
		handleTransactionError(session);
		return next(cartItemError);
	}

	// Attempt to retrieve a cart from the database for logged in user,
	// and if there was an error, return the error and end the request
	const [cartError, cart] = await to(Cart.findOne({ user: req.user._id }).session(session));
	if (cartError || !cart) {
		handleTransactionError(session);
		return next(cartError);
	}

	// Get product data from the cart item
	const product = cartItem.product as IProductDocument;
	// Merge the old cart item data with the new cart item quantity
	const newCartItem = Object.assign(cartItem, { quantity });
	// Get the cart items from the cart
	let cartItems = [
		...(cart.items?.map((item) => (item?._id || item)?.toString()) || []),
	] as string[];
	// Find the index of the cart item in the cart items array
	const itemIndex = cartItems.indexOf(cartItem?._id?.toString() || cartItem?._id || "");

	// Check if the product stock is sufficient, and if there was an error,
	// return the error and end the request
	const noStockError = _checkProductStock(product?.toJSON(), newCartItem.quantity);
	if (noStockError) {
		handleTransactionError(session);
		return next({ ...(noStockError || {}), status: noStockError.status });
	}

	// Save the updated cart item to the database, and if there is an error during saving,
	// pass the error to the next middleware
	const [saveCartItemError] = await to(newCartItem.save({ session }));
	if (saveCartItemError) {
		handleTransactionError(session);
		return next(saveCartItemError);
	}

	if (itemIndex <= -1) {
		handleTransactionError(session);
		return next();
	}

	// Merge the old cart items data with the new cart item id
	cartItems = [
		...(cartItems.slice(0, itemIndex) || []),
		cartItem._id,
		...(cartItems.slice(itemIndex + 1) || []),
	] as string[];
	const newCart = Object.assign(cart, { items: cartItems }) as ICartDocument;

	// Save the updated cart to the database, and if there is an error during saving,
	// pass the error to the next middleware
	const [saveCartError, updatedCart] = await to(newCart.save({ session }));
	if (saveCartError) {
		handleTransactionError(session);
		return next(saveCartError);
	}

	// Commit the transaction
	await session.commitTransaction();
	session.endSession();

	// Set a flash message to indicate that the cart was updated successfully,
	// and return the updated cart in the response
	req.flash("success", "Cart updated successfully.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: updatedCart },
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Empties the user's cart.
 * @description This function removes all items from the user's cart and deletes the cart itself.
 * It checks if the user is authenticated, retrieves the cart for the logged-in user, and deletes
 * all cart items as well as the cart. If the user is not authenticated, it returns a 401 error. If
 * there is an issue during database operations, it returns a 500 error. Upon success, it returns
 * a 200 response indicating the cart was cleared successfully.
 *
 * @param {Request} req - Express request object containing user details.
 * @param {Response} res - Express response object.
 * @param {NextFunction} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response indicating the cart was cleared successfully.
 * @property {Object} res.body.data - An empty object.
 * @throws {Error} 401 - Returns an error if the user is not authenticated.
 * @throws {Error} 500 - Returns an error if there is an issue during the database operations.
 */
export const emptyCart = async (
	req: Request<{}, FormatResponseObjectType<{}, HttpStatus["OK"]>, {}>,
	res: Response<FormatResponseObjectType<{}, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Check if user logged in
	if (req.isUnauthenticated() || !req?.user) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	// Attempt to retrieve a cart from the database for logged in user,
	// and if there was an error, return the error and end the request
	const [cartError, cart] = await to(Cart.findOne({ user: req.user._id }).session(session));
	if (cartError || !cart) {
		handleTransactionError(session);
		return next(cartError);
	}

	// Get the cart items from the cart
	const cartItemsIds = [...(cart?.items || [])].map((item) => item?._id || item);
	const [deleteCartItemsError] = await to(
		CartItem.deleteMany({ _id: { $in: cartItemsIds } }).session(session)
	);
	if (deleteCartItemsError) {
		handleTransactionError(session);
		return next(deleteCartItemsError);
	}

	// Attempt to delete the cart from the database, and if there was an error,
	// return the error and end the request
	const [deleteCartError] = await to(Cart.deleteOne({ _id: cart._id }).session(session));
	if (deleteCartError) {
		handleTransactionError(session);
		return next(deleteCartError);
	}

	// Commit the transaction
	await session.commitTransaction();
	session.endSession();

	// Set a flash message to indicate that the cart was cleared successfully,
	// and return the empty object in the response
	req.flash("success", "Cart cleared successfully.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: {} },
			flashes: req.flash(),
		})
	);
};

export const getShippingMethods = async (
	req: Request<
		{},
		FormatResponseObjectType<IShippingMethodDocument[], HttpStatus["OK"]>,
		{},
		{ address: string }
	>,
	res: Response<FormatResponseObjectType<IShippingMethodDocument[], HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Check if user logged in
	if (req.isUnauthenticated() || !req?.user) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	// Retrieve the address id from the request query params
	const { address: addressIdentifier } = req.query;

	// Attempt to retrieve an address from the database for logged in user,
	// and if there was an error, return the error and end the request
	const [addressError, address] = await to(
		Address.findOne({ _id: addressIdentifier, user: req.user._id })
	);
	if (addressError || !address)
		return next(addressError || new Error("No Shipping methods available."));

	// Attempt to retrieve a zone from the database for the address,
	// and if there was an error, return the error and end the request
	const [zoneError, zone] = await to(
		Zone.findOne({
			...(address.country && {
				countries: { $in: [address.country?._id || address.country] },
			}),
			...(address.state && { states: { $in: [address.state?._id || address.state] } }),
			...(address.city && { cities: { $in: [address.city?._id || address.city] } }),
		})
	);
	if (zoneError || !zone) return next(zoneError || new Error("No Shipping methods available."));

	// Attempt to retrieve shipping methods from the database for the zone,
	// and if there was an error, return the error and end the request
	const [shippingMethodsError, shippingMethods] = await to(
		ShippingMethod.find({ zone: zone._id })
	);
	if (shippingMethodsError) return next(shippingMethodsError);

	// Return the shipping methods data in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: shippingMethods },
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Updates the shipping method of the user's cart.
 * @description This function retrieves a shipping method and a cart for the currently logged-in user,
 * updates the cart with the new shipping method, and saves the updated cart to the database.
 * If the user is not authenticated, it returns a 401 error. If the shipping method or cart are not found,
 * or if there is an error during the database operations, it returns the respective error.
 *
 * @param {Request} req - Express request object containing the shipping method ID in the body.
 * @param {Object} req.user - The currently logged-in user object.
 * @param {Response} res - Express response object.
 * @param {NextFunction} next - Express next middleware function to handle errors.
 *
 * @returns {void} 200 - Success response with the updated cart data.
 * @property {Object} res.body.data - The updated cart object.
 * @throws {Error} 401 - Returns an error if the user is not authenticated.
 * @throws {Error} - Returns an error if the shipping method or cart are not found,
 * or if there is an issue during the database operations.
 */
export const postShippingMethod = async (
	req: Request<
		{},
		FormatResponseObjectType<ICartDocument, HttpStatus["OK"]>,
		{ shippingMethod: string }
	>,
	res: Response<FormatResponseObjectType<ICartDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Check if user logged in
	if (req.isUnauthenticated() || !req?.user) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	// Retrieve the shipping method id from the request body
	const { shippingMethod: shippingMethodIdentifier } = req.body;

	// Attempt to retrieve shipping methods from the database,
	// and if there was an error, return the error and end the request
	const [shippingMethodError, shippingMethod] = await to(
		ShippingMethod.findOne({ _id: shippingMethodIdentifier })
	);
	if (shippingMethodError || !shippingMethod) return next(shippingMethodError);

	// Attempt to retrieve a cart from the database for logged in user,
	// and if there was an error, return the error and end the request
	const [cartError, cart] = await to(Cart.findOne({ user: req.user._id }));
	if (cartError || !cart) return next(cartError);

	// Merge the old cart data with the new cart shipping methods
	const newCart = Object.assign(cart, { shippingMethod: shippingMethod._id });

	// Save the updated cart object to the database, and if there is an error during saving,
	// pass the error to the next middleware
	const [saveCartError, updatedCart] = await to(newCart.save());
	if (saveCartError) return next(saveCartError);

	// Set a flash message to indicate that the cart was updated successfully,
	// and return the updated object in the response
	req.flash("success", "Cart updated successfully.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: updatedCart },
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Retrieves a list of all payment methods.
 * @description This function checks if the user is authenticated and then
 * retrieves all available payment methods from the database. If the user is
 * not authenticated, it returns a 401 error. If there is an error during the
 * database retrieval, it passes the error to the next middleware.
 *
 * @param {Request} req - Express request object.
 * @param {Response} res - Express response object.
 * @param {NextFunction} next - Express next middleware function to handle errors.
 *
 * @returns {void} 200 - Success response with a list of payment methods.
 * @property {Object} res.body.data - The list of payment methods.
 * @throws {Error} 401 - Returns an error if the user is not authenticated.
 * @throws {Error} - Returns an error if there is an issue during the database operations.
 */
export const getPaymentMethods = async (
	req: Request<{}, FormatResponseObjectType<IPaymentMethodDocument[], HttpStatus["OK"]>, {}>,
	res: Response<FormatResponseObjectType<IPaymentMethodDocument[], HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Check if user logged in
	if (req.isUnauthenticated() || !req?.user) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	// Attempt to retrieve payment methods from the database for the zone,
	// and if there was an error, return the error and end the request
	const [paymentMethodsError, paymentMethods] = await to(PaymentMethod.find({}));
	if (paymentMethodsError) return next(paymentMethodsError);

	// Return the payment methods data in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: paymentMethods },
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Updates the payment method of the user's cart.
 * @description This function retrieves a payment method and a cart for the currently logged-in user,
 * updates the cart with the new payment method, and saves the updated cart to the database.
 * If the user is not authenticated, it returns a 401 error. If the payment method or cart are not found,
 * or if there is an error during the database operations, it returns the respective error.
 *
 * @param {Request} req - Express request object containing the payment method ID in the body.
 * @param {Object} req.user - The currently logged-in user object.
 * @param {Response} res - Express response object.
 * @param {NextFunction} next - Express next middleware function to handle errors.
 *
 * @returns {void} 200 - Success response with the updated cart data.
 * @property {Object} res.body.data - The updated cart object.
 * @throws {Error} 401 - Returns an error if the user is not authenticated.
 * @throws {Error} - Returns an error if the payment method or cart are not found,
 * or if there is an issue during the database operations.
 */
export const postPaymentMethod = async (
	req: Request<
		{},
		FormatResponseObjectType<ICartDocument, HttpStatus["OK"]>,
		{ paymentMethod: string }
	>,
	res: Response<FormatResponseObjectType<ICartDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Check if user logged in
	if (req.isUnauthenticated() || !req?.user) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	// Retrieve the payment method id from the request body
	const { paymentMethod: paymentMethodIdentifier } = req.body;

	// Attempt to retrieve payment methods from the database,
	// and if there was an error, return the error and end the request
	const [paymentMethodError, paymentMethod] = await to(
		PaymentMethod.findOne({ _id: paymentMethodIdentifier })
	);
	if (paymentMethodError || !paymentMethod) return next(paymentMethodError);

	// Attempt to retrieve a cart from the database for logged in user,
	// and if there was an error, return the error and end the request
	const [cartError, cart] = await to(Cart.findOne({ user: req.user._id }));
	if (cartError || !cart) return next(cartError);

	// Merge the old cart data with the new cart payment methods
	const newCart = Object.assign(cart, { paymentMethod: paymentMethod._id });

	// Save the updated cart object to the database, and if there is an error during saving,
	// pass the error to the next middleware
	const [saveCartError, updatedCart] = await to(newCart.save());
	if (saveCartError) return next(saveCartError);

	// Set a flash message to indicate that the cart was updated successfully,
	// and return the updated object in the response
	req.flash("success", "Cart updated successfully.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: updatedCart },
			flashes: req.flash(),
		})
	);
};
