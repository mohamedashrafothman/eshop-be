import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body, ValidationChain } from "express-validator";
import createError from "http-errors";
import httpStatus, { HttpStatus } from "http-status";
import mongoose, { ClientSession, PaginateOptions } from "mongoose";
import IOrderItem from "../interfaces/OrderItem.interface";
import Address from "../models/Address";
import Cart from "../models/Cart";
import { ICartItemDocument } from "../models/CartItem";
import Order, { IOrderDocument } from "../models/Order";
import OrderItem from "../models/OrderItem";
import PaymentMethod from "../models/PaymentMethod";
import Product, { IProductDocument } from "../models/Product";
import ShippingMethod from "../models/ShippingMethod";
import {
	formatResponseObject,
	type FormatResponseObjectType,
	handleTransactionError,
} from "../utils/helpers";
import vars from "../utils/vars";
import { _checkProductStock } from "./products";

/**
 * Validates the input fields based on the method provided.
 */
export const validator = (method: "create" | "update"): ValidationChain[] => {
	switch (method) {
		case "create":
			return [
				body("paymentMethod")
					.trim()
					.escape()
					.isMongoId()
					.withMessage("Invalid payment method id!")
					.notEmpty()
					.withMessage("You must supply a payment method id!"),
				body("address")
					.trim()
					.escape()
					.isMongoId()
					.withMessage("Invalid address id!")
					.notEmpty()
					.withMessage("You must supply a address id!"),
				body("shippingMethod")
					.trim()
					.escape()
					.isMongoId()
					.withMessage("Invalid shipping method id!")
					.notEmpty()
					.withMessage("You must supply a shipping method id!"),
			];
		case "update":
			return [];
		default:
			return [];
	}
};

