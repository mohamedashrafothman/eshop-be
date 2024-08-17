import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body } from "express-validator";
import httpStatus from "http-status";
import multer, { FileFilterCallback } from "multer";
import Attachment from "../models/Attachment";
import Category from "../models/Category";
import StorageEngine from "../services/storage";
import { formatResponseObject, handleFileToUpload } from "../utils/helpers";
import vars from "../utils/vars";

export const validator = (method: string) => {
	switch (method) {
		case "create":
		case "update":
			return [
				body("name").trim().escape().notEmpty().withMessage("You must supply a name!"),
				body("description")
					.trim()
					.escape()
					.notEmpty()
					.withMessage("You must supply a street!"),
				body("icon").notEmpty().withMessage("You must add an icon!"),
				body("parent").optional().notEmpty().withMessage("You must supply a parent!"),
			];
		default:
			return [];
	}
};

export const uploadCategoryIcon = async (req: Request, res: Response, next: NextFunction) => {
	const storageEngine = new StorageEngine({
		accept: ["image"],
		square: true,
		quality: 50,
		fileHashName: true,
		uploadPath: `${vars.storage.uploadPath}/categories`,
		uploadBasePath: "",
	});

	const imageUpload = multer({
		storage: storageEngine,
		limits: { files: 1, fileSize: 1024 * 1024 * Number(vars.storage.allowedFileSizeInMB) },
		fileFilter: (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
			// supported image file mimetype
			const isFileTypeValid = storageEngine.options.accept?.some((item) =>
				file.mimetype?.startsWith(item)
			);

			// throw error for invalid files
			if (!isFileTypeValid) return cb(Error("That fileType isn't allowed!"));

			// allow supported image files
			cb(null, true);
		},
	});

	imageUpload.single("icon")(req, res, async (err) => {
		if (err) return next(err);
		req.body.icon = req.file;
		next();
	});
};

export const postNewCategory = async (req: Request, res: Response, next: NextFunction) => {
	const [createdAttachmentError, createdAttachment] = await to(
		Attachment.create(
			handleFileToUpload(
				req.body.icon,
				`${req.protocol}://${req.hostname}${req.app.get("port") ? `:${req.app.get("port")}` : ""}`
			)
		)
	);
	if (createdAttachmentError) return next(createdAttachmentError);

	const [createdCategoryError, createdCategory] = await to(
		Category.create({ ...req.body, icon: createdAttachment?._id })
	);
	if (createdCategoryError) return next(createdCategoryError);

	if (req.body?.parent) {
		const [updatedParentCategoryError, _updatedParentCategory] = await to(
			Category.updateOne(
				{ _id: req.body.parent },
				{ $addToSet: { children: createdCategory?._id } }
			)
		);
		if (updatedParentCategoryError) return next(updatedParentCategoryError);
	}

	req.flash("success", "Category created successfully.");
	res.status(httpStatus.CREATED).json(
		formatResponseObject({
			status: httpStatus.CREATED,
			entities: { data: createdCategory },
			flashes: req.flash(),
		})
	);
};

export const getCategories = async (req: Request, res: Response, next: NextFunction) => {
	const { q, deleted, ...query } = req.query || {};
	const querySearchFields = ["name", "description"];
	const sort = [
		{ name: "Name A-Z", value: { name: 1 } },
		{ name: "Name Z-A", value: { name: -1 } },
		{ name: "Created Date Ascending", value: { createdAt: 1 } },
		{ name: "Created Date Descending", value: { createdAt: -1 } },
	];

	const [paginatedCategoriesError, paginatedCategories] = await to(
		Category.paginate(
			{
				...((q && {
					$or: querySearchFields.map((item) => ({
						[item]: { $regex: String(q).toLowerCase() || "", $options: "i" },
					})),
				}) ||
					{}),
				...(([vars.auth.roles.superAdmin, vars.auth.roles.admin]?.includes(
					req.user?.role || ""
				) &&
					deleted && { deleted }) ||
					{}),
				parent: { $size: 0 },
			},
			{ ...query }
		)
	);
	if (paginatedCategoriesError) return next(paginatedCategoriesError);

	const { docs, ...pagination } = paginatedCategories;

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

export const getSingleCategory = async (req: Request, res: Response, next: NextFunction) => {};

export const updateSingleCategory = async (req: Request, res: Response, next: NextFunction) => {};

export const deleteSingleCategory = async (req: Request, res: Response, next: NextFunction) => {};
