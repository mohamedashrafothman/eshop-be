import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body, ValidationChain } from "express-validator";
import createError from "http-errors";
import httpStatus, { HttpStatus } from "http-status";
import { ICityDocument } from "models/City";
import { ICountryDocument } from "models/Country";
import { IStateDocument } from "models/State";
import { ITaxDocument } from "models/Tax";
import { IZoneDocument } from "models/Zone";
import moment from "moment";
import mongoose, { ClientSession, PaginateOptions } from "mongoose";
import IOrder from "../interfaces/Order.interface";
import IOrderItem from "../interfaces/OrderItem.interface";
import IProduct from "../interfaces/Product.interface";
import Address, { IAddressDocument } from "../models/Address";
import Cart from "../models/Cart";
import { ICartItemDocument } from "../models/CartItem";
import Email from "../models/Email";
import Order, { IOrderDocument } from "../models/Order";
import OrderItem from "../models/OrderItem";
import PaymentMethod from "../models/PaymentMethod";
import Product, { IProductDocument } from "../models/Product";
import ShippingMethod, { IShippingMethodDocument } from "../models/ShippingMethod";
import emailService from "../services/email";
import {
	formatResponseObject,
	type FormatResponseObjectType,
	getShortUniqueId,
	handleTransactionError,
	type SortItemType,
} from "../utils/helpers";
import vars from "../utils/vars";
import { _checkProductPriceChange } from "./cart";
import { _checkProductStock } from "./products";

/**
 * Validates the input fields based on the method provided.
 */
export const validator = (method: "create" | "update" | "item/update"): ValidationChain[] => {
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
				body("note")
					.trim()
					.escape()
					.optional()
					.notEmpty()
					.withMessage("You must supply a note!")
					.isLength({ max: 1000 })
					.withMessage("Note must be at most 1000 characters long!"),
			];
		case "update":
			return [
				body("status")
					.trim()
					.escape()
					.optional()
					.notEmpty()
					.withMessage("You must supply a status!")
					.isString()
					.withMessage("Status must be a string!")
					.isIn(Object.values(vars.order.status))
					.withMessage("Invalid status value."),
				body("address")
					.trim()
					.escape()
					.optional()
					.isMongoId()
					.withMessage("Invalid address id!")
					.notEmpty()
					.withMessage("You must supply a address id!"),
				body("shippingMethod")
					.trim()
					.escape()
					.optional()
					.isMongoId()
					.withMessage("Invalid shipping method id!")
					.notEmpty()
					.withMessage("You must supply a shipping method id!"),
				body("note")
					.trim()
					.escape()
					.optional()
					.isLength({ max: 1000 })
					.withMessage("Note must be at most 1000 characters long!"),
			];
		case "item/update":
			return [
				body("quantity")
					.isNumeric()
					.withMessage("You must supply a quantity!")
					.isInt({ min: 1 })
					.withMessage("quantity must be an integer greater than or equal 1!")
					.toInt(),
			];
		default:
			return [];
	}
};

/**
 * Generates a unique short id for an order, while ensuring it doesn't already exist.
 * @param {ClientSession | null} session - The mongoose client session.
 * @returns {Promise<[Error | null | undefined, string]>} - A promise that resolves with an array containing the error
 * (if any) and the generated unique short id.
 */
export const _generateOrderUniqueShortId = async (
	session: ClientSession | null
): Promise<[Error | undefined, string | null]> => {
	let orderShortId: string | null = null;
	let isUniqueShortId: boolean = false;

	while (!isUniqueShortId) {
		orderShortId = await getShortUniqueId();

		const [existsOrderError, existsOrder] = await to(
			Order.findOne({ shortId: orderShortId }).session(session)
		);
		if (existsOrderError) return [existsOrderError, null];

		isUniqueShortId = !existsOrder;
	}

	return [undefined, orderShortId];
};

/**
 * @summary Validates if the shipping method's zone is applicable to the given address.
 * @description This function checks whether the specified shipping method's zone includes
 * the address's country, state, and optionally city. It returns true if the zone does not cover
 * the address's location, otherwise false.
 *
 * @param {IShippingMethodDocument | null} [shippingMethod] - The shipping method to validate.
 * @param {IAddressDocument | null} [address] - The address to validate against the shipping method's zone.
 *
 * @returns {boolean} - Returns false if either the shipping method or address is null,
 * or if the shipping method's zone matches the country, state, or city of the address;
 * otherwise, returns true.
 */