export const postNewOrder = async (
	req: Request<
		{},
		FormatResponseObjectType<IOrderDocument, HttpStatus["CREATED"]>,
		{ paymentMethod: string; address: string; shippingMethod: string }
	>,
	res: Response<FormatResponseObjectType<IOrderDocument, HttpStatus["CREATED"]>>,
	next: NextFunction
): Promise<void> => {
	/**
	 * TODO:
	 * 01 - Receive order request with payment method id, address id, shipping methods id,
	 * 	    and ensure they are existed in the database before proceed [DONE].
	 * 02 - Retrieve user cart and cart items [DONE], and validate the cart exists and not empty [DONE],
	 *      check if the cart items are still available (stock levels) and ensure no items
	 *      have been updated since they were added to the cart (e.g., price changed or item
	 *      deleted by an admin) [DONE]. and consider locking the cart by adding "locked" flag to
	 *      the cart to prevent it from being modified during the order creation [DONE], and add
	 *      extra step in all cart update method to check if it's locked retrieved error message to
	 * 	    the user [DONE].
	 * 03 - Place cart items into order items table [DONE], validate quantities [DONE], calculate
	 *      items total [DONE], and validate it's availability and lock it's quantity for this order
	 *      to avoid over-selling (e.g., if someone else places an order at the same time) [DONE].
	 *      and If any item fails the validation (e.g., out of stock), the whole order process
	 *      should stop, and an error message should be returned [DONE].
	 * 04 - Apply discount, taxes and shipping charges while calculating the total price.
	 * 05 - Generate order short id.
	 * 06 - Save order data while using mongodb transaction to avoid partial order creation. This
	 * 	    is crucial to ensure that if any error occurs, the order process will fully rollback
	 * 	    and the cart will remain unaffected, with store an order status field with an initial
	 * 	    status like “Pending” or “Processing” to allow for easy updates as the order
	 * 	    progresses.
	 * 07 - Decrease order items stock quantity after the order is placed.
	 * 08 - Send Order Confirmation Email to the customer including order id, order summary,
	 * 	    shipping information, payment information, customer support info, and order status.
	 * 09 - Return success message.
	 */

	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	// Check if cart exists, and if there is an error or no cart is found,
	// pass the error to the next middleware
	const [cartError, cart] = await to(
		Cart.findOneAndUpdate({ user: req.user }, { $set: { locked: true } }, { new: true })
			.populate("items.product")
			.session(session)
	);
	if (cartError || !cart || cart.items.length === 0) {
		handleTransactionError(session);
		let error;
		if (!cart || cart.items.length === 0)
			error = createError(httpStatus.BAD_REQUEST, "Cart is Empty or does not exist!");
		return next(
			cartError ||
				((!cart || cart.items.length === 0) &&
					error && { ...(error || {}), status: error.status })
		);
	}

	console.log("cart: ", cart);

	// Destructure the request body to get paymentMethod, address, and shippingMethod data
	const { paymentMethod, address, shippingMethod } = req.body;

	// Check if payment method exists, and if there is an error or no payment method is found,
	// pass the error to the next middleware
	const [existsPaymentMethodError, existsPaymentMethod] = await to(
		PaymentMethod.findOne({ _id: paymentMethod }).session(session)
	);
	if (existsPaymentMethodError || !existsPaymentMethod) {
		handleTransactionError(session);
		return next(existsPaymentMethodError);
	}

	// Check if address exists, and if there is an error or no address is found,
	// pass the error to the next middleware
	const [existsAddressError, existsAddress] = await to(
		Address.findOne({ _id: address }).session(session)
	);
	if (existsAddressError || !existsAddress) {
		handleTransactionError(session);
		return next(existsAddressError);
	}

	// Check if shipping method exists, and if there is an error or no shipping method is found,
	// pass the error to the next middleware
	const [existsShippingMethodError, existsShippingMethod] = await to(
		ShippingMethod.findOne({ _id: shippingMethod }).session(session)
	);
	if (existsShippingMethodError || !existsShippingMethod) {
		handleTransactionError(session);
		return next(existsShippingMethodError);
	}

	let orderItems: Pick<
		IOrderItem,
		"product" | "name" | "category" | "color" | "size" | "quantity"
	>[] = [];

	// Loop through each cart item to check availability and price consistency
	cart.items.forEach(async (item) => {
		const cartSingleItem = item as ICartItemDocument;
		const product = cartSingleItem.product as unknown as Omit<
			IProductDocument,
			"colors" | "sizes" | "_id"
		> & {
			_id: string;
			color: { name: string; value: string };
			size: (typeof vars.products.sizes)[number];
		};

		// Check if the product is out of stock
		const noStockError = _checkProductStock(product?.toJSON(), cartSingleItem.quantity);
		if (noStockError) {
			handleTransactionError(session);
			return next({ ...(noStockError || {}), status: noStockError.status });
		}

		// Check if the product price has been updated since it was added to the cart.
		const productPrice: number = product.price.sale || product.price.normal;
		if (productPrice !== cartSingleItem.price) {
			handleTransactionError(session);
			const error = createError(
				httpStatus.BAD_REQUEST,
				`Product '${product.name}' price has been updated since it was added to the cart!`
			);
			return next({ ...(error || {}), status: error.status });
		}

		// Add product to order items
		orderItems = [
			...(orderItems || []),
			{
				product: product._id,
				name: product.name,
				category: (product.category?._id || product.category)?.toString(),
				color: product.color,
				size: product.size,
				quantity: cartSingleItem.quantity,
			},
		];

		// Update the product quantity
		const [updateProductError] = await to(
			Product.findOneAndUpdate(
				{ _id: product._id, quantity: { $gte: cartSingleItem.quantity } },
				{ $inc: { quantity: -cartSingleItem.quantity } },
				{ session }
			)
		);
		if (updateProductError) {
			handleTransactionError(session);
			return next(updateProductError);
		}
	});

	// Create order items
	const [createdOrderItemsError, createdOrderItems] = await to(
		OrderItem.create(orderItems, { session })
	);
	if (createdOrderItemsError) {
		handleTransactionError(session);
		return next(createdOrderItemsError);
	}
};

