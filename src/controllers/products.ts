import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body } from "express-validator";
import httpStatus from "http-status";
import multer, { FileFilterCallback } from "multer";
import isHexColor from "validator/lib/isHexColor";
import isMongoId from "validator/lib/isMongoId";
import IProduct from "../interfaces/Product.interface";
import Attachment, { IAttachmentDocument } from "../models/Attachment";
import Brand, { IBrandDocument } from "../models/Brand";
import Category, { ICategoryDocument } from "../models/Category";
import Product from "../models/Product";
import StorageEngine from "../services/storage";
import { deleteFileFromDisk, formatResponseObject, handleFileToUpload } from "../utils/helpers";
import vars from "../utils/vars";

export const validator = (method: string) => {
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
				body("brand").notEmpty().withMessage("Brand is required!"),
				body("category").notEmpty().withMessage("Category is required!"),
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
				body("brand").optional().notEmpty().withMessage("Brand is required!"),
				body("category").optional().notEmpty().withMessage("Category is required!"),
			];
		default:
			return [];
	}
};

export const uploadImages = async (req: Request, res: Response, next: NextFunction) => {
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
			req.body = { ...req.body, thumbnail: thumbnail[0], images };
		}
		next();
	});
};

/**
 * @summary Creates a new product with associated images and categories.
 * @description This function handles the uploading of a product's thumbnail and images, creates a new product in the database, and associates it with the specified category and brand. It sends a success response with the created product details, including associated category and brand information, or passes any errors to the next middleware.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.body - The request body containing product data.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {void} 201 - Success response with the created product details.
 *   * @property {Object} entities - Object containing the product data.
 *   * @property {Object} entities.data - The created product with associated category and brand, if applicable.
 * @throws {Error} 500 - Returns an error if any issue occurs during the creation process.
 * @throws {Error} 404 - Returns an error if the specified category or brand is not found.
 */
