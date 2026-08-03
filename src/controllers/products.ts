import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body, query, ValidationChain } from "express-validator";
import createError, { HttpError } from "http-errors";
import httpStatus, { HttpStatus } from "http-status";
import mongoose, { ClientSession, PaginateOptions } from "mongoose";
import multer, { FileFilterCallback } from "multer";
import isHexColor from "validator/lib/isHexColor";
import isMongoId from "validator/lib/isMongoId";
import { AuthenticatedRequest } from "../@types/express";
import IProduct from "../interfaces/Product.interface";
import Attachment, { IAttachmentDocument } from "../models/Attachment";
import Brand from "../models/Brand";
import Category from "../models/Category";
import Product, { IProductDocument } from "../models/Product";
import StorageEngine from "../services/storage";
import {
	deleteFileFromDisk,
	formatResponseObject,
	FormatResponseObjectType,
	handleFileToUpload,
	handleTransactionError,
	hasAnyPermission,
	type SortItemType,
} from "../utils/helpers";
import PermissionType from "../utils/helpers/permissions";
import vars from "../utils/vars";

/**
 * Validates the input fields based on the method provided.
 */
export const validator = (method: "create" | "update" | "home"): ValidationChain[] => {
	switch (method) {
		case "create":
			return [
				body("name")
					.trim()
					.escape()
					.notEmpty()
					.withMessage("Name is required!")
					.isLength({ max: 100 })
					.withMessage("Name must be at most 100 characters long!"),
				body("description")
					.trim()
					.escape()
					.notEmpty()
					.withMessage("Description is required!")
					.isLength({ max: 1000 })
					.withMessage("Description must be at most 1000 characters long!"),
				body("quantity")
					.optional()
					.isInt({ min: 0 })
					.withMessage("Quantity must be an integer greater than or equal to 0!"),
				body("price.normal")
					.isFloat({ min: 0 })
					.withMessage("Normal price must be greater than or equal to 0!")
					.notEmpty()
					.withMessage("Normal price is required!"),
				body("price.sale")
					.optional()
					.isFloat({ min: 0 })
					.withMessage("Sale price must be greater than or equal to 0!")
					.custom((value, { req }) => {
						if (value && +value >= +req.body.price.normal)
							throw new Error("Sale price must be less than normal price!");
						return true;
					}),
				body("colors")
					.isArray()
					.withMessage("Colors must be an array!")
					.custom((colors: IProduct["colors"]) => {
						if (!colors.length) throw new Error("At least one color is required!");
						colors.forEach((color) => {
							if (!color.name) throw new Error("Color name is required!");
							if (!isHexColor(color.value)) throw new Error("Invalid color value!");
						});
						return true;
					}),
				body("sizes")
					.isArray()
					.withMessage("Sizes must be an array!")
					.custom((sizes: IProduct["sizes"]) => {
						if (!sizes.length) throw new Error("At least one size is required!");
						sizes.forEach((size) => {
							if (!vars.products.sizes.includes(size))
								throw new Error(`Invalid size: ${size}`);
						});
						return true;
					}),
				body("thumbnail").notEmpty().withMessage("Thumbnail is required!"),
				body("images")
					.optional()
					.notEmpty()
					.isArray()
					.withMessage("at least one Image is required!"),
				body("brand")
					.isMongoId()
					.withMessage("Invalid brand id!")
					.notEmpty()
					.withMessage("Brand is required!"),
				body("category")
					.isMongoId()
					.withMessage("Invalid category id!")
					.notEmpty()
					.withMessage("Category is required!"),
				body("isFeatured")
					.optional()
					.isBoolean()
					.withMessage("isFeatured must be a boolean!"),
			];
		case "update":
			return [
				body("name")
					.optional()
					.trim()
					.escape()
					.notEmpty()
					.withMessage("Name is required!")
					.isLength({ max: 100 })
					.withMessage("Name must be at most 100 characters long!"),
				body("description")
					.optional()
					.trim()
					.escape()
					.notEmpty()
					.withMessage("Description is required!")
					.isLength({ max: 1000 })
					.withMessage("Description must be at most 1000 characters long!"),
				body("quantity")
					.optional()
					.isInt({ min: 0 })
					.withMessage("Quantity must be an integer greater than or equal to 0!"),
				body("price.normal")
					.optional()
					.isFloat({ min: 0 })
					.withMessage("Normal price must be greater than or equal to 0!")
					.notEmpty()
					.withMessage("Normal price is required!"),
				body("price.sale")
					.optional()
					.isFloat({ min: 0 })
					.withMessage("Sale price must be greater than or equal to 0!")
					.custom((value, { req }) => {
						if (value && +value >= +req.body.price.normal)
							throw new Error("Sale price must be less than normal price!");
						return true;
					}),
				body("colors")
					.optional()
					.isArray()
					.withMessage("Colors must be an array!")
					.custom((colors: IProduct["colors"]) => {
						colors.forEach((color) => {
							if (!color.name) throw new Error("Color name is required!");
							if (!isHexColor(color.value)) throw new Error("Invalid color value!");
						});
						return true;
					}),
				body("sizes")
					.optional()
					.isArray()
					.withMessage("Sizes must be an array!")
					.custom((sizes: IProduct["sizes"]) => {
						sizes.forEach((size) => {
							if (!vars.products.sizes.includes(size))
								throw new Error(`Invalid size: ${size}`);
						});
						return true;
					}),
				body("thumbnail").optional().notEmpty().withMessage("Thumbnail is required!"),
				body("images")
					.optional()
					.isArray()
					.notEmpty()
					.withMessage("at least one Image is required!"),
				body("brand")
					.optional()
					.isMongoId()
					.withMessage("Invalid brand id!")
					.notEmpty()
					.withMessage("Brand is required!"),
				body("category")
					.optional()
					.isMongoId()
					.withMessage("Invalid category id!")
					.notEmpty()
					.withMessage("Category is required!"),
				body("isFeatured")
					.optional()
					.isBoolean()
					.withMessage("isFeatured must be a boolean!"),
			];
		case "home":
			return [
				query("type")
					.trim()
					.escape()
					.notEmpty()
					.withMessage("type is required!")
					.custom((value: "latest" | "featured" | "onSale" | "topRated") => {
						if (!["latest", "featured", "onSale", "topRated"].includes(value))
							throw new Error(`Invalid type ${value || ""}`);
						return true;
					}),
			];
		default:
			return [];
	}
};