export const _isValidShippingZone = (
	shippingMethod?: IShippingMethodDocument | null,
	address?: IAddressDocument | null
): boolean => {
	if (!shippingMethod || !address) return false;

	const shippingMethodZone = shippingMethod.zone as IZoneDocument;
	const zoneCountriesIds: string[] = shippingMethodZone.countries.map((country) =>
		(country?._id || country)?.toString()
	);
	const zoneStatesIds: string[] = shippingMethodZone.states.map((state) =>
		(state?._id || state)?.toString()
	);
	const zoneCitiesIds: string[] = shippingMethodZone.cities.map((city) =>
		(city?._id || city)?.toString()
	);
	return Boolean(
		!zoneCountriesIds.includes((address.country?._id || address.country)?.toString()) ||
			!zoneStatesIds.includes((address.state?._id || address.state)?.toString()) ||
			(address?.city &&
				!zoneCitiesIds.includes((address.city?._id || address.city)?.toString()))
	);
};

/**
 * @openapi
 * /orders:
 *   post:
 *     summary: Create a new order
 *     description: Creates a new order with the provided payment method, address, and shipping method. Checks stock and price changes before creation.
 *     tags: [Orders]
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
 *               - address
 *               - shippingMethod
 *             properties:
 *               paymentMethod:
 *                 type: string
 *                 description: ID of the payment method
 *               address:
 *                 type: string
 *                 description: ID of the address
 *               shippingMethod:
 *                 type: string
 *                 description: ID of the shipping method
 *               note:
 *                 type: string
 *                 description: Optional note for the order
 *     responses:
 *       201:
 *         description: Order created successfully
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
 *                           $ref: '#/components/schemas/Orders'
 *                     flashes:
 *                       $ref: '#/components/schemas/Flash'
 *       400:
 *         description: Bad Request (e.g., empty cart, invalid IDs, stock issues, price changes)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
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
export const postNewOrder = async (
	req: Request<
		{},
		FormatResponseObjectType<IOrderDocument, HttpStatus["CREATED"]>,
		Pick<IOrder, "paymentMethod" | "address" | "shippingMethod" | "note">
	>,
	res: Response<FormatResponseObjectType<IOrderDocument, HttpStatus["CREATED"]>>,
	next: NextFunction
): Promise<void> => {
	// Check if user logged in and has the correct role
	if (req.isUnauthenticated() || !req.user || ![vars.auth.roles.user].includes(req.user.role)) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	// Check if cart exists, and if there is an error or no cart is found,
	// pass the error to the next middleware
	const [cartError, cart] = await to(
		Cart.findOneAndUpdate({ user: req.user }, { $set: { locked: true } }, { new: true })
			.populate({ path: "items", populate: { path: "product" } })
			.populate({ path: "taxes" })
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

	// Destructure the request body to get paymentMethod, address, and shippingMethod data
	const { paymentMethod, address, shippingMethod, note } = req.body;

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
		Address.findOne({ _id: address })
			.populate({ path: "country" })
			.populate({ path: "state" })
			.populate({ path: "city" })
			.session(session)
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

	let orderItemsHolder: Pick<
		IOrderItem,
		"product" | "name" | "category" | "color" | "size" | "quantity"
	>[] = [];

	// Loop through each cart item to check availability and price consistency
	for (const item of cart.items) {
		const cartSingleItem = item as ICartItemDocument;
		const product = cartSingleItem.product as IProductDocument;
		const productId = (product?._id || product)?.toString();
		const productName = product.name;
		const cartItemColor: IProduct["colors"][number] | undefined = product.colors.find((color) =>
			[color.name, color.value].includes(cartSingleItem.color)
		);
		const cartItemSize: IProduct["sizes"][number] = cartSingleItem.size;
		const cartItemQuantity: number = cartSingleItem.quantity;
		const cartItemCategory: string = (product.category?._id || product.category)?.toString();

		// Check if the product is out of stock
		const noStockError = _checkProductStock(product?.toJSON(), cartSingleItem.quantity);
		if (noStockError) {
			handleTransactionError(session);
			return next({ ...(noStockError || {}), status: noStockError.status });
		}

		// Check if the product price has been updated since it was added to the cart.
		const productPriceError = _checkProductPriceChange(product?.toJSON(), cartSingleItem.price);
		if (productPriceError) {
			handleTransactionError(session);
			return next({ ...(productPriceError || {}), status: productPriceError.status });
		}

		// Add product to order items
		orderItemsHolder = [
			...(orderItemsHolder || []),
			{
				product: productId,
				name: productName,
				category: cartItemCategory,
				color: cartItemColor,
				size: cartItemSize,
				quantity: cartItemQuantity,
			},
		];

		// Update the product quantity
		const [updateProductError] = await to(
			Product.updateOne(
				{ _id: product._id, quantity: { $gte: cartSingleItem.quantity } },
				{ $inc: { quantity: -cartSingleItem.quantity } },
				{ session }
			)
		);
		if (updateProductError) {
			handleTransactionError(session);
			return next(updateProductError);
		}
	}

	// Create order items
	const [orderItemsError, orderItems] = await to(OrderItem.create(orderItemsHolder, { session }));
	if (orderItemsError) {
		handleTransactionError(session);
		return next(orderItemsError);
	}

	// Create order short id, and if there is an error,
	// pass the error to the next middleware
	const [existsOrderError, uniqueShortId] = await _generateOrderUniqueShortId(session);
	if (existsOrderError) {
		handleTransactionError(session);
		return next(existsOrderError);
	}

	// Create order, and if there is an error,
	// pass the error to the next middleware
	const [newOrderError, newOrder] = await to(
		Order.create(
			[
				{
					shortId: uniqueShortId,
					items: orderItems.map((item) => item._id),
					status: vars.order.status.pending,
					user: req.user,
					taxes: (cart.taxes as ITaxDocument[]).map(
						({ _id, slug: _slug, applicableCategories, ...restOfTax }) => ({
							...(restOfTax || {}),
							applicableCategories: applicableCategories?.map((category) =>
								(category?._id || category)?.toString()
							),
						})
					),
					shippingMethod: {
						name: existsShippingMethod.name,
						rate: existsShippingMethod.rate,
						zone: (existsShippingMethod.zone as IZoneDocument).name,
						deliveryTime: existsShippingMethod.deliveryTime,
					},
					address: {
						name: existsAddress.name,
						country: {
							name: (existsAddress.country as ICountryDocument).name,
							code: (existsAddress.country as ICountryDocument).code,
						},
						state: {
							name: (existsAddress.state as IStateDocument).name,
							code: (existsAddress.state as IStateDocument).code,
						},
						...((existsAddress?.city as ICityDocument)?.name
							? { city: { name: (existsAddress?.city as ICityDocument).name } }
							: {}),
						street: existsAddress.street,
						building: existsAddress.building,
						floor: existsAddress.floor,
						apartment: existsAddress.apartment,
						area: existsAddress.area,
						zip: existsAddress.zip,
					},
					paymentMethod: {
						name: existsPaymentMethod.method,
						description: existsPaymentMethod.description,
					},
					history: [
						{
							status: vars.order.status.pending,
							date: new Date(),
							updatedBy: req.user,
						},
					],
					...(note && { note }),
				},
			],
			{ session }
		)
	);
	if (newOrderError) {
		handleTransactionError(session);
		return next(newOrderError);
	}

	// Get order data with populated fields, and if there is an error,
	// pass the error to the next middleware
	const [orderError, order] = await to(
		Order.findOne({ _id: newOrder[0]._id })
			.populate({ path: "user" })
			.populate({ path: "items", populate: { path: "product" } })
			.populate({ path: "taxes" })
			.populate({ path: "shippingMethod" })
			.session(session)
	);
	if (orderError || !order) {
		handleTransactionError(session);
		return next(orderError);
	}

	// Attempt to delete the cart from the database, and if there was an error,
	// return the error and end the request
	const [deleteCartError] = await to(Cart.deleteOne({ _id: cart._id }).session(session));
	if (deleteCartError) {
		handleTransactionError(session);
		return next(deleteCartError);
	}

	// Send order confirmation email
	const [sendEmailError, sendEmail] = await emailService.send({
		to: req.user,
		from: vars.email.sender,
		filename: "order-confirmation",
		subject: `[${vars.app.name}] Order Confirmation - #${order.shortId}.`,
		actionUrl: `${vars.app.frontEndUrl}/orders/${order.shortId}/track`,
		siteName: vars.app.name,
		order,
		date: moment(order.createdAt).format("DD/MM/YYYY"),
	});
	if (sendEmailError) {
		handleTransactionError(session);
		return next(sendEmailError);
	}

	const [newEmailError] = await to(Email.create([sendEmail], { session }));
	if (newEmailError) {
		handleTransactionError(session);
		return next(newEmailError);
	}

	// Commit the transaction
	await session.commitTransaction();
	session.endSession();

	req.flash(
		"success",
		"Your order has been placed successfully! We've sent you an email with the order details. Thank you for shopping with us!"
	);
	res.status(httpStatus.CREATED).json(
		formatResponseObject({
			status: httpStatus.CREATED,
			entities: { data: order },
			flashes: req.flash(),
		})
	);
};

/**
 * @openapi
 * /orders:
 *   get:
 *     summary: Get a list of orders
 *     description: Retrieves a paginated list of orders. Supports filtering by search term (q) and deleted status (admin only).
 *     tags: [Orders]
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
 *         description: Number of items per page
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *         description: Sort field
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search term (matches shortId, status, user details, address details)
 *       - in: query
 *         name: deleted
 *         schema:
 *           type: boolean
 *         description: Include deleted orders (Admin/SuperAdmin only)
 *     responses:
 *       200:
 *         description: List of orders retrieved successfully
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
 *                             $ref: '#/components/schemas/Orders'
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
		Partial<
			Pick<PaginateOptions, "sort" | "page" | "limit" | "offset" | "pagination"> & {
				q?: string;
				deleted?: boolean | number;
			}
		>
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
	// q (search term), deleted (include deleted countries)
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
	const sort: SortItemType<"createdAt">[] = [
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
				...("page" in req.query && { page: Number(req.query.page) }),
				...("limit" in req.query && { limit: Number(req.query.limit) }),
				...("offset" in req.query && { offset: Number(req.query.offset) }),
				...("pagination" in req.query && { pagination: Boolean(req.query.pagination) }),
				populate: { path: "items" },
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
 * @openapi
 * /orders/{order}:
 *   get:
 *     summary: Get a single order
 *     description: Retrieves a single order by its ID. Users can only access their own orders.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: order
 *         required: true
 *         schema:
 *           type: string
 *         description: Order ID
 *     responses:
 *       200:
 *         description: Order retrieved successfully
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
 *                           $ref: '#/components/schemas/Orders'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       404:
 *         description: Order not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
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

/**
 * @openapi
 * /orders/{order}:
 *   patch:
 *     summary: Update a single order
 *     description: Updates an order's status, address, shipping method, or note. Admin/SuperAdmin only.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: order
 *         required: true
 *         schema:
 *           type: string
 *         description: Order ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 description: New status of the order
 *                 enum: [pending, processing, shipped, delivered, cancelled, returned, refunded]
 *               address:
 *                 type: string
 *                 description: New address ID
 *               shippingMethod:
 *                 type: string
 *                 description: New shipping method ID
 *               note:
 *                 type: string
 *                 description: New note
 *     responses:
 *       200:
 *         description: Order updated successfully
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
 *                           $ref: '#/components/schemas/Orders'
 *                     flashes:
 *                       $ref: '#/components/schemas/Flash'
 *       400:
 *         description: Bad Request (e.g., invalid status transition, address/shipping mismatch)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       404:
 *         description: Order, Address, or Shipping Method not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const updateSingleOrder = async (
	req: Request<
		{ order: string },
		FormatResponseObjectType<IOrderDocument, HttpStatus["OK"]>,
		Partial<Pick<IOrder, "status" | "address" | "shippingMethod" | "note">>
	>,
	res: Response<FormatResponseObjectType<IOrderDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Check if user logged in and has the correct role
	if (
		req.isUnauthenticated() ||
		!req.user ||
		![vars.auth.roles.admin, vars.auth.roles.superAdmin].includes(req.user.role)
	) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	// Retrieve the order ID from the request parameters
	const { order: orderIdentifier } = req.params;

	// Extract the status, address, and shipping method from the request body
	const { status, address, shippingMethod, note } = req.body;

	// Attempt to retrieve a order from the database with the given ID,
	// and if there was an error or no order was found, return the error and end the request
	const [orderError, order] = await to(
		Order.findOne({ _id: orderIdentifier })
			.populate({ path: "items", populate: { path: "product" } })
			.session(session)
	);
	if (orderError || !order) {
		handleTransactionError(session);
		return next(orderError);
	}

	// Check if the status presented in body and it's transition is valid and return an error if it is not
	if (status) {
		const allowedStatuses = order.getAllowedNextStatuses();
		if (!allowedStatuses.includes(status)) {
			const error = createError(httpStatus.BAD_REQUEST, "Invalid status transition");
			handleTransactionError(session);
			return next({ ...(error || {}), status: error.status });
		}
	}

	// Check if address exists, and if there is an error or no address is found,
	// pass the error to the next middleware
	let existsAddress: IAddressDocument | undefined | null;
	let existsAddressError: Error | null = null;
	if (address) {
		[existsAddressError, existsAddress] = await to(
			Address.findOne({ _id: address })
				.populate({ path: "country" })
				.populate({ path: "state" })
				.populate({ path: "city" })
				.session(session)
		);
		if (existsAddressError || !existsAddress) {
			handleTransactionError(session);
			return next(existsAddressError);
		}
	}

	// Check if shipping method exists, and if there is an error or no shipping method is found,
	// pass the error to the next middleware
	let existsShippingMethod: IShippingMethodDocument | undefined | null;
	let existsShippingMethodError: Error | null = null;
	if (shippingMethod) {
		[existsShippingMethodError, existsShippingMethod] = await to(
			ShippingMethod.findOne({ _id: shippingMethod })
				.populate({ path: "zone", populate: ["country", "state", "city"] })
				.session(session)
		);
		if (existsShippingMethodError || !existsShippingMethod) {
			handleTransactionError(session);
			return next(existsShippingMethodError);
		}
	}

	// Check if the address matches the shipping method's zone and return an error if it is not
	if (_isValidShippingZone(existsShippingMethod, existsAddress)) {
		const error = createError(
			httpStatus.BAD_REQUEST,
			"Address and shipping method don't match"
		);
		handleTransactionError(session);
		return next({ ...(error || {}), status: error.status });
	}

	// Merge the old order data with the new data
	const newOrder = Object.assign(order, {
		...(existsAddress && {
			address: {
				name: existsAddress.name,
				country: {
					name: (existsAddress.country as ICountryDocument).name,
					code: (existsAddress.country as ICountryDocument).code,
				},
				state: {
					name: (existsAddress.state as IStateDocument).name,
					code: (existsAddress.state as IStateDocument).code,
				},
				...((existsAddress?.city as ICityDocument)?.name
					? { city: { name: (existsAddress?.city as ICityDocument).name } }
					: {}),
				street: existsAddress.street,
				building: existsAddress.building,
				floor: existsAddress.floor,
				apartment: existsAddress.apartment,
				area: existsAddress.area,
				zip: existsAddress.zip,
			},
		}),
		...(existsShippingMethod && {
			shippingMethod: {
				name: existsShippingMethod.name,
				rate: existsShippingMethod.rate,
				zone: (existsShippingMethod.zone as IZoneDocument).name,
				deliveryTime: existsShippingMethod.deliveryTime,
			},
		}),
		...(status && {
			status,
			history: [...(order?.history || []), { status, date: new Date(), updatedBy: req.user }],
		}),
		...(note && { note }),
	});

	// Save the updated order to the database, and if there is an error during saving,
	// pass the error to the next middleware
	const [saveOrderError, updatedOrder] = await to(newOrder.save({ session }));
	if (saveOrderError) {
		handleTransactionError(session);
		return next(saveOrderError);
	}

	if (status) {
		// Send order status update email
		const [sendEmailError, sendEmail] = await emailService.send({
			to: req.user,
			from: vars.email.sender,
			filename: "order-status-update",
			subject: `[${vars.app.name}] Your Order ${order.shortId} Status Update - Now ${status?.toLowerCase()}.`,
			siteName: vars.app.name,
			order,
			status,
		});
		if (sendEmailError) {
			handleTransactionError(session);
			return next(sendEmailError);
		}

		const [newEmailError] = await to(Email.create([sendEmail], { session }));
		if (newEmailError) {
			handleTransactionError(session);
			return next(newEmailError);
		}
	}

	// Commit the transaction
	await session.commitTransaction();
	session.endSession();

	// Set a flash message to indicate that the order was updated successfully,
	// and return the updated order in the response
	req.flash("success", "Order updated successfully.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: updatedOrder },
			flashes: req.flash(),
		})
	);
};

/**
 * @openapi
 * /orders/{order}:
 *   delete:
 *     summary: Delete a single order
 *     description: Soft deletes a single order by its ID. Admin/SuperAdmin only.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: order
 *         required: true
 *         schema:
 *           type: string
 *         description: Order ID
 *     responses:
 *       200:
 *         description: Order deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     flashes:
 *                       $ref: '#/components/schemas/Flash'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       404:
 *         description: Order not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
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
 * @openapi
 * /orders/{order}/restore:
 *   patch:
 *     summary: Restore a single order
 *     description: Restores a soft-deleted order by its ID. Admin/SuperAdmin only.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: order
 *         required: true
 *         schema:
 *           type: string
 *         description: Order ID
 *     responses:
 *       200:
 *         description: Order restored successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     flashes:
 *                       $ref: '#/components/schemas/Flash'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       404:
 *         description: Order not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
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

/**
 * @openapi
 * /orders/{order}/items/{orderItem}:
 *   patch:
 *     summary: Update an order item quantity
 *     description: Updates the quantity of a specific item in an order. Admin/SuperAdmin only.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: order
 *         required: true
 *         schema:
 *           type: string
 *         description: Order ID
 *       - in: path
 *         name: orderItem
 *         required: true
 *         schema:
 *           type: string
 *         description: Order Item ID
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
 *                 description: New quantity
 *     responses:
 *       200:
 *         description: Order item updated successfully
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
 *                           $ref: '#/components/schemas/Orders'
 *                     flashes:
 *                       $ref: '#/components/schemas/Flash'
 *       400:
 *         description: Bad Request (e.g., insufficient stock)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       404:
 *         description: Order or Order Item not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const updateOrderItem = async (
	req: Request<
		{ order: string; orderItem: string },
		FormatResponseObjectType<IOrderDocument, HttpStatus["OK"]>,
		{ quantity: number }
	>,
	res: Response<FormatResponseObjectType<IOrderDocument, HttpStatus["OK"]>>,
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

	// Retrieve the order item ID or slug from the request parameters
	const { orderItem: orderItemIdentifier, order: orderIdentifier } = req.params;

	// Retrieve the quantity from the request body
	const { quantity } = req.body;

	// Attempt to retrieve a order item from the database,
	// and if there was an error, return the error and end the request
	const [orderItemError, orderItem] = await to(
		OrderItem.findOne({ _id: orderItemIdentifier })
			.populate({ path: "product" })
			.session(session)
	);
	if (orderItemError || !orderItem) {
		handleTransactionError(session);
		return next(orderItemError);
	}

	// Attempt to retrieve a order from the database using order identifier,
	// and if there was an error, return the error and end the request
	const [orderError, order] = await to(
		Order.findOne({ _id: orderIdentifier }).populate({ path: "items" }).session(session)
	);
	if (orderError || !order) {
		handleTransactionError(session);
		return next(orderError);
	}

	// Get product data from the order item
	const product = orderItem.product as IProductDocument;
	// Merge the old order item data with the new order item quantity
	const newOrderItem = Object.assign(orderItem, { quantity });
	// Get the order items from the order
	let orderItems = [...(order.items?.map((item) => item?._id?.toString()) || [])] as string[];
	// Find the index of the order item in the order items array
	const itemIndex = orderItems.indexOf(orderItem._id.toString());

	// Check if the product stock is sufficient, and if there was an error,
	// return the error and end the request
	const noStockError = _checkProductStock(product?.toJSON(), newOrderItem.quantity);
	if (noStockError) {
		handleTransactionError(session);
		return next({ ...(noStockError || {}), status: noStockError.status });
	}

	// Save the updated order item to the database, and if there is an error during saving,
	// pass the error to the next middleware
	const [saveOrderItemError] = await to(newOrderItem.save({ session }));
	if (saveOrderItemError) {
		handleTransactionError(session);
		return next(saveOrderItemError);
	}

	if (itemIndex <= -1) {
		handleTransactionError(session);
		return next();
	}

	// Merge the old order items data with the new order item id
	orderItems = [
		...(orderItems.slice(0, itemIndex) || []),
		orderItem._id,
		...(orderItems.slice(itemIndex + 1) || []),
	] as string[];
	const newOrder = Object.assign(order, { items: orderItems }) as IOrderDocument;

	// Save the updated order to the database, and if there is an error during saving,
	// pass the error to the next middleware
	const [saveOrderError, updatedOrder] = await to(newOrder.save({ session }));
	if (saveOrderError) {
		handleTransactionError(session);
		return next(saveOrderError);
	}

	// Commit the transaction
	await session.commitTransaction();
	session.endSession();

	// Set a flash message to indicate that the order was updated successfully,
	// and return the updated order in the response
	req.flash("success", "Order updated successfully.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: updatedOrder },
			flashes: req.flash(),
		})
	);
};