export const postNewProduct = async (req: Request, res: Response, next: NextFunction) => {
	// upload images to storage
	let createdThumbnailError: Error | null;
	let createdThumbnail: IAttachmentDocument | undefined;
	if (req.body?.thumbnail) {
		[createdThumbnailError, createdThumbnail] = await to(
			Attachment.create(
				handleFileToUpload(
					req.body.thumbnail,
					`${req.protocol}://${req.hostname}${req.app.get("port") ? `:${req.app.get("port")}` : ""}`
				)
			)
		);
		if (createdThumbnailError) return next(createdThumbnailError);
	}

	let createdImagesError: Error | null;
	let createdImages: IAttachmentDocument[] | undefined;
	if (req.body?.images && req.body.images.length) {
		[createdImagesError, createdImages] = await to(
			Promise.all(
				req.body?.images.map((image: Express.Multer.File) =>
					Attachment.create(
						handleFileToUpload(
							image,
							`${req.protocol}://${req.hostname}${req.app.get("port") ? `:${req.app.get("port")}` : ""}`
						)
					)
				)
			)
		);
		if (createdImagesError) return next(createdImagesError);
	}

	// create product
	const thumbnail = createdThumbnail?._id || undefined;
	const images = createdImages?.map(({ _id }) => _id) || [];
	const [createdProductError, createdProduct] = await to(
		Product.create({
			...(req.body || {}),
			...(thumbnail ? { thumbnail } : {}),
			...(images?.length ? { images } : {}),
			user: req.user?._id,
		})
	);
	if (createdProductError) return next(createdProductError);

	// add product to category
	let newCategory: ICategoryDocument | undefined;
	let saveCategoryError: Error | null;
	let [categoryError, category] = await to(Category.findOne({ _id: req.body.category }));
	if (categoryError) return next(categoryError);
	if (category) {
		category = Object.assign(category, {
			products: [...(category?.products || []), createdProduct?._id],
		});

		[saveCategoryError, newCategory] = await to(category.save());
		if (saveCategoryError) return next(saveCategoryError);
	}

	// add product to brand
	let newBrand: IBrandDocument | undefined;
	let saveBrandError: Error | null;
	let [brandError, brand] = await to(Brand.findOne({ _id: req.body.brand }));
	if (brandError) return next(brandError);
	if (brand) {
		brand = Object.assign(brand, {
			products: [...(brand?.products || []), createdProduct?._id],
		});

		[saveBrandError, newBrand] = await to(brand.save());
		if (saveBrandError) return next(saveBrandError);
	}

	req.flash("success", "Product created successfully.");
	res.status(httpStatus.CREATED).json(
		formatResponseObject({
			status: httpStatus.CREATED,
			entities: {
				data: {
					...(createdProduct?.toJSON() || {}),
					...(newCategory && { category: newCategory }),
					...(newBrand && { brand: newBrand }),
				},
			},
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Retrieves a list of products based on filters and search criteria.
 * @description Fetches products from the database using various filters, including search queries, categories, brands, sizes, colors, and price ranges. Supports pagination and sorting options. If the user is an admin or super admin, deleted products can also be included in the results.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.query - Query parameters for filtering and sorting.
 * @param {string} [req.query.q] - Search query to match against product name and description.
 * @param {boolean} [req.query.deleted] - Flag to include deleted products in the response.
 * @param {Array<string>} [req.query.categories] - List of category identifiers to filter products.
 * @param {Array<string>} [req.query.brands] - List of brand identifiers to filter products.
 * @param {Array<string>} [req.query.sizes] - List of sizes to filter products.
 * @param {Array<string>} [req.query.colors] - List of colors to filter products.
 * @param {number} [req.query.minPrice] - Minimum price for filtering products.
 * @param {number} [req.query.maxPrice] - Maximum price for filtering products.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {void} 200 - Success response with a list of products and pagination metadata.
 *   * @property {Array<Object>} entities.data - The list of retrieved products.
 *   * @property {Object} meta - Pagination and sort metadata.
 *   * @property {Object} meta.pagination - Pagination details for the product list.
 *   * @property {Array<Object>} meta.sort - Available sort options for the products.
 * @throws {Error} 500 - Returns an error if any issue occurs during the retrieval process.
 */
export const getProducts = async (req: Request, res: Response, next: NextFunction) => {
	const {
		q,
		deleted,
		categories = [],
		brands = [],
		sizes = [],
		colors = [],
		minPrice = 0,
		maxPrice = 0,
		...query
	} = req.query || {};
	const isFilteredByDeleted = "deleted" in req.query;
	const querySearchFields = ["name", "description"];
	const sort = [
		{ name: "Name A-Z", value: { name: 1 } },
		{ name: "Name Z-A", value: { name: -1 } },
		{ name: "Price Ascending", value: { price: 1 } },
		{ name: "Price Descending", value: { price: -1 } },
		{ name: "Created Date Ascending", value: { createdAt: 1 } },
		{ name: "Created Date Descending", value: { createdAt: -1 } },
	];

	const [paginatedProductsError, paginatedProducts] = await to(
		Product.paginate(
			{
				...((q && {
					$or: querySearchFields.map((item) => ({
						[item]: { $regex: String(q).toLowerCase() || "", $options: "i" },
					})),
				}) ||
					{}),
				...(([vars.auth.roles.superAdmin, vars.auth.roles.admin].includes(
					req.user?.role || ""
				) &&
					isFilteredByDeleted && { deleted }) ||
					{}),
				...(categories && categories.length && { category: { $in: categories } }),
				...(brands && brands.length && { brand: { $in: brands } }),
				...(sizes && sizes.length && { sizes: { $in: sizes } }),
				...(colors &&
					colors.length && {
						$or: [
							{ "colors.name": { $in: colors } },
							{ "colors.value": { $in: colors } },
						],
					}),
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
			{
				...query,
				...(query.sort &&
					"price" in (query.sort as object) && {
						sort: {
							"price.sale": (query.sort as { price: any }).price,
							"price.normal": (query.sort as { price: any }).price,
						},
					}),
			}
		)
	);
	if (paginatedProductsError) return next(paginatedProductsError);

	const { docs, ...pagination } = paginatedProducts;

	return res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: [...(docs || [])], meta: { pagination, sort } },
		})
	);
};

/**
 * @summary Retrieves a single product by identifier.
 * @description Fetches a product based on the provided identifier, which can be a slug or a MongoDB ObjectId. The method used to find the product depends on the user's role (admin or super admin may include deleted products). If the product is found, it returns the product details; otherwise, it handles the error appropriately.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.params - URL parameters for the request.
 * @param {string} req.params.product - The product identifier, either a slug or a MongoDB ObjectId.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {void} 200 - Success response with the product details.
 *   * @property {Object} entities - Object containing the product data.
 *   * @property {Object} entities.data - The retrieved product.
 * @throws {Error} 500 - Returns an error if any issue occurs during the retrieval process.
 * @throws {Error} 404 - Returns an error if the product is not found.
 */
export const getSingleProduct = async (req: Request, res: Response, next: NextFunction) => {
	const { product: productIdentifier } = req.params || {};
	const findMethodName =
		req.user?.role &&
		[vars.auth.roles.superAdmin, vars.auth.roles.admin].includes(req.user.role || "")
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
	if (productError) return next(productError);
	if (!product) return next();

	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, entities: { data: product } })
	);
};