/**
 * Retrieves a paginated list of orders.
 * @description Fetches orders based on query parameters. Supports filtering by name, code,
 * status, and deletion status. Also includes pagination and sorting options. If the user is an
 * admin or super admin, deleted orders can also be included in the results.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.query - The query parameters for filtering and pagination.
 * @param {String} [req.query.sort] - The field to sort by.
 * @param {Number} [req.query.page] - The page number to retrieve.
 * @param {Number} [req.query.limit] - The number of orders to retrieve per page.
 * @param {String} [req.query.offset] - The number of orders to skip.
 * @param {String} [req.query.pagination] - Enable or disable pagination.
 * @param {String} [req.query.q] - Search term for filtering orders by name or code.
 * @param {Boolean} [req.query.deleted] - Flag to include deleted orders.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with paginated orders and metadata.
 *   * @property {Array} entities.data - List of retrieved order objects.
 *   * @property {Object} entities.meta.pagination - Pagination metadata (total docs, page, etc.).
 *   * @property {Array} entities.meta.sort - Available sort options for the orders.
 * @throws {Error} 500 - Returns an error if the order retrieval fails.
 */
export const getOrders = async (
	req: Request<
		{},
		FormatResponseObjectType<IOrderDocument, HttpStatus["OK"]>,
		{},
		Pick<PaginateOptions, "sort" | "page" | "limit" | "offset" | "pagination"> & {
			q?: string;
			deleted?: boolean | number;
		}
	>,
	res: Response<FormatResponseObjectType<IOrderDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Check if user logged in
	if (req.isUnauthenticated() || !req.user) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	// Destructure the query parameters (req.query) into
	// q (search term), deleted (include deleted countries), and query (pagination & sorting options)
	const { q, deleted } = req.query || {};

	// Check if the query includes a deleted flag
	const isFilterByDeletedAllowed: boolean =
		"deleted" in req.query &&
		[vars.auth.roles.superAdmin, vars.auth.roles.admin].includes(req.user.role);

	// Check if the authenticated user has permission to filter by their own orders
	const isFilterByAuthenticatedUserAllowed: boolean = [vars.auth.roles.user].includes(
		req.user.role
	);

	// List of fields to search for the query term
	const querySearchFields: string[] = [
		"shortId",
		"status",
		"user.name",
		"user.email",
		"address.country.name",
		"address.country.code",
		"address.city.name",
		"address.city.code",
		"address.state.name",
		"address.state.code",
	];

	// List of sort options
	const sort: { name: string; value: object }[] = [
		{ name: "Created Date Ascending", value: { createdAt: 1 } },
		{ name: "Created Date Descending", value: { createdAt: -1 } },
	];

	// Attempt to retrieve the orders using the given query and pagination options,
	// and if there was an error, return the error and end the request
	const [paginatedOrdersError, paginatedOrders] = await to(
		Order.paginate<IOrderDocument>(
			{
				// If the query includes a search term, filter orders by name or code
				...((q && {
					$or: querySearchFields.map((item) => ({
						[item]: { $regex: String(q).toLowerCase() || "", $options: "i" },
					})),
				}) ||
					{}),
				// If the query includes a deleted flag, include deleted orders
				...((isFilterByDeletedAllowed && { deleted: Boolean(deleted) }) || {}),
				// If the user is authenticated, filter by user
				...((isFilterByAuthenticatedUserAllowed && { user: req.user._id }) || {}),
			},
			{
				...("sort" in req.query && { sort: req.query.sort }),
				...("page" in req.query && { page: req.query.page }),
				...("limit" in req.query && { limit: req.query.limit }),
				...("offset" in req.query && { offset: req.query.offset }),
				...("pagination" in req.query && { pagination: req.query.pagination }),
			}
		)
	);
	if (paginatedOrdersError) return next(paginatedOrdersError);

	// Destructure the paginated orders into the list of orders (docs) and pagination metadata
	const { docs, ...pagination } = paginatedOrders;

	// Return the list of orders, pagination metadata, and sort options in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: {
				data: [...(docs || [])],
				meta: { pagination, sort },
			},
		})
	);
};