export const uploadImages = async (
	req: Request,
	res: Response,
	next: NextFunction
): Promise<void> => {
	const storageEngine = new StorageEngine({
		accept: ["image"],
		square: false,
		quality: 50,
		fileHashName: true,
		responsive: false, // FIXME: not working if set to true with multiple files and multiple fields
		uploadPath: `${vars.storage.uploadPath}/products`,
		uploadBasePath: "",
	});

	const imageUpload = multer({
		storage: storageEngine,
		limits: { fileSize: 1024 * 1024 * Number(vars.storage.allowedFileSizeInMB) },
		fileFilter: (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
			// supported image file mimetype
			const isFileTypeValid = storageEngine.options.accept.some((item) =>
				file.mimetype.startsWith(item)
			);
			// throw error for invalid files
			if (!isFileTypeValid) return cb(Error("That fileType isn't allowed!"));
			// allow supported image files
			cb(null, true);
		},
	});

	imageUpload.fields([
		{ name: "thumbnail", maxCount: 1 },
		{ name: "images", maxCount: vars.products.imagesMaxLength },
	])(req, res, async (err) => {
		if (err) return next(err);
		if (req.files) {
			const { thumbnail, images } = req.files as {
				thumbnail: Express.Multer.File[];
				images: Express.Multer.File[];
			};
			req.body = {
				...req.body,
				...(thumbnail?.[0] && { thumbnail: thumbnail[0] }),
				...(images && { images }),
			};
		}
		next();
	});
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
export const _checkProductStock = (
	product: Partial<IProductDocument>,
	quantity: number = 0
): HttpError | null => {
	// Check if product has quantity
	if (typeof product.quantity !== "number" || !("quantity" in product))
		return createError(httpStatus.INTERNAL_SERVER_ERROR, "Product has no quantity");

	// Check if product is out of stock
	if (product.quantity <= 0)
		return createError(httpStatus.BAD_REQUEST, "Product is out of stock.");

	// Check if there's enough product quantity in the stock
	if (product.quantity < quantity)
		return createError(httpStatus.BAD_REQUEST, "Requested quantity exceeds available stock.");

	// No error
	return null;
};

/**
 * @openapi
 * /v1/products:
 *   post:
 *     summary: Creates a new product.
 *     description: |
 *       Creates a new product with details, thumbnail, and images.
 *       Requires Admin or SuperAdmin role.
 *     tags:
 *       - Products
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - description
 *               - price[normal]
 *               - brand
 *               - category
 *               - thumbnail
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               quantity:
 *                 type: integer
 *               price[normal]:
 *                 type: number
 *               price[sale]:
 *                 type: number
 *               colors:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     value:
 *                       type: string
 *               sizes:
 *                 type: array
 *                 items:
 *                   type: string
 *               brand:
 *                 type: string
 *                 description: Brand ID
 *               category:
 *                 type: string
 *                 description: Category ID
 *               isFeatured:
 *                 type: boolean
 *               thumbnail:
 *                 type: string
 *                 format: binary
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       "201":
 *         description: Product created successfully.
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
 *                           $ref: '#/components/schemas/Products'
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
export const postNewProduct = async (
	req: AuthenticatedRequest<
		{},
		FormatResponseObjectType<IProductDocument, HttpStatus["CREATED"]>,
		Pick<
			IProduct,
			| "name"
			| "description"
			| "quantity"
			| "colors"
			| "sizes"
			| "brand"
			| "category"
			| "isFeatured"
		> & {
			price: Pick<IProduct["price"], "normal" | "sale">;
			thumbnail?: Express.Multer.File;
			images?: Express.Multer.File[];
		}
	>,
	res: Response<FormatResponseObjectType<IProductDocument, HttpStatus["CREATED"]>>,
	next: NextFunction
): Promise<void> => {
	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	// Check if category exists in the request body, and if there was an error,
	// return the error and end the request
	const [categoryError, category] = await to(
		Category.findOne({ _id: req.body.category }).session(session)
	);
	if (categoryError || !category) {
		handleTransactionError(session);
		return next(categoryError);
	}

	// Check if brand exists in the request body, and if there was an error,
	// return the error and end the request
	const [brandError, brand] = await to(Brand.findOne({ _id: req.body.brand }).session(session));
	if (brandError || !brand) {
		handleTransactionError(session);
		return next(brandError);
	}

	// create variables to hold the created product and attachment
	let createdThumbnailError: Error | null = null;
	let createdThumbnail: IAttachmentDocument[] | undefined;

	// Check if attachment exists in the request body.
	if (req.body?.thumbnail) {
		// Create a new attachment from the request body attachment, and if there was an error,
		// return the error and end the request
		[createdThumbnailError, createdThumbnail] = await to(
			Attachment.create(
				[
					handleFileToUpload(
						req.body.thumbnail,
						`${req.protocol}://${req.hostname}${req.app.get("port") ? `:${req.app.get("port")}` : ""}`
					),
				],
				{ session }
			)
		);
		if (createdThumbnailError) {
			handleTransactionError(session);
			return next(createdThumbnailError);
		}
	}

	// create variables to hold the created product and images
	let createdImagesError: Error | null = null;
	let createdImages: IAttachmentDocument[] | undefined;
	// Check if images exists in the request body.
	if (req.body?.images && req.body.images.length) {
		// Create a new attachment from the request body icon, and if there was an error,
		// return the error and end the request
		[createdImagesError, createdImages] = await to(
			Attachment.create(
				req.body.images.map((image: Express.Multer.File) =>
					handleFileToUpload(
						image,
						`${req.protocol}://${req.hostname}${req.app.get("port") ? `:${req.app.get("port")}` : ""}`
					)
				),
				{ session }
			)
		);
		if (createdImagesError) {
			handleTransactionError(session);
			return next(createdImagesError);
		}
	}

	// Extract thumbnail and images mongoose ids from the created attachments
	const thumbnail: string | undefined = createdThumbnail?.[0]?._id || undefined;
	const images: (string | undefined)[] = createdImages?.map(({ _id }) => _id) || [];

	// Create a new category from the request body data, and if there was an error,
	// return the error and end the request
	const [createdProductError, createdProduct] = await to(
		Product.create(
			[
				{
					name: req.body.name,
					description: req.body.description,
					quantity: req.body.quantity,
					price: {
						normal: req.body.price.normal,
						...(req.body.price?.sale && { sale: req.body.price.sale }),
					},
					colors: req.body.colors,
					sizes: req.body.sizes,
					brand: req.body.brand,
					category: req.body.category,
					...(thumbnail ? { thumbnail } : {}),
					...(images.length ? { images } : {}),
					...("isFeatured" in req.body && { isFeatured: req.body.isFeatured }),
					user: req.user._id,
				},
			],
			{ session }
		)
	);
	if (createdProductError) {
		handleTransactionError(session);
		return next(createdProductError);
	}

	// Save the updated category object to the database, and if there is an error during saving,
	// pass the error to the next middleware
	const updatedCategory = Object.assign(category, {
		products: [...(category.products || []), createdProduct[0]._id],
	});
	const [saveCategoryError] = await to(updatedCategory.save({ session }));
	if (saveCategoryError) {
		handleTransactionError(session);
		return next(saveCategoryError);
	}

	// Save the updated brand object to the database, and if there is an error during saving,
	// pass the error to the next middleware
	const updatedBrand = Object.assign(brand, {
		products: [...(brand.products || []), createdProduct[0]._id],
	});
	const [saveBrandError] = await to(updatedBrand.save({ session }));
	if (saveBrandError) {
		handleTransactionError(session);
		return next(saveBrandError);
	}

	// Commit the transaction
	await session.commitTransaction();
	session.endSession();

	// Set a flash message to indicate that the product was created successfully,
	// and return the created product in the response
	req.flash("success", "Product created successfully.");
	res.status(httpStatus.CREATED).json(
		formatResponseObject({
			status: httpStatus.CREATED,
			entities: { data: createdProduct[0] },
			flashes: req.flash(),
		})
	);
};

/**
 * @openapi
 * /v1/products:
 *   get:
 *     summary: Retrieves a paginated list of products.
 *     description: Fetches products with filtering, sorting, and pagination.
 *     tags:
 *       - Products
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
 *         description: Include deleted products (Admin only).
 *       - in: query
 *         name: categories
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *       - in: query
 *         name: brands
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *       - in: query
 *         name: sizes
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *       - in: query
 *         name: colors
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *       - in: query
 *         name: minPrice
 *         schema:
 *           type: number
 *       - in: query
 *         name: maxPrice
 *         schema:
 *           type: number
 *     responses:
 *       "200":
 *         description: List of products.
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
 *       "500":
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const getProducts = async (
	req: Request<
		{},
		FormatResponseObjectType<IProductDocument, HttpStatus["OK"]>,
		{},
		Partial<
			Pick<PaginateOptions, "sort" | "page" | "limit" | "offset" | "pagination"> & {
				q?: string;
				deleted?: boolean | number;
				categories?: string[];
				brands?: string[];
				sizes?: string[];
				colors?: string[];
				minPrice?: number;
				maxPrice?: number;
			}
		>
	>,
	res: Response<FormatResponseObjectType<IProductDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Destructure the query parameters (req.query) into
	// q (search term), deleted (include deleted countries), categories (list of category ids), brands (list of brand ids),
	// sizes (list of product sizes), colors (list of product colors name or value), minPrice, maxPrice,
	// and query(pagination & sorting options)
	const {
		q,
		deleted,
		categories = [],
		brands = [],
		sizes = [],
		colors = [],
		minPrice = 0,
		maxPrice = 0,
	} = req.query || {};

	// Check if the query includes a deleted flag
	const isFilterByDeletedAllowed: boolean =
		"deleted" in req.query &&
		Boolean(
			req?.user && hasAnyPermission(req.user.permissions || [], PermissionType.MANAGE_ALL)
		);

	// List of fields to search for the query term
	const querySearchFields: string[] = ["name", "description"];

	// List of sort options
	const sort: SortItemType<"name" | "price" | "createdAt">[] = [
		{ name: "Name A-Z", value: { name: 1 } },
		{ name: "Name Z-A", value: { name: -1 } },
		{ name: "Price Ascending", value: { price: 1 } },
		{ name: "Price Descending", value: { price: -1 } },
		{ name: "Created Date Ascending", value: { createdAt: 1 } },
		{ name: "Created Date Descending", value: { createdAt: -1 } },
	];

	// Attempt to retrieve the products using the given query and pagination options,
	// and if there was an error, return the error and end the request
	const [paginatedProductsError, paginatedProducts] = await to(
		Product.paginate<IProductDocument>(
			{
				// If the query includes a search term, filter products by name or code
				...((q && {
					$or: querySearchFields.map((item) => ({
						[item]: { $regex: String(q).toLowerCase() || "", $options: "i" },
					})),
				}) ||
					{}),
				// If the query includes a deleted flag, include deleted products
				...((isFilterByDeletedAllowed && { deleted: Boolean(deleted) }) || {}),
				// Filter products by categories.
				...(categories && categories.length && { category: { $in: categories } }),
				// Filter products by brands.
				...(brands && brands.length && { brand: { $in: brands } }),
				// Filter products by sizes.
				...(sizes && sizes.length && { sizes: { $in: sizes } }),
				// Filter products by colors.
				...(colors &&
					colors.length && {
						$or: [
							{ "colors.name": { $in: colors } },
							{ "colors.value": { $in: colors } },
						],
					}),
				// Filter products by price range
				...(((minPrice || maxPrice) && {
					$or: [
						{
							"price.sale": {
								...(minPrice && { $gte: minPrice }),
								...(maxPrice && { $lte: maxPrice }),
							},
						},
						{
							"price.sale": { $eq: 0 },
							"price.amount": {
								...(minPrice && { $gte: minPrice }),
								...(maxPrice && { $lte: maxPrice }),
							},
						},
					],
				}) ||
					{}),
			},
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
	if (paginatedProductsError) return next(paginatedProductsError);

	// Destructure the paginated products into the list of products (docs) and pagination metadata
	const { docs, ...pagination } = paginatedProducts;

	// Return the list of products, pagination metadata, and sort options in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: [...(docs || [])], meta: { pagination, sort } },
		})
	);
};

/**
 * @openapi
 * /v1/products/{product}:
 *   get:
 *     summary: Retrieves a single product.
 *     description: Fetches a product by ID or slug.
 *     tags:
 *       - Products
 *     parameters:
 *       - in: path
 *         name: product
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID or slug.
 *     responses:
 *       "200":
 *         description: Product details.
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
 *                           $ref: '#/components/schemas/Products'
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
export const getSingleProduct = async (
	req: Request<{ product: string }, FormatResponseObjectType<IProductDocument, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<IProductDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Retrieve the product ID or slug from the request parameters
	const { product: productIdentifier } = req.params || {};

	// Attempt to retrieve the product using the given identifier, and if there was an error,
	// return the error
	const findMethodName = Boolean(
		req?.user && hasAnyPermission(req.user.permissions || [], PermissionType.MANAGE_SETTINGS)
	)
		? "findOneWithDeleted"
		: "findOne";
	const [productError, product] = await to(
		Product[findMethodName]({
			$or: [
				{ slug: productIdentifier },
				...(isMongoId(productIdentifier) ? [{ _id: productIdentifier }] : []),
			],
		})
	);
	if (productError || !product) return next(productError);

	// Return the retrieved category in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, entities: { data: product } })
	);
};

/**
 * @openapi
 * /v1/products/{product}:
 *   patch:
 *     summary: Updates a single product.
 *     description: Updates product details. Requires Admin or SuperAdmin role.
 *     tags:
 *       - Products
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: product
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID or slug.
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               quantity:
 *                 type: integer
 *               price[normal]:
 *                 type: number
 *               price[sale]:
 *                 type: number
 *               colors:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     value:
 *                       type: string
 *               sizes:
 *                 type: array
 *                 items:
 *                   type: string
 *               brand:
 *                 type: string
 *               category:
 *                 type: string
 *               isFeatured:
 *                 type: boolean
 *               thumbnail:
 *                 type: string
 *                 format: binary
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       "200":
 *         description: Product updated successfully.
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
 *                           $ref: '#/components/schemas/Products'
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
export const updateSingleProduct = async (
	req: AuthenticatedRequest<
		{ product: string },
		FormatResponseObjectType<IProductDocument, HttpStatus["OK"]>,
		Partial<
			Pick<
				IProduct,
				| "name"
				| "description"
				| "quantity"
				| "colors"
				| "sizes"
				| "brand"
				| "category"
				| "isFeatured"
			> & {
				price: Partial<Pick<IProduct["price"], "normal" | "sale">>;
				thumbnail?: Express.Multer.File;
				images?: Express.Multer.File[];
			}
		>
	>,
	res: Response<FormatResponseObjectType<IProductDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	// Retrieve the product ID or slug from the request parameters
	const { product: productIdentifier } = req.params || {};

	// Attempt to retrieve a product from the database with the given ID or slug,
	// and if there was an error or no product was found, return the error and end the request
	let [productError, product] = await to(
		Product.findOneWithDeleted({
			$or: [
				{ slug: productIdentifier },
				...(isMongoId(productIdentifier) ? [{ _id: productIdentifier }] : []),
			],
		}).session(session)
	);
	if (productError || !product) {
		handleTransactionError(session);
		return next(productError);
	}

	// create variables to hold the created thumbnail attachment
	let createdThumbnailError: Error | null = null;
	let createdThumbnail: IAttachmentDocument[] | undefined;

	// Check if thumbnail exists in the request body.
	if (req.body?.thumbnail) {
		// Find the thumbnail associated with the product
		const [productThumbnailError, productThumbnail] = await to(
			Attachment.findOne({ _id: product.thumbnail?._id || product.thumbnail }).session(
				session
			)
		);
		if (productThumbnailError) {
			handleTransactionError(session);
			return next(productThumbnailError);
		}

		// If the thumbnail exists, delete it, and delete the file from disk
		if (productThumbnail?._id) {
			const [deletedProductThumbnailError] = await to(
				Attachment.deleteOne({ _id: productThumbnail._id }).session(session)
			);
			if (deletedProductThumbnailError) {
				handleTransactionError(session);
				return next(deletedProductThumbnailError);
			}

			// delete file from disk if it exists
			const [deleteFileFromDiskError] = await to(deleteFileFromDisk(productThumbnail.path));
			if (deleteFileFromDiskError) {
				handleTransactionError(session);
				return next(deleteFileFromDiskError);
			}
		}

		// Create a new thumbnail from the request body logo, and if there was an error,
		// return the error and end the request
		[createdThumbnailError, createdThumbnail] = await to(
			Attachment.create(
				[
					handleFileToUpload(
						req.body.thumbnail,
						`${req.protocol}://${req.hostname}${req.app.get("port") ? `:${req.app.get("port")}` : ""}`
					),
				],
				{ session }
			)
		);
		if (createdThumbnailError) {
			handleTransactionError(session);
			return next(createdThumbnailError);
		}
	}

	// create variables to hold the created images attachments
	let createdImagesError: Error | null = null;
	let createdImages: IAttachmentDocument[] | undefined;

	// Check if images exists in the request body.
	if (req.body?.images && req.body.images.length) {
		// Find the images associated with the product
		const [productImagesError, productImages] = await to(
			Attachment.find({
				_id: {
					$in: product.images?.map((singleImage) => singleImage?._id || singleImage),
				},
			}).session(session)
		);
		if (productImagesError) {
			handleTransactionError(session);
			return next(productImagesError);
		}

		// If the images exists, delete it, and delete the file from disk
		if (productImages?.length) {
			const [deletedProductImagesError] = await to(
				Attachment.deleteMany({ _id: { $in: productImages.map((_id) => _id) } }).session(
					session
				)
			);
			if (deletedProductImagesError) {
				handleTransactionError(session);
				return next(deletedProductImagesError);
			}

			// delete files from disk if they exist
			for (const { path } of productImages || []) {
				if (!path) continue;

				const [deleteFileFromDiskError] = await to(deleteFileFromDisk(path));
				if (deleteFileFromDiskError) {
					handleTransactionError(session);
					return next(deleteFileFromDiskError);
				}
			}
		}

		// Create a new thumbnail from the request body logo, and if there was an error,
		// return the error and end the request
		const handledImages = req.body?.images.map((image: any) =>
			handleFileToUpload(
				image,
				`${req.protocol}://${req.hostname}${req.app.get("port") ? `:${req.app.get("port")}` : ""}`
			)
		);
		[createdImagesError, createdImages] = await to(
			Attachment.create(handledImages, { session })
		);
		if (createdImagesError) {
			handleTransactionError(session);
			return next(createdImagesError);
		}
	}

	// Update product's category if category is provided
	if (req.body?.category && req.body.category !== (product.category?._id || product?.category)) {
		const [categoryUpdateError] = await to(
			Category.updateOne(
				{ _id: product.category },
				{ $pull: { products: product._id } }
			).session(session)
		);
		if (categoryUpdateError) {
			handleTransactionError(session);
			return next(categoryUpdateError);
		}

		let [categoryError, category] = await to(
			Category.findOne({ _id: req.body.category }).session(session)
		);
		if (categoryError) {
			handleTransactionError(session);
			return next(categoryError);
		}

		if (category) {
			category = Object.assign(category, {
				products: [...(category?.products || []), product._id],
			});

			const [updatedProductCategoryError] = await to(category.save({ session }));
			if (updatedProductCategoryError) {
				handleTransactionError(session);
				return next(updatedProductCategoryError);
			}
		}
	}

	// Update product's brand if brand is provided
	if (req.body?.brand && req.body.brand !== (product.brand?._id || product?.brand)) {
		const [brandUpdateError] = await to(
			Brand.updateOne({ _id: product.brand }, { $pull: { products: product._id } }).session(
				session
			)
		);
		if (brandUpdateError) {
			handleTransactionError(session);
			return next(brandUpdateError);
		}

		let [brandError, brand] = await to(Brand.findOne({ _id: req.body.brand }).session(session));
		if (brandError) {
			handleTransactionError(session);
			return next(brandError);
		}

		if (brand) {
			brand = Object.assign(brand, {
				products: [...(brand?.products || []), product._id],
			});

			const [updatedProductBrandError] = await to(brand.save({ session }));
			if (updatedProductBrandError) {
				handleTransactionError(session);
				return next(updatedProductBrandError);
			}
		}
	}

	// Merge the request body data into the existing product object
	product = Object.assign(product, {
		...(req.body?.name && { name: req.body.name }),
		...(req.body?.description && { description: req.body.description }),
		...(req.body?.quantity && { quantity: req.body.quantity }),
		...(req.body?.price && {
			price: {
				...(req.body.price?.normal && { normal: req.body.price.normal }),
				...(req.body.price?.sale && { sale: req.body.price.sale }),
			},
		}),
		...(req.body?.colors && { colors: req.body.colors }),
		...(req.body?.sizes && { sizes: req.body.sizes }),
		...(req.body?.brand && { brand: req.body.brand }),
		...(req.body?.category && { category: req.body.category }),
		...(createdThumbnail?.[0]?._id ? { thumbnail: createdThumbnail[0]._id } : {}),
		...(createdImages?.length ? { images: createdImages?.map(({ _id }) => _id) } : {}),
		...("isFeatured" in req.body && { isFeatured: req.body.isFeatured }),
	});

	// If the product is not found, pass control to the next middleware
	if (!product) {
		handleTransactionError(session);
		return next();
	}

	// Save the updated product object to the database, and if there is an error during saving,
	// pass the error to the next middleware
	const [saveError, newProduct] = await to(product.save({ session }));
	if (saveError) {
		handleTransactionError(session);
		return next(saveError);
	}

	// Commit the transaction
	await session.commitTransaction();
	session.endSession();

	// Flash success message and return the updated category data in the response
	req.flash("success", "Product successfully updated.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: newProduct },
			flashes: req.flash(),
		})
	);
};

/**
 * @openapi
 * /v1/products/{product}:
 *   delete:
 *     summary: Deletes a single product.
 *     description: Soft-deletes a product. Requires Admin or SuperAdmin role.
 *     tags:
 *       - Products
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: product
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID or slug.
 *     responses:
 *       "200":
 *         description: Product deleted successfully.
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
export const deleteSingleProduct = async (
	req: AuthenticatedRequest<
		{ product: string },
		FormatResponseObjectType<undefined, HttpStatus["OK"]>
	>,
	res: Response<FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Extract the product identifier from request parameters
	const { product: productIdentifier } = req.params || {};

	// Attempt to find the product by its ID or slug, and if there is an error or no product is found,
	// pass the error to the next middleware
	const [productError, product] = await to(
		Product.findOne({
			$or: [
				{ slug: productIdentifier },
				...(isMongoId(productIdentifier) ? [{ _id: productIdentifier }] : []),
			],
		})
	);
	if (productError || !product) return next(productError);

	// Attempt to soft-delete the found product, and if there is an error during the deletion,
	// pass the error to the next middleware
	const [deleteProductError] = await to(Product.deleteById(product._id, req.user._id));
	if (deleteProductError) return next(deleteProductError);

	// Flash success message and respond with success status
	req.flash("success", "Successfully Deleted.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};

/**
 * @openapi
 * /v1/products/{product}/restore:
 *   patch:
 *     summary: Restores a single product.
 *     description: Restores a soft-deleted product. Requires Admin or SuperAdmin role.
 *     tags:
 *       - Products
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: product
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID or slug.
 *     responses:
 *       "200":
 *         description: Product restored successfully.
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
export const restoreSingleProduct = async (
	req: AuthenticatedRequest<
		{ product: string },
		FormatResponseObjectType<undefined, HttpStatus["OK"]>
	>,
	res: Response<FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Extract the product identifier from request parameters
	const { product: productIdentifier } = req.params || {};

	// Create a query to find the product by its ID or slug
	const singleProductQuery = {
		$or: [
			{ slug: productIdentifier }, // search by slug
			...(isMongoId(productIdentifier) ? [{ _id: productIdentifier }] : []), // search by ID
		],
		deleted: true, // only find soft-deleted countries
	};

	// Attempt to find the product by its ID or slug, and if there is an error or no product is found,
	// pass the error to the next middleware
	const [productError, product] = await to(Product.findOneWithDeleted(singleProductQuery));
	if (productError || !product) return next(productError);

	// Attempt to restore the found product, and if there is an error during the restoration,
	// pass the error to the next middleware
	const [restoreProductError] = await to(Product.restore(singleProductQuery));
	if (restoreProductError) return next(restoreProductError);

	// Flash success message and respond with success status
	req.flash("success", "Successfully Restored.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};

/**
 * @openapi
 * /v1/products/home:
 *   get:
 *     summary: Retrieves home products list.
 *     description: Fetches products for home page sections (latest, featured, onSale, topRated).
 *     tags:
 *       - Products
 *     parameters:
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [latest, featured, onSale, topRated]
 *     responses:
 *       "200":
 *         description: List of products.
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
 *       "500":
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const getHomeProductsList = async (
	req: Request<
		{},
		FormatResponseObjectType<IProductDocument, HttpStatus["OK"]>,
		{},
		{ type?: "latest" | "featured" | "onSale" | "topRated" }
	>,
	res: Response<FormatResponseObjectType<IProductDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Destructure the query parameters (req.query) into the 'type' variable
	const { type } = req.query || {};

	// Aggregation stages
	let matchStage = {};
	let sortStage = {};
	switch (type) {
		case "latest":
			sortStage = { createdAt: -1 }; // Sort by newest creation date
			break;
		case "featured":
			matchStage = { isFeatured: true }; // Replace with your actual field indicating featured products
			break;
		case "onSale":
			matchStage = { "price.sale": { $ne: null } }; // Products with a sale price
			break;
		case "topRated":
			sortStage = { averageRating: -1, reviewCount: -1 }; // Sort by highest average rating and reviews
			break;
		default:
			break;
	}

	// Build the aggregation pipeline
	const pipeline = [
		...(Object.keys(matchStage).length > 0 ? [{ $match: matchStage }] : []), // Apply filtering if necessary
		...(Object.keys(sortStage).length > 0 ? [{ $sort: sortStage }] : []), // Apply sorting if necessary
		{ $limit: 10 }, // Limit results for performance
	];

	// Attempt to retrieve the products using the given query,
	// and if there was an error, return the error and end the request
	const [paginatedProductsError, paginatedProducts] = await to(Product.aggregate(pipeline));
	if (paginatedProductsError) return next(paginatedProductsError);

	// Return the list of products in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, entities: { data: paginatedProducts } })
	);
};
