import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body } from "express-validator";
import createError from "http-errors";
import httpStatus from "http-status";
import mongoose, { Types } from "mongoose";
import ICartItem from "../interfaces/CartItem.interface";
import Cart, { ICartDocument } from "../models/Cart";
import CartItem, { ICartItemDocument } from "../models/CartItem";
import Product from "../models/Product";
import { formatResponseObject, handleTransactionError } from "../utils/helpers";

export const validator = (method: string) => {
	switch (method) {
		case "add":
			return [
				body("product")
					.trim()
					.escape()
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
		default:
			return [];
	}
};

export const addToCart = async (req: Request, res: Response, next: NextFunction) => {
	// check if user logged in
	if (!req.user) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

	// start transaction
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
		return next(existsProductError || null);
	}

	if (existsProduct?.quantity - quantity < 0) {
		handleTransactionError(session);
		const error = createError(
			httpStatus.BAD_REQUEST,
			existsProduct?.quantity === 0
				? "Product is out of stock"
				: `There're only ${existsProduct?.quantity} left in the stock`
		);
		return next({ ...(error || {}), status: error.status });
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
		// create cart item
		const [cartItemError, cartItem] = await to(
			CartItem.create([{ product, color, size, quantity }], { session })
		);
		if (cartItemError || !cartItem) {
			handleTransactionError(session);
			return next(cartItemError || null);
		}

		// create cart
		const [newCartError, newCart] = await to(
			Cart.create([{ user: req.user._id, items: [cartItem[0]._id] }], { session })
		);
		if (newCartError || !newCart) {
			handleTransactionError(session);
			return next(newCartError || null);
		}

		// commit the transaction
		await session.commitTransaction();
		session.endSession();

		req.flash("success", "Product added to cart successfully.");
		res.status(httpStatus.CREATED).json(
			formatResponseObject({
				status: httpStatus.CREATED,
				entities: { data: newCart[0].toJSON() },
				flashes: req.flash(),
			})
		);
	}

	let cart = carts?.[0] as ICartDocument;
	let items = cart.items as ICartDocument["items"];
	const itemIndex = (cart.items as ICartItem[]).findIndex(
		(item) =>
			(item?.product?._id && item.product._id?.toString() === product) ||
			(Types.ObjectId.isValid(item?.product?.toString()) &&
				item?.product?.toString() === product)
	);

	if (itemIndex > -1) {
		let cartItem = items[itemIndex] as ICartItemDocument;
		cartItem = Object.assign(cartItem, { quantity: cartItem.quantity + quantity });

		const [saveCartItemError] = await to(cartItem.save({ session }));
		if (saveCartItemError) {
			handleTransactionError(session);
			return next(saveCartItemError);
		}

		items = [
			...(cart.items.slice(0, itemIndex) || []),
			cartItem._id,
			...(cart.items.slice(itemIndex + 1) || []),
		] as ICartDocument["items"];
	} else {
		const [newCartItemError, newCartItem] = await to(
			CartItem.create([{ product, color, size, quantity }], { session })
		);
		if (newCartItemError || !newCartItem) {
			handleTransactionError(session);
			return next(newCartItemError || null);
		}

		items = [...(cart.items || []), newCartItem[0]._id] as ICartDocument["items"];
	}

	cart = Object.assign(cart, { items }) as ICartDocument;

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
			entities: { data: cart },
			flashes: req.flash(),
		})
	);
};

export const removeFromCart = async (req: Request, res: Response, next: NextFunction) => {};

export const getSingleCart = async (req: Request, res: Response, next: NextFunction) => {};

export const updateCart = async (req: Request, res: Response, next: NextFunction) => {};

export const emptyCart = async (req: Request, res: Response, next: NextFunction) => {};
