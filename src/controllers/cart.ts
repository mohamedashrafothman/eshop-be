import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body, ValidationChain } from "express-validator";
import createError, { HttpError } from "http-errors";
import httpStatus, { HttpStatus } from "http-status";
import mongoose, { ClientSession } from "mongoose";
import Cart, { ICartDocument } from "../models/Cart";
import CartItem, { ICartItemDocument } from "../models/CartItem";
import Coupon from "../models/Coupon";
import PaymentMethod from "../models/PaymentMethod";
import Product, { IProductDocument } from "../models/Product";
import ShippingMethod from "../models/ShippingMethod";
import Tax from "../models/Tax";
import {
	formatResponseObject,
	FormatResponseObjectType,
	handleTransactionError,
} from "../utils/helpers";
import { _checkProductStock } from "./products";

/**
 * Validates the input fields based on the method provided.
 */
export const validator = (
	method: "create" | "update" | "set-shipping" | "set-payment" | "set-coupon"
): ValidationChain[] => {
	switch (method) {
		case "create":
			return [
				body("product")
					.trim()
					.escape()
					.isMongoId()
					.withMessage("Invalid product id!")
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
		case "set-coupon":
			return [
				body("coupon")
					.trim()
					.escape()
					.isString()
					.withMessage("coupon must be a string!")
					.notEmpty()
					.withMessage("You must supply a coupon!"),
			];
		default:
			return [];
	}
};

/**
 * @summary Checks if the product price has changed since the item was added to the cart.
 * @param {IProductDocument} product - Current product data from the database.
 * @param {number} cartItemPrice - Price of the item when it was added to the cart.
 * @returns {HttpError|null} - Returns an error if the price has changed; otherwise, null.
 */
export const _checkProductPriceChange = (
	product: Partial<IProductDocument>,
	cartItemPrice: number = 0
): HttpError | null => {
	// Get the current product price
	const currentProductPrice: number = product.price?.sale || product.price?.normal || 0;

	// Check if the product price has changed
	if (currentProductPrice !== cartItemPrice)
		return createError(
			httpStatus.BAD_REQUEST,
			`Product '${product.name}' price has been updated since it was added to the cart!`
		);

	// No error
	return null;
};

/**
 * @openapi
 * /v1/cart:
 *   post:
 *     summary: Adds a product to the cart.
 *     description: Adds a product to the user's cart. If the cart doesn't exist, it creates one.
 *     tags:
 *       - Cart
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
 *               - quantity
 *               - color
 *               - size
 *             properties:
 *               product:
 *                 type: string
 *                 description: Product ID
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *               color:
 *                 type: string
 *               size:
 *                 type: string
 *     responses:
 *       "201":
 *         description: Product added to cart successfully.
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
 *                           $ref: '#/components/schemas/Cart'
 *                     flashes:
 *                       $ref: '#/components/schemas/Flash'
 *       "401":
 *         description: Unauthorized.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       "404":
 *         description: Product not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       "500":
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
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
	if (req.isUnauthenticated() || !req.user) {
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
						items: cartItem?.map((item) => item?._id || item),
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

	// Check if cart is locked.
	if (cart.locked) {
		handleTransactionError(session);
		const error = createError(httpStatus.BAD_REQUEST, "Cart is locked!");
		return next({ ...(error || {}), status: error.status });
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
 * @openapi
 * /v1/cart:
 *   get:
 *     summary: Retrieves the user's cart.
 *     description: Fetches the current cart for the logged-in user.
 *     tags:
 *       - Cart
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "200":
 *         description: Cart details.
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
 *                           $ref: '#/components/schemas/Cart'
 *                     flashes:
 *                       $ref: '#/components/schemas/Flash'
 *       "401":
 *         description: Unauthorized.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       "500":
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const getSingleCart = async (
	req: Request<{}, FormatResponseObjectType<ICartDocument | {}, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<ICartDocument | {}, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Check if user logged in
	if (req.isUnauthenticated() || !req.user) {
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
 * @openapi
 * /v1/cart/items/{cartItem}:
 *   delete:
 *     summary: Removes an item from the cart.
 *     description: Deletes a specific item from the user's cart.
 *     tags:
 *       - Cart
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cartItem
 *         required: true
 *         schema:
 *           type: string
 *         description: Cart Item ID.
 *     responses:
 *       "200":
 *         description: Item removed successfully.
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
 *                           $ref: '#/components/schemas/Cart'
 *                     flashes:
 *                       $ref: '#/components/schemas/Flash'
 *       "401":
 *         description: Unauthorized.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       "404":
 *         description: Cart item not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       "500":
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
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
	if (req.isUnauthenticated() || !req.user) {
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

	// Check if cart is locked.
	if (cart.locked) {
		handleTransactionError(session);
		const error = createError(httpStatus.BAD_REQUEST, "Cart is locked!");
		return next({ ...(error || {}), status: error.status });
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
 * @openapi
 * /v1/cart/items/{cartItem}:
 *   patch:
 *     summary: Updates cart item quantity.
 *     description: Updates the quantity of a specific item in the cart.
 *     tags:
 *       - Cart
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cartItem
 *         required: true
 *         schema:
 *           type: string
 *         description: Cart Item ID.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - quantity
 *             properties:
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *     responses:
 *       "200":
 *         description: Cart item updated successfully.
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
 *                           $ref: '#/components/schemas/Cart'
 *                     flashes:
 *                       $ref: '#/components/schemas/Flash'
 *       "401":
 *         description: Unauthorized.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       "404":
 *         description: Cart item not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       "500":
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
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
	if (req.isUnauthenticated() || !req.user) {
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
		CartItem.findOne({ _id: cartItemIdentifier }).populate({ path: "product" }).session(session)
	);
	if (cartItemError || !cartItem) {
		handleTransactionError(session);
		return next(cartItemError);
	}

	// Attempt to retrieve a cart from the database for logged in user,
	// and if there was an error, return the error and end the request
	const [cartError, cart] = await to(
		Cart.findOne({ user: req.user._id }).populate({ path: "items" }).session(session)
	);
	if (cartError || !cart) {
		handleTransactionError(session);
		return next(cartError);
	}

	// Check if cart is locked.
	if (cart.locked) {
		handleTransactionError(session);
		const error = createError(httpStatus.BAD_REQUEST, "Cart is locked!");
		return next({ ...(error || {}), status: error.status });
	}

	// Get product data from the cart item
	const product = cartItem.product as IProductDocument;
	// Merge the old cart item data with the new cart item quantity
	const newCartItem = Object.assign(cartItem, { quantity });
	// Get the cart items from the cart
	let cartItems = [...(cart.items?.map((item) => item?._id?.toString()) || [])] as string[];
	// Find the index of the cart item in the cart items array
	const itemIndex = cartItems.indexOf(cartItem._id.toString());

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
 * @openapi
 * /v1/cart:
 *   delete:
 *     summary: Empties the cart.
 *     description: Removes all items from the user's cart.
 *     tags:
 *       - Cart
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "200":
 *         description: Cart cleared successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     flashes:
 *                       $ref: '#/components/schemas/Flash'
 *       "401":
 *         description: Unauthorized.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       "500":
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const emptyCart = async (
	req: Request<{}, FormatResponseObjectType<{}, HttpStatus["OK"]>, {}>,
	res: Response<FormatResponseObjectType<{}, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Check if user logged in
	if (req.isUnauthenticated() || !req.user) {
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

	// Check if cart is locked.
	if (cart.locked) {
		handleTransactionError(session);
		const error = createError(httpStatus.BAD_REQUEST, "Cart is locked!");
		return next({ ...(error || {}), status: error.status });
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

/**
 * @openapi
 * /v1/cart/shipping-methods:
 *   post:
 *     summary: Sets shipping method.
 *     description: Updates the cart with a selected shipping method.
 *     tags:
 *       - Cart
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - shippingMethod
 *             properties:
 *               shippingMethod:
 *                 type: string
 *                 description: Shipping Method ID
 *     responses:
 *       "200":
 *         description: Shipping method updated successfully.
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
 *                           $ref: '#/components/schemas/Cart'
 *                     flashes:
 *                       $ref: '#/components/schemas/Flash'
 *       "401":
 *         description: Unauthorized.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       "404":
 *         description: Shipping method not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       "500":
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
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
	if (req.isUnauthenticated() || !req.user) {
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

	// Check if cart is locked.
	if (cart.locked) {
		const error = createError(httpStatus.BAD_REQUEST, "Cart is locked!");
		return next({ ...(error || {}), status: error.status });
	}

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
 * @openapi
 * /v1/cart/payment-methods:
 *   post:
 *     summary: Sets payment method.
 *     description: Updates the cart with a selected payment method.
 *     tags:
 *       - Cart
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - paymentMethod
 *             properties:
 *               paymentMethod:
 *                 type: string
 *                 description: Payment Method ID
 *     responses:
 *       "200":
 *         description: Payment method updated successfully.
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
 *                           $ref: '#/components/schemas/Cart'
 *                     flashes:
 *                       $ref: '#/components/schemas/Flash'
 *       "401":
 *         description: Unauthorized.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       "404":
 *         description: Payment method not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       "500":
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
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
	if (req.isUnauthenticated() || !req.user) {
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

	// Check if cart is locked.
	if (cart.locked) {
		const error = createError(httpStatus.BAD_REQUEST, "Cart is locked!");
		return next({ ...(error || {}), status: error.status });
	}

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

/**
 * @openapi
 * /v1/cart/coupons:
 *   post:
 *     summary: Applies a coupon.
 *     description: Applies a coupon code to the cart.
 *     tags:
 *       - Cart
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - coupon
 *             properties:
 *               coupon:
 *                 type: string
 *                 description: Coupon code
 *     responses:
 *       "200":
 *         description: Coupon applied successfully.
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
 *                           $ref: '#/components/schemas/Cart'
 *                     flashes:
 *                       $ref: '#/components/schemas/Flash'
 *       "401":
 *         description: Unauthorized.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       "404":
 *         description: Coupon not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       "500":
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const postCoupon = async (
	req: Request<{}, FormatResponseObjectType<ICartDocument, HttpStatus["OK"]>, { coupon: string }>,
	res: Response<FormatResponseObjectType<ICartDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Check if user logged in
	if (req.isUnauthenticated() || !req.user) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	// Retrieve the coupon id from the request body
	const { coupon: couponIdentifier } = req.body;

	// Attempt to retrieve coupon from the database,
	// and if there was an error, return the error and end the request
	const [couponError, coupon] = await to(Coupon.findOne({ code: couponIdentifier }));
	if (couponError || !coupon) return next(couponError);

	// Attempt to retrieve a cart from the database for logged in user,
	// and if there was an error, return the error and end the request
	const [cartError, cart] = await to(Cart.findOne({ user: req.user._id }));
	if (cartError || !cart) return next(cartError);

	// Check if cart is locked.
	if (cart.locked) {
		const error = createError(httpStatus.BAD_REQUEST, "Cart is locked!");
		return next({ ...(error || {}), status: error.status });
	}

	// Merge the old cart data with the new cart coupon
	const newCart = Object.assign(cart, { coupon: coupon._id });

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
 * @openapi
 * /v1/cart/coupons:
 *   delete:
 *     summary: Removes a coupon.
 *     description: Removes the applied coupon from the cart.
 *     tags:
 *       - Cart
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "200":
 *         description: Coupon removed successfully.
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
 *                           $ref: '#/components/schemas/Cart'
 *                     flashes:
 *                       $ref: '#/components/schemas/Flash'
 *       "401":
 *         description: Unauthorized.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       "500":
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const removeCoupon = async (
	req: Request<{}, FormatResponseObjectType<ICartDocument, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<ICartDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Check if user logged in
	if (req.isUnauthenticated() || !req.user) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	// Attempt to retrieve a cart from the database for logged in user,
	// and if there was an error, return the error and end the request
	const [cartError, cart] = await to(Cart.findOne({ user: req.user._id }));
	if (cartError || !cart) return next(cartError);

	// Check if cart is locked.
	if (cart.locked) {
		const error = createError(httpStatus.BAD_REQUEST, "Cart is locked!");
		return next({ ...(error || {}), status: error.status });
	}

	// Merge the old cart data with the new cart coupon
	const newCart: ICartDocument = Object.assign(cart, { coupon: undefined });

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
