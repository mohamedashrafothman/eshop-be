import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body, query, ValidationChain } from "express-validator";
import createError, { HttpError } from "http-errors";
import httpStatus from "http-status";
import mongoose from "mongoose";
import Address from "../models/Address";
import Cart, { ICartDocument } from "../models/Cart";
import CartItem, { ICartItemDocument } from "../models/CartItem";
import Product, { IProductDocument } from "../models/Product";
import ShippingMethod from "../models/ShippingMethod";
import Tax from "../models/Tax";
import Zone from "../models/Zone";
import { formatResponseObject, handleTransactionError } from "../utils/helpers";

/**
 * Validates the input fields based on the method provided.
 */
export const validator = (
	method: "create" | "update" | "get-shipping" | "set-shipping"
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
	// check if product has quantity
	if (typeof product.quantity !== "number" || !Object.keys(product).includes("quantity"))
		return createError(httpStatus.INTERNAL_SERVER_ERROR, "passed product has no quantity");

	// check if product is out of stock
	if (product.quantity === 0)
		return createError(httpStatus.BAD_REQUEST, "Product is out of stock");

	// check if there's enough product quantity in the stock
	if (product.quantity - quantity < 0)
		return createError(
			httpStatus.BAD_REQUEST,
			"There're no enough product quantity in the stock"
		);

	// no error
	return null;
};

/**
 * @summary Adds a product to the user's shopping cart.
 * @description This method adds a product to the user's cart or creates a new cart if one does not exist.
 * It handles product stock validation, cart item creation or update, and applies applicable taxes based on
 * product categories or global tax rules. The method performs all operations within a transaction to ensure
 * data integrity.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.body - Request body containing product details.
 * @param {String} req.body.product - The product ID to add to the cart.
 * @param {Number} req.body.quantity - The quantity of the product to add.
 * @param {String} req.body.color - The color of the product.
 * @param {String} req.body.size - The size of the product.
 * @param {Object} req.user - The currently logged-in user object.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {void} 201 - Success response with the updated or created cart.
 * @throws {Error} 400 - If the product is out of stock or if the requested product, size, or color is invalid.
 * @throws {Error} 401 - If the user is not logged in.
 * @throws {Error} 500 - If any database operation fails during the transaction.
 */