/**
 * @summary Retrieves a single order by its ID.
 * @description Attempts to retrieve a single order by its ID from the database.
 * If the user is not authenticated or does not have permission,
 * and pass the error to the next middleware.
 *
 * @param {Object} req - Express request object containing the user details.
 * @param {String} req.params.order - The ID of the order to retrieve.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with the order data.
 *   * @property {Object} entities.data - The retrieved order.
 * @throws {Error} 401 - Returns an error if the user is not authenticated.
 * @throws {Error} 404 - Returns an error if no order is found with the provided identifier.
 * @throws {Error} 500 - Returns an error if the order retrieval fails.
 */
export const getSingleOrder = async (
	req: Request<{ order: string }, FormatResponseObjectType<IOrderDocument, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<IOrderDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Check if user logged in
	if (req.isUnauthenticated() || !req.user) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	// Retrieve the order ID from the request parameters
	const { order: orderIdentifier } = req.params || {};

	// Attempt to retrieve a order from the database with the given ID,
	// and if there was an error or no order was found, return the error and end the request
	const [orderError, order] = await to(
		Order.findOne({
			_id: orderIdentifier,
			...([vars.auth.roles.user].includes(req.user.role) && { user: req.user._id }),
		})
	);
	if (orderError || !order) return next(orderError);

	// Return the retrieved order in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, entities: { data: order } })
	);
};

export const updateSingleOrder = async (
	req: Request,
	res: Response,
	next: NextFunction
): Promise<void> => {};

/**
 * @summary Deletes a single order by its ID.
 * @description This method deletes a single order by its ID from the database.
 * The method handles errors and returns a success response when the deletion is successful.
 *
 * @param {Object} req - Express request object.
 * @param {String} req.params.order - The ID of the order to delete.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response indicating the order was deleted.
 * @throws {Error} 404 - If no order is found with the provided identifier.
 * @throws {Error} 500 - If an error occurs during the deletion process.
 */
export const deleteSingleOrder = async (
	req: Request<{ order: string }, FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Check if user logged in
	if (req.isUnauthenticated() || !req.user) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	// Extract the order identifier from request parameters
	const { order: orderIdentifier } = req.params || {};

	// Attempt to find the order by its ID, and if there is an error or no order is found,
	// pass the error to the next middleware
	const [orderError, order] = await to(Order.findOne({ _id: orderIdentifier }));
	if (orderError || !order) return next(orderError);

	// Attempt to soft-delete the found order, and if there is an error during the deletion,
	// pass the error to the next middleware
	const [deleteOrderError] = await to(Order.deleteById(order._id, req.user._id));
	if (deleteOrderError) return next(deleteOrderError);

	// Flash success message and respond with success status
	req.flash("success", "Successfully Deleted.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};

/**
 * @summary Restores a single order by its ID.
 * @description This method restores an order that was previously soft-deleted from the database.
 * The method handles errors and returns a success response when the order is successfully restored.
 *
 * @param {Object} req - Express request object.
 * @param {String} req.params.order - The ID of the order to restore.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {void} 200 - Success response with a success message.
 * @throws {Error} 404 - If no order is found with the provided identifier.
 * @throws {Error} 500 - If an error occurs during the restoration process.
 */
export const restoreSingleOrder = async (
	req: Request<{ order: string }, FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Extract the order identifier from request parameters
	const { order: orderIdentifier } = req.params || {};

	// Create a query to find the order by its ID
	const singleOrderQuery = {
		_id: orderIdentifier,
		deleted: true, // only find soft-deleted countries
	};

	// Attempt to find the order by its ID, and if there is an error or no order is found,
	// pass the error to the next middleware
	const [orderError, order] = await to(Order.findOneWithDeleted(singleOrderQuery));
	if (orderError || !order) return next(orderError);

	// Attempt to restore the found order, and if there is an error during the restoration,
	// pass the error to the next middleware
	const [restoreOrderError] = await to(Order.restore(singleOrderQuery));
	if (restoreOrderError) return next(restoreOrderError);

	// Flash success message and respond with success status
	req.flash("success", "Successfully Restored.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};
