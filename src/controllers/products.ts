import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body, query, ValidationChain } from "express-validator";
import createError, { HttpError } from "http-errors";
import httpStatus, { HttpStatus } from "http-status";
import mongoose, { ClientSession, PaginateOptions } from "mongoose";
import multer, { FileFilterCallback } from "multer";
import isHexColor from "validator/lib/isHexColor";
import isMongoId from "validator/lib/isMongoId";
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
	type SortItemType,
} from "../utils/helpers";
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
						if (value >= req.body.price.normal)
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
					.withMessage("Invalid country id!")
					.notEmpty()
					.withMessage("Brand is required!"),
				body("category")
					.isMongoId()
					.withMessage("Invalid country id!")
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
						if (value >= req.body.price.normal)
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
					.withMessage("Invalid country id!")
					.notEmpty()
					.withMessage("Brand is required!"),
				body("category")
					.optional()
					.isMongoId()
					.withMessage("Invalid country id!")
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
 * @summary Creates a new product.
 * @description Handles the creation of a new product in the system.
 * Optionally uploads and attaches a thumbnail and images if provided in the request.
 * The product is then saved to the database, and related category and brand associations are updated.
 * A success message is set upon successful creation.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.body - The data for creating a new product. Optionally includes `thumbnail` and
 * `images` files for product images.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {void} 201 - Success response with the newly created product data.
 *   * @property {Object} entities.data - The created product object.
 *   * @property {Array} flashes - Success message for product creation.
 * @throws {Error} 500 - Returns an error if the product, thumbnail, or images creation fails.
 * @throws {Error} 401 - Returns an error if the user is not authorized to create a product.
 */
export const postNewProduct = async (
	req: Request<
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
	// Check if user logged in
	if (
		req.isUnauthenticated() ||
		!req.user ||
		![vars.auth.roles.superAdmin, vars.auth.roles.admin].includes(req.user.role)
	) {
		const error = createError(httpStatus.UNAUTHORIZED);
		return next({ ...(error || {}), status: error.status });
	}

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
 * @summary Retrieves a paginated list of products based on filters and search criteria.
 * @description Fetches products from the database using various filters, including search queries, categories, brands, sizes, colors, and price range. Supports pagination and sorting options. If the user is an admin or super admin, deleted products can also be included in the results.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.query - Query parameters for filtering and sorting.
 * @param {String} [req.query.sort] - The field to sort by.
 * @param {Number} [req.query.page] - The page number to retrieve.
 * @param {Number} [req.query.limit] - The number of products to retrieve per page.
 * @param {String} [req.query.offset] - The number of products to skip.
 * @param {String} [req.query.pagination] - Enable or disable pagination.
 * @param {String} [req.query.q] - Search query to match against product name and description.
 * @param {Boolean} [req.query.deleted] - Flag to include deleted products in the response.
 * @param {String[]} [req.query.categories] - List of category IDs to filter products by.
 * @param {String[]} [req.query.brands] - List of brand IDs to filter products by.
 * @param {String[]} [req.query.sizes] - List of size IDs to filter products by.
 * @param {String[]} [req.query.colors] - List of color IDs to filter products by.
 * @param {Number} [req.query.minPrice] - Minimum price to filter products by.
 * @param {Number} [req.query.maxPrice] - Maximum price to filter products by.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with a list of products, pagination metadata, and sort options.
 * @throws {Error} 500 - Returns an error if any issue occurs during the retrieval process.
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
			req.user &&
				req.user.role &&
				[vars.auth.roles.superAdmin, vars.auth.roles.admin].includes(req.user.role)
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
 * @summary Retrieves a single product by identifier.
 * @description Fetches a product based on the provided identifier, which can be either a slug or an ObjectId.
 * Handles errors and returns the product data if found.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.params - URL parameters for the request.
 * @param {String} req.params.product - The product identifier, either a slug or an ObjectId.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with the product data.
 *   * @property {Object} entities.data - The retrieved product object.
 * @throws {Error} 500 - Returns an error if the product retrieval fails.
 * @throws {Error} 404 - Returns an error if no product is found.
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
	const findMethodName =
		req.user &&
		req.user.role &&
		[vars.auth.roles.superAdmin, vars.auth.roles.admin].includes(req.user.role)
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
 * @summary Updates a single product by identifier.
 * @description Handles the update of a product's details, including its category, brand, thumbnail, and images.
 * Utilizes transactions to ensure data integrity. If the update is successful, the updated product data is returned.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.params - URL parameters for the request.
 * @param {String} req.params.product - The product identifier, either a slug or an ObjectId.
 * @param {Object} req.body - The updated product data. Optionally includes `thumbnail` and `images` files.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with the updated product data.
 *   * @property {Object} entities.data - The updated product object.
 *   * @property {Array} flashes - Success message for product update.
 * @throws {Error} 500 - Returns an error if the product update fails.
 * @throws {Error} 404 - Returns an error if the product is not found.
 */
export const updateSingleProduct = async (
	req: Request<
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
			deleteFileFromDisk(productThumbnail.path);
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
			productImages?.forEach(({ path }) => path && deleteFileFromDisk(path));
		}

		// Create a new thumbnail from the request body logo, and if there was an error,
		// return the error and end the request
		const handledImages = req.body?.images.map((image) =>
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
 * @summary Deletes a single product by its ID or slug.
 * @description This method deletes a product from the database using the provided slug or MongoDB object ID.
 * The product is soft-deleted by marking it as deleted, ensuring it can be restored if needed.
 * The method handles errors and returns a success response when the deletion is successful.
 *
 * @param {Object} req - Express request object.
 * @param {String} req.params.product - The ID or slug of the product to delete.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response indicating the product was deleted.
 * @throws {Error} 404 - If no product is found with the provided identifier.
 * @throws {Error} 500 - If an error occurs during the deletion process.
 */
export const deleteSingleProduct = async (
	req: Request<{ product: string }, FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
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
 * @summary Restores a single product by its ID or slug.
 * @description This method restores a product that was previously soft-deleted from the database.
 * The method handles errors and returns a success response when the product is successfully restored.
 *
 * @param {Object} req - Express request object.
 * @param {String} req.params.product - The ID or slug of the product to restore.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response indicating the product was restored.
 * @throws {Error} 404 - If no product is found with the provided identifier.
 * @throws {Error} 500 - If an error occurs during the restore process.
 */
export const restoreSingleProduct = async (
	req: Request<{ product: string }, FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
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
	const isTypeLatest = type === "latest";
	const isTypeFeatured = type === "featured";
	const isTypeOnSale = type === "onSale";
	const isTypeTopRated = type === "topRated";

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