/**
 * @summary Updates an existing product by its identifier.
 * @description This endpoint updates a product's details, including its thumbnail, images, category, and brand. The product can be identified by a slug or MongoDB ObjectId. If images or thumbnails are provided, the old ones are replaced. The method also updates related category and brand associations if specified.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.params - URL parameters for the request.
 * @param {string} req.params.product - The product identifier, either a slug or MongoDB ObjectId.
 * @param {Object} req.body - The request body containing the product data.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {void} 200 - Success response with the updated product details.
 *    * @property {Object} entities - Contains the updated product data.
 *    * @property {Object} entities.data - The updated product.
 * @throws {Error} 500 - Internal server error if there's a problem updating the product.
 * @throws {Error} 404 - Product not found.
 */
export const updateSingleProduct = async (req: Request, res: Response, next: NextFunction) => {
	const { product: productIdentifier } = req.params || {};
	let [productError, product] = await to(
		Product.findOneWithDeleted({
			$or: [
				{ slug: productIdentifier },
				...(isMongoId(productIdentifier) ? [{ _id: productIdentifier }] : []),
			],
		})
	);
	if (productError) return next(productError);
	if (!product) return next();

	let createdThumbnailError: Error | null;
	let createdThumbnail: IAttachmentDocument | undefined;
	if (req.body?.thumbnail) {
		const [productThumbnailError, productThumbnail] = await to(
			Attachment.findOne({ _id: product?.thumbnail?._id || product?.thumbnail })
		);
		if (productThumbnailError) return next(productThumbnailError);

		if (productThumbnail?._id) {
			const [deletedProductThumbnailError] = await to(
				Attachment.deleteOne({ _id: productThumbnail._id })
			);
			if (deletedProductThumbnailError) return next(deletedProductThumbnailError);

			// delete file from disk if it exists
			deleteFileFromDisk(productThumbnail.path);
		}

		[createdThumbnailError, createdThumbnail] = await to(
			Attachment.create(
				handleFileToUpload(
					req.body.thumbnail,
					`${req.protocol}://${req.hostname}${req.app.get("port") ? `:${req.app.get("port")}` : ""}`
				)
			)
		);
		if (createdThumbnailError) return next(createdThumbnailError);
	}

	let createdImagesError: Error | null;
	let createdImages: IAttachmentDocument[] | undefined;
	if (req.body?.images && req.body.images.length) {
		const [productImagesError, productImages] = await to(
			Attachment.find({
				_id: {
					$in: product?.images?.map((singleImage) => singleImage?._id || singleImage),
				},
			})
		);
		if (productImagesError) return next(productImagesError);

		if (productImages?.length) {
			const [deletedProductThumbnailError] = await to(
				Attachment.delete({ _id: { $in: productImages.map((_id) => _id) } })
			);
			if (deletedProductThumbnailError) return next(deletedProductThumbnailError);

			// delete file from disk if it exists
			productImages?.forEach(({ path }) => path && deleteFileFromDisk(path));
		}

		[createdImagesError, createdImages] = await to(
			Promise.all(
				req.body?.images.map((image: Express.Multer.File) =>
					Attachment.create(
						handleFileToUpload(
							image,
							`${req.protocol}://${req.hostname}${req.app.get("port") ? `:${req.app.get("port")}` : ""}`
						)
					)
				)
			)
		);
		if (createdImagesError) return next(createdImagesError);
	}

	// update product's category if category is provided
	let updatedProductCategoryError: Error | null;
	if (req.body?.category && req.body.category !== product.category) {
		const [categoryUpdateError] = await to(
			Category.updateOne({ _id: product.category }, { $pull: { products: product._id } })
		);
		if (categoryUpdateError) return next(categoryUpdateError);

		let [categoryError, category] = await to(Category.findOne({ _id: req.body.category }));
		if (categoryError) return next(categoryError);

		if (category) {
			category = Object.assign(category, {
				products: [...(category?.products || []), product?._id],
			});

			[updatedProductCategoryError] = await to(category.save());
			if (updatedProductCategoryError) return next(updatedProductCategoryError);
		}
	}

	// update product's brand if brand is provided
	let updatedProductBrandError: Error | null;
	if (req.body?.brand && req.body.brand !== product.brand) {
		const [brandUpdateError] = await to(
			Brand.updateOne({ _id: product.brand }, { $pull: { products: product._id } })
		);
		if (brandUpdateError) return next(brandUpdateError);

		let [brandError, brand] = await to(Brand.findOne({ _id: req.body.brand }));
		if (brandError) return next(brandError);

		if (brand) {
			brand = Object.assign(brand, {
				products: [...(brand?.products || []), product?._id],
			});

			[updatedProductBrandError] = await to(brand.save());
			if (updatedProductBrandError) return next(updatedProductBrandError);
		}
	}

	product = Object.assign(product, {
		...(req?.body || {}),
		...(createdThumbnail?._id ? { thumbnail: createdThumbnail._id } : {}),
		...(createdImages?.length ? { images: createdImages?.map(({ _id }) => _id) } : {}),
	});
	if (!product) return next();

	const [saveError, newProduct] = await to(product.save());
	if (saveError) return next(saveError);

	req.flash("success", "successfully updated.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: { ...(newProduct?.toJSON() || {}) } },
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Deletes a single product by identifier.
 * @description Deletes a product based on the provided identifier, which can be a slug or an ObjectId. Upon successful deletion, returns a success message.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.params - URL parameters for the request.
 * @param {string} req.params.product - The product identifier, either a slug or an ObjectId.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {void} 200 - Success response with a flash message.
 *   * @property {string} flashes.success - Success message indicating the product was successfully deleted.
 * @throws {Error} 500 - Returns an error if any issue occurs during the deletion process.
 * @throws {Error} 404 - Returns an error if the product is not found.
 */
export const deleteSingleProduct = async (req: Request, res: Response, next: NextFunction) => {
	const { product: productIdentifier } = req.params || {};
	const [productError, product] = await to(
		Product.findOne({
			$or: [
				{ slug: productIdentifier },
				...(isMongoId(productIdentifier) ? [{ _id: productIdentifier }] : []),
			],
		})
	);
	if (productError) return next(productError);
	if (!product) return next();

	const [deleteProductError] = await to(Product.deleteById(product._id, req?.user?._id));
	if (deleteProductError) return next(deleteProductError);

	req.flash("success", "Successfully Deleted.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};

/**
 * @summary Restores a single product by identifier.
 * @description Restores a product that has been soft-deleted, based on the provided identifier, which can be a slug or an ObjectId. Upon successful restoration, returns a success message.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.params - URL parameters for the request.
 * @param {string} req.params.product - The product identifier, either a slug or an ObjectId.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {void} 200 - Success response with a flash message.
 *   * @property {string} flashes.success - Success message indicating the product was successfully restored.
 * @throws {Error} 500 - Returns an error if any issue occurs during the restoration process.
 * @throws {Error} 404 - Returns an error if the product is not found or if the product was not soft-deleted.
 */
export const restoreSingleProduct = async (req: Request, res: Response, next: NextFunction) => {
	const { product: productIdentifier } = req.params || {};
	const singleProductQuery = {
		$or: [
			{ slug: productIdentifier },
			...(isMongoId(productIdentifier) ? [{ _id: productIdentifier }] : []),
		],
		deleted: true,
	};

	const [productError, product] = await to(Product.findOneWithDeleted(singleProductQuery));
	if (productError) return next(productError);
	if (!product) return next();

	const [restoreProductError] = await to(Product.restore(singleProductQuery));
	if (restoreProductError) return next(restoreProductError);

	req.flash("success", "Successfully Restored.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};
