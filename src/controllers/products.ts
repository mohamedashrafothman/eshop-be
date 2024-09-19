import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body } from "express-validator";
import httpStatus from "http-status";
import multer, { FileFilterCallback } from "multer";
import isHexColor from "validator/lib/isHexColor";
import IProduct from "../interfaces/Product.interface";
import Attachment, { IAttachmentDocument } from "../models/Attachment";
import Brand, { IBrandDocument } from "../models/Brand";
import Category, { ICategoryDocument } from "../models/Category";
import Product from "../models/Product";
import StorageEngine from "../services/storage";
import { formatResponseObject, handleFileToUpload } from "../utils/helpers";
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
				// body("thumbnail").notEmpty().withMessage("Thumbnail is required!"),
				// body("images")
				// 	.optional()
				// 	.notEmpty()
				// 	.isArray()
				// 	.withMessage("at least one Image is required!"),
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
				// body("thumbnail").optional().notEmpty().withMessage("Thumbnail is required!"),
				// body("images")
				// 	.optional()
				// 	.isArray()
				// 	.notEmpty()
				// 	.withMessage("at least one Image is required!"),
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
		quality: 50,
		fileHashName: true,
		responsive: true,
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
		if (req.files) req.body = { ...req.body, ...(req.files || {}) };
		next();
	});
};

export const postNewProduct = async (req: Request, res: Response, next: NextFunction) => {
	// upload images to storage
	const attachments = [...(req.body?.thumbnail || []), ...(req.body?.images || [])];
	let createdAttachmentsError: Error | null;
	let createdAttachments: IAttachmentDocument[] | undefined;
	if (attachments.length) {
		[createdAttachmentsError, createdAttachments] = await to(
			Promise.all(
				attachments.map((image: Express.Multer.File) =>
					Attachment.create(
						handleFileToUpload(
							image,
							`${req.protocol}://${req.hostname}${req.app.get("port") ? `:${req.app.get("port")}` : ""}`
						)
					)
				)
			)
		);
		if (createdAttachmentsError) return next(createdAttachmentsError);
	}

	// create product
	const files = createdAttachments?.map(({ _id }) => _id) as (
		| IAttachmentDocument["_id"]
		| undefined
	)[];
	const thumbnail = files?.[0] || undefined;
	const images = files?.slice(1) || [];
	const [createdProductError, createdProduct] = await to(
		Product.create({
			...(req.body || {}),
			...(thumbnail ? { thumbnail: thumbnail } : {}),
			...(images?.length ? { images: images } : {}),
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

export const getProducts = async (req: Request, res: Response, next: NextFunction) => {
	const {
		q,
		deleted,
		categories,
		brands,
		sizes,
		colors,
		minPrice = 0,
		maxPrice = 0,
		...query
	} = req.query || {};
	const isFilteredByDeleted = "deleted" in req.query;
	const querySearchFields = ["name", "description"];
	const sort = [
		{ name: "Name A-Z", value: { name: 1 } },
		{ name: "Name Z-A", value: { name: -1 } },
		{ name: "Price Ascending", value: { "price.amount": 1 } },
		{ name: "Price Descending", value: { "price.amount": -1 } },
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
			{ ...query }
		)
	);
	if (paginatedProductsError) return next(paginatedProductsError);

	const { docs, ...pagination } = paginatedProducts;

	return res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: {
				data: [...(docs || [])],
				meta: { pagination, sort },
			},
		})
	);
};

export const getSingleProduct = async (req: Request, res: Response, next: NextFunction) => {};

export const updateSingleProduct = async (req: Request, res: Response, next: NextFunction) => {};

export const deleteSingleProduct = async (req: Request, res: Response, next: NextFunction) => {};

export const restoreSingleProduct = async (req: Request, res: Response, next: NextFunction) => {};