export const addToCart = async (req: Request, res: Response, next: NextFunction) => {
	// check if user logged in
	if (!req.user) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	// Start a transaction to ensure data integrity
	const session = await mongoose.startSession();
	session.startTransaction();

	const { product, quantity, color, size } = req.body;

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

	// check if cart exists
	let carts: ICartDocument[] | undefined;
	let cartsError: Error | null;
	[cartsError, carts] = await to(Cart.find({ user: req.user._id }).session(session));
	if (cartsError) {
		handleTransactionError(session);
		return next(cartsError);
	}

	// handle no cart
	if (!carts || !carts.length) {
		const noStockError = _checkProductStock(existsProduct?.toJSON(), quantity);
		if (noStockError) {
			handleTransactionError(session);
			return next({ ...(noStockError || {}), status: noStockError.status });
		}

		// create cart item
		const [cartItemError, cartItem] = await to(
			CartItem.create([{ product, color, size, quantity }], { session })
		);
		if (cartItemError || !cartItem) {
			handleTransactionError(session);
			return next(cartItemError);
		}

		// get cart taxes
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

		// create cart
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

		// commit the transaction
		await session.commitTransaction();
		session.endSession();

		req.flash("success", "Product added to cart successfully.");
		return res.status(httpStatus.CREATED).json(
			formatResponseObject({
				status: httpStatus.CREATED,
				entities: { data: newCart[0].toJSON() },
				flashes: req.flash(),
			})
		);
	}

	let cart = carts?.[0] as ICartDocument;
	let items = [...(cart?.items || [])] as ICartDocument["items"];
	const itemIndex = items.findIndex((item) => {
		const cartItem = item as ICartItemDocument;
		return (cartItem?.product?._id || cartItem?.product)?.toString() === product;
	});

	if (itemIndex > -1) {
		let cartItem = items[itemIndex] as ICartItemDocument;
		cartItem = Object.assign(cartItem, { quantity: cartItem.quantity + quantity });

		const noStockError = _checkProductStock(existsProduct?.toJSON(), cartItem.quantity);
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
		const noStockError = _checkProductStock(existsProduct?.toJSON(), quantity);
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

	cart = Object.assign(cart, {
		items,
		taxes: taxes?.map((tax) => tax?._id || tax),
	}) as ICartDocument;

	const [saveCartError] = await to(cart.save({ session }));
	if (saveCartError) {
		handleTransactionError(session);
		return next(saveCartError);
	}

	// commit the transaction
	await session.commitTransaction();
	session.endSession();

	req.flash("success", "Product added to cart successfully.");
	res.status(httpStatus.CREATED).json(
		formatResponseObject({
			status: httpStatus.CREATED,
			entities: { data: cart.toJSON() },
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Retrieves the current user's cart.
 * @description Fetches the cart associated with the currently logged-in user.
 * If no cart is found for the user, an empty object is returned. This method ensures
 * the user is authenticated before proceeding to retrieve the cart.
 *
 * @param {Object} req - Express request object containing user details.
 * @param {Object} req.user - The logged-in user object.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with the user's cart data.
 * @property {Object} res.body.data - The cart object, or an empty object if no cart exists for the user.
 * @throws {Error} 401 - Returns an error if the user is not authenticated.
 * @throws {Error} 500 - Returns an error if there is an issue retrieving the cart from the database.
 */
export const getSingleCart = async (req: Request, res: Response, next: NextFunction) => {
	// check if user logged in
	if (!req.user) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	// get cart for current logged in user
	const [cartError, cart] = await to(Cart.findOne({ user: req.user._id }));
	if (cartError) return next(cartError);

	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: { ...(cart?.toJSON() || {}) } },
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Removes a product from the user's shopping cart.
 * @description This method removes a specific cart item from the user's cart. If it is the last item,
 * the cart is deleted. It also handles reapplying applicable taxes to the cart if there are still items remaining.
 * The method ensures all operations are executed within a transaction to maintain data integrity.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.params - Request parameters containing the cartItem ID to be removed.
 * @param {String} req.params.cartItem - The ID of the cart item to remove.
 * @param {Object} req.user - The currently logged-in user object.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with the updated cart or an empty object if the cart is deleted.
 * @throws {Error} 400 - If the cart item is not found or the user does not have permission to modify the cart.
 * @throws {Error} 401 - If the user is not logged in.
 * @throws {Error} 500 - If any database operation fails during the transaction.
 */
export const removeItemFromCart = async (req: Request, res: Response, next: NextFunction) => {
	// check if user logged in
	if (!req.user) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	// Start a transaction to ensure data integrity
	const session = await mongoose.startSession();
	session.startTransaction();

	const { cartItem: cartItemId } = req.params;

	const [cartError, cart] = await to(Cart.findOne({ user: req.user._id }).session(session));
	if (cartError || !cart) {
		handleTransactionError(session);
		return next(cartError);
	}

	if (
		!cart?.items ||
		!cart?.items?.map((item) => (item?._id || item).toString())?.includes(cartItemId)
	) {
		handleTransactionError(session);
		return next();
	}

	const [cartItemError, cartItem] = await to(
		CartItem.findOne({ _id: cartItemId }).session(session)
	);
	if (cartItemError || !cartItem) {
		handleTransactionError(session);
		return next(cartItemError);
	}

	const [deleteCartItemError] = await to(
		CartItem.deleteOne({ _id: cartItem?._id }).session(session)
	);
	if (deleteCartItemError) {
		handleTransactionError(session);
		return next(deleteCartItemError);
	}

	const cartFilteredItems = cart?.items.filter(
		(item) => (item?._id || item).toString() !== cartItemId
	) as ICartItemDocument[];
	const isCartItemsEmpty = cartFilteredItems.length === 0;
	let newCart: ICartDocument | null = null;

	if (isCartItemsEmpty) {
		const [deleteCartError] = await to(Cart.deleteOne({ _id: cart._id }).session(session));
		if (deleteCartError) {
			handleTransactionError(session);
			return next(deleteCartError);
		}
	} else {
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
		newCart = Object.assign(cart, {
			items: cartFilteredItems?.map((item) => item?._id || item),
			taxes: taxes.map((tax) => tax?._id || tax),
		}) as ICartDocument;
		const [saveCartError] = await to(newCart.save({ session }));
		if (saveCartError) {
			handleTransactionError(session);
			return next(saveCartError);
		}
	}

	// commit the transaction
	await session.commitTransaction();
	session.endSession();

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
 * @summary Updates the quantity of a product in the user's cart.
 * @description Handles the update of a specific cart item's quantity for the logged-in user.
 * The method checks if the user is authenticated, verifies the existence of the cart item
 * and the product's stock, and updates the quantity of the cart item. If the cart item
 * exists in the cart, it is updated with the new quantity.
 *
 * @param {Object} req - Express request object containing parameters and user details.
 * @param {Object} req.user - The logged-in user object.
 * @param {String} req.params.cartItem - The ID of the cart item to update.
 * @param {Object} req.body.quantity - The new quantity for the cart item.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response indicating the cart was updated successfully.
 * @property {Object} res.body.data - The updated cart data.
 * @throws {Error} 401 - Returns an error if the user is not authenticated.
 * @throws {Error} 404 - Returns an error if the cart item or product does not exist.
 * @throws {Error} 400 - Returns an error if the product stock is insufficient or invalid data is provided.
 * @throws {Error} 500 - Returns an error if there is an issue during the database operations or transaction.
 */
export const updateCartItem = async (req: Request, res: Response, next: NextFunction) => {
	// check if user logged in
	if (!req.user) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	// Start a transaction to ensure data integrity
	const session = await mongoose.startSession();
	session.startTransaction();

	const { cartItem: cartItemId } = req.params;
	const { quantity } = req.body;

	const [cartItemError, cartItem] = await to(
		CartItem.findOne({ _id: cartItemId }).populate("product").session(session)
	);
	if (cartItemError || !cartItem) {
		handleTransactionError(session);
		return next(cartItemError);
	}

	const [cartError, cart] = await to(Cart.findOne({ user: req.user._id }).session(session));
	if (cartError || !cart) {
		handleTransactionError(session);
		return next(cartError);
	}

	const product = cartItem.product as IProductDocument;
	const newCartItem = Object.assign(cartItem, { quantity });
	let cartItems = [
		...(cart.items?.map((item) => (item?._id || item)?.toString()) || []),
	] as string[];
	const itemIndex = cartItems.indexOf(cartItem?._id?.toString() || cartItem?._id || "");

	const noStockError = _checkProductStock(product?.toJSON(), newCartItem.quantity);
	if (noStockError) {
		handleTransactionError(session);
		return next({ ...(noStockError || {}), status: noStockError.status });
	}

	const [saveCartItemError] = await to(newCartItem.save({ session }));
	if (saveCartItemError) {
		handleTransactionError(session);
		return next(saveCartItemError);
	}

	if (itemIndex <= -1) {
		handleTransactionError(session);
		return next();
	}

	cartItems = [
		...(cartItems.slice(0, itemIndex) || []),
		cartItem._id,
		...(cartItems.slice(itemIndex + 1) || []),
	] as string[];

	const newCart = Object.assign(cart, { items: cartItems }) as ICartDocument;

	const [saveCartError, updatedCart] = await to(newCart.save({ session }));
	if (saveCartError) {
		handleTransactionError(session);
		return next(saveCartError);
	}

	// commit the transaction
	await session.commitTransaction();
	session.endSession();

	req.flash("success", "Cart updated successfully.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: updatedCart.toJSON() },
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Empties the user's cart.
 * @description Clears all items from the cart of the currently logged-in user by deleting both
 * the cart items and the cart document itself. The method checks if the user is authenticated
 * and uses a transaction to ensure the atomicity of the deletion process.
 *
 * @param {Object} req - Express request object containing the logged-in user details.
 * @param {Object} req.user - The logged-in user object.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response indicating the cart was cleared successfully.
 * @property {Object} res.body.data - Empty object after the cart is cleared.
 * @throws {Error} 401 - Returns an error if the user is not authenticated.
 * @throws {Error} 404 - Returns an error if the cart or cart items are not found.
 * @throws {Error} 500 - Returns an error if there is an issue during the transaction or database operations.
 */
export const emptyCart = async (req: Request, res: Response, next: NextFunction) => {
	// check if user logged in
	if (!req.user) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	// Start a transaction to ensure data integrity
	const session = await mongoose.startSession();
	session.startTransaction();

	// get cart for current logged in user
	const [cartError, cart] = await to(Cart.findOne({ user: req.user._id }).session(session));
	if (cartError || !cart) {
		handleTransactionError(session);
		return next(cartError);
	}

	const cartItemsIds = [...(cart?.items || [])].map((item) => item?._id || item);
	const [deleteCartItemsError] = await to(
		CartItem.deleteMany({ _id: { $in: cartItemsIds } }).session(session)
	);
	if (deleteCartItemsError) {
		handleTransactionError(session);
		return next(deleteCartItemsError);
	}

	const [deleteCartError] = await to(Cart.deleteOne({ _id: cart._id }).session(session));
	if (deleteCartError) {
		handleTransactionError(session);
		return next(deleteCartError);
	}

	// commit the transaction
	await session.commitTransaction();
	session.endSession();

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
 * @summary Retrieves a list of shipping methods for the user's address.
 * @description Fetches a list of shipping methods available for the user's address.
 * The method checks if the user is authenticated, verifies the existence of the address and zone,
 * and retrieves the shipping methods associated with the zone. If the user is not authenticated,
 * or if the address, zone, or shipping methods are not found, an error is thrown.
 *
 * @param {Object} req - Express request object containing the address identifier.
 * @param {Object} req.user - The currently logged-in user object.
 * @param {Object} req.query.address - The ID of the address for which to retrieve shipping methods.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with a list of shipping methods.
 * @property {Object} res.body.data - A list of shipping methods associated with the zone.
 * @throws {Error} 401 - Returns an error if the user is not authenticated.
 * @throws {Error} 404 - Returns an error if the address, zone, or shipping methods are not found.
 * @throws {Error} 500 - Returns an error if there is an issue during the database operations.
 */
export const getShippingMethods = async (req: Request, res: Response, next: NextFunction) => {
	// check if user logged in
	if (!req.user) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	const { address: addressIdentifier } = req.query;

	const [addressError, address] = await to(
		Address.findOne({ _id: addressIdentifier, user: req.user._id })
	);
	if (addressError || !address)
		return next(addressError || new Error("No Shipping methods available."));

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

	const [shippingMethodsError, shippingMethods] = await to(
		ShippingMethod.find({ zone: zone._id })
	);
	if (shippingMethodsError) return next(shippingMethodsError);

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
 * @description This function takes the ID of a shipping method as a request body parameter,
 * retrieves the shipping method and cart of the currently logged-in user, and updates the
 * cart with the selected shipping method. If the user is not authenticated, it returns a 401
 * error. If the shipping method or cart are not found, it returns a 404 error. If there is an
 * issue during the database operations, it returns a 500 error.
 *
 * @param {Object} req - Express request object containing the shipping method ID.
 * @param {Object} req.user - The currently logged-in user object.
 * @param {Object} req.body.shippingMethod - The ID of the shipping method to update the cart with.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with the updated cart data.
 * @property {Object} res.body.data - The updated cart object.
 * @throws {Error} 401 - Returns an error if the user is not authenticated.
 * @throws {Error} 404 - Returns an error if the shipping method or cart are not found.
 * @throws {Error} 500 - Returns an error if there is an issue during the database operations.
 */
export const postShippingMethod = async (req: Request, res: Response, next: NextFunction) => {
	// check if user logged in
	if (!req.user) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	const { shippingMethod: shippingMethodIdentifier } = req.body;

	// get shipping method
	const [shippingMethodError, shippingMethod] = await to(
		ShippingMethod.findOne({ _id: shippingMethodIdentifier })
	);
	if (shippingMethodError || !shippingMethod) return next(shippingMethodError);

	// get cart for current logged in user
	const [cartError, cart] = await to(Cart.findOne({ user: req.user._id }));
	if (cartError || !cart) return next(cartError);

	// update cart
	const newCart = Object.assign(cart, { shippingMethod: shippingMethod._id });

	// save cart
	const [saveCartError, updatedCart] = await to(newCart.save());
	if (saveCartError) return next(saveCartError);

	req.flash("success", "Cart updated successfully.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: updatedCart.toJSON() },
			flashes: req.flash(),
		})
	);
};
