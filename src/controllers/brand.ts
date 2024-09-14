import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body } from "express-validator";
import httpStatus from "http-status";
import multer, { FileFilterCallback } from "multer";
import Attachment, { IAttachmentDocument } from "../models/Attachment";
import Brand from "../models/Brand";
import StorageEngine from "../services/storage";
import { deleteFileFromDisk, formatResponseObject, handleFileToUpload } from "../utils/helpers";
import vars from "../utils/vars";

export const validator = (method: string) => {
	switch (method) {
		case "create":
			return [
				body("name").trim().escape().notEmpty().withMessage("You must supply a name!"),
				body("description")
					.trim()
					.escape()
					.optional()
					.notEmpty()
					.withMessage("You must supply a description!"),
				body("logo").notEmpty().withMessage("You must add an logo!"),
			];
		case "update":
			return [
				body("name")
					.trim()
					.escape()
					.optional()
					.notEmpty()
					.withMessage("You must supply a name!"),
				body("description")
					.trim()
					.escape()
					.optional()
					.notEmpty()
					.withMessage("You must supply a description!"),
				body("logo").optional().notEmpty().withMessage("Logo can't be empty!"),
			];
		default:
			return [];
	}
};

/**
 * @summary Uploads a brand logo image.
 * @description Handles the uploading of a brand's logo image. The image is validated to be of type "image", and the upload is restricted to files with a maximum size defined in the configuration.
 * The uploaded image is resized to be square, and the quality is set to 50%. The file name is hashed to ensure uniqueness.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.file - The uploaded file object containing details about the logo image.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {void} 200 - Success response indicating the logo was uploaded successfully.
 *   * @property {Object} req.body.logo - The uploaded logo file data.
 *   * @throws {Error} 400 - Returns an error if the file type is invalid or the file size exceeds the limit.
 */
export const uploadBrandLogo = async (req: Request, res: Response, next: NextFunction) => {
	const storageEngine = new StorageEngine({
		accept: ["image"],
		square: true,
		quality: 50,
		fileHashName: true,
		uploadPath: `${vars.storage.uploadPath}/brands`,
		uploadBasePath: "",
	});

	const imageUpload = multer({
		storage: storageEngine,
		limits: { files: 1, fileSize: 1024 * 1024 * Number(vars.storage.allowedFileSizeInMB) },
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

	imageUpload.single("logo")(req, res, async (err) => {
		if (err) return next(err);
		if (req.file) req.body.logo = req.file;
		next();
	});
};

/**
 * @summary Creates a new brand.
 * @description Handles the creation of a new brand in the system. Optionally uploads and attaches a logo image if provided in the request.
 * If a logo image is provided, it will be uploaded and linked to the brand. The brand is then saved to the database.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.body - The data for creating a new brand. Optionally includes a `logo` file for brand image.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {void} 201 - Success response with the newly created brand data.
 *   * @property {object} entities.data - The created brand object.
 *   * @property {Array} flashes - Success message for brand creation.
 * @throws {Error} 500 - Returns an error if the brand or logo creation fails.
 */
export const postNewBrand = async (req: Request, res: Response, next: NextFunction) => {
	let createdAttachmentError: Error | null;
	let createdAttachment: IAttachmentDocument | undefined;
	if (req.body?.logo) {
		[createdAttachmentError, createdAttachment] = await to(
			Attachment.create(
				handleFileToUpload(
					req.body.logo,
					`${req.protocol}://${req.hostname}${req.app.get("port") ? `:${req.app.get("port")}` : ""}`
				)
			)
		);
		if (createdAttachmentError) return next(createdAttachmentError);
	}

	const [createdBrandError, createdBrand] = await to(
		Brand.create({
			...(req.body || {}),
			...(createdAttachment?._id ? { logo: createdAttachment._id } : {}),
		})
	);
	if (createdBrandError) return next(createdBrandError);

	req.flash("success", "Brand created successfully.");
	res.status(httpStatus.CREATED).json(
		formatResponseObject({
			status: httpStatus.CREATED,
			entities: { data: createdBrand },
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Retrieves a paginated list of brands.
 * @description Fetches brands based on query parameters. Supports filtering by name, description, and deletion status. Also includes pagination and sorting options.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.query - The query parameters for filtering and pagination.
 * @param {string} [req.query.q] - Search term for filtering brands by name or description.
 * @param {boolean} [req.query.deleted] - Flag to include deleted brands.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {void} 200 - Success response with paginated brands and metadata.
 *   * @property {Array} entities.data - List of retrieved brand objects.
 *   * @property {Object} entities.meta.pagination - Pagination metadata (total docs, page, etc.).
 *   * @property {Array} entities.meta.sort - Available sort options for the brands.
 * @throws {Error} 500 - Returns an error if the brand retrieval fails.
 */
export const getBrands = async (req: Request, res: Response, next: NextFunction) => {
	const { q, deleted, ...query } = req.query || {};
	const isFilteredByDeleted = "deleted" in req.query;
	const querySearchFields = ["name", "description"];
	const sort = [
		{ name: "Name A-Z", value: { name: 1 } },
		{ name: "Name Z-A", value: { name: -1 } },
		{ name: "Created Date Ascending", value: { createdAt: 1 } },
		{ name: "Created Date Descending", value: { createdAt: -1 } },
	];

	const [paginatedBrandsError, paginatedBrands] = await to(
		Brand.paginate(
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
			},
			{ ...query }
		)
	);
	if (paginatedBrandsError) return next(paginatedBrandsError);

	const { docs, ...pagination } = paginatedBrands;

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

/**
 * @summary Retrieves a single brand by identifier.
 * @description Fetches a brand based on the provided identifier, which can be either a slug or an ObjectId. Handles errors and returns the brand data if found.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.params - URL parameters for the request.
 * @param {string} req.params.brand - The brand identifier, either a slug or an ObjectId.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {void} 200 - Success response with the brand data.
 *   * @property {object} entities.data - The retrieved brand object.
 * @throws {Error} 500 - Returns an error if the brand retrieval fails.
 * @throws {Error} 404 - Returns an error if no brand is found.
 */
export const getSingleBrand = async (req: Request, res: Response, next: NextFunction) => {
	const { brand: brandIdentifier } = req.params || {};
	const [brandError, brand] = await to(
		Brand.findOneWithDeleted({
			$or: [
				{ slug: brandIdentifier },
				...(brandIdentifier.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: brandIdentifier }] : []),
			],
		})
	);
	if (brandError) return next(brandError);
	if (!brand) return next();

	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, entities: { data: brand } })
	);
};

/**
 * @summary Updates a single brand by identifier.
 * @description Updates a brand based on the provided identifier, which can be a slug or an ObjectId. Handles logo updates by replacing existing logos and manages file deletions. Returns the updated brand data upon success.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.params - URL parameters for the request.
 * @param {string} req.params.brand - The brand identifier, either a slug or an ObjectId.
 * @param {Object} req.body - The data to update the brand with.
 * @param {Object} [req.body.logo] - Optional logo data to update the brand's logo.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {void} 200 - Success response with the updated brand data.
 *   * @property {object} entities.data - The updated brand object.
 *   * @property {string} flashes.success - Success message after the update.
 * @throws {Error} 500 - Returns an error if any issue occurs during the update process.
 * @throws {Error} 404 - Returns an error if the brand is not found.
 */
export const updateSingleBrand = async (req: Request, res: Response, next: NextFunction) => {
	const { brand: brandIdentifier } = req.params || {};
	let [brandError, brand] = await to(
		Brand.findOneWithDeleted({
			$or: [
				{ slug: brandIdentifier },
				...(brandIdentifier.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: brandIdentifier }] : []),
			],
		})
	);
	if (brandError) return next(brandError);
	if (!brand) return next();

	let createdAttachmentError: Error | null;
	let createdAttachment: IAttachmentDocument | undefined;
	if (req.body?.logo) {
		const [brandAttachmentError, brandAttachment] = await to(
			Attachment.findOne({ _id: brand?.logo })
		);
		if (brandAttachmentError) return next(brandAttachmentError);

		if (brandAttachment?.id) {
			const [deletedBrandAttachmentError] = await to(
				Attachment.deleteOne({ _id: brandAttachment.id })
			);
			if (deletedBrandAttachmentError) return next(deletedBrandAttachmentError);

			// delete file from disk if it exists
			deleteFileFromDisk(brandAttachment.path);
		}

		[createdAttachmentError, createdAttachment] = await to(
			Attachment.create(
				handleFileToUpload(
					req.body.icon,
					`${req.protocol}://${req.hostname}${req.app.get("port") ? `:${req.app.get("port")}` : ""}`
				)
			)
		);
		if (createdAttachmentError) return next(createdAttachmentError);
	}

	brand = Object.assign(brand, {
		...(req?.body || {}),
		...(createdAttachment?._id ? { icon: createdAttachment._id } : {}),
	});
	if (!brand) return next();

	const [saveError, newBrand] = await to(brand.save());
	if (saveError) return next(saveError);

	req.flash("success", "successfully updated.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: { ...(newBrand?.toJSON() || {}) } },
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Deletes a single brand by identifier.
 * @description Deletes a brand based on the provided identifier, which can be a slug or an ObjectId. Upon successful deletion, returns a success message.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.params - URL parameters for the request.
 * @param {string} req.params.brand - The brand identifier, either a slug or an ObjectId.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {void} 200 - Success response with a flash message.
 *   * @property {string} flashes.success - Success message indicating the brand was successfully deleted.
 * @throws {Error} 500 - Returns an error if any issue occurs during the deletion process.
 * @throws {Error} 404 - Returns an error if the brand is not found.
 */
export const deleteSingleBrand = async (req: Request, res: Response, next: NextFunction) => {
	const { brand: brandIdentifier } = req.params || {};
	const [brandError, brand] = await to(
		Brand.findOne({
			$or: [
				{ slug: brandIdentifier },
				...(brandIdentifier.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: brandIdentifier }] : []),
			],
		})
	);
	if (brandError) return next(brandError);
	if (!brand) return next();

	const [deleteBrandError] = await to(Brand.deleteById(brand._id, req?.user?.id));
	if (deleteBrandError) return next(deleteBrandError);

	req.flash("success", "Successfully Deleted.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};

/**
 * @summary Restores a single brand by identifier.
 * @description Restores a brand that has been soft-deleted, based on the provided identifier, which can be a slug or an ObjectId. Upon successful restoration, returns a success message.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.params - URL parameters for the request.
 * @param {string} req.params.brand - The brand identifier, either a slug or an ObjectId.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {void} 200 - Success response with a flash message.
 *   * @property {string} flashes.success - Success message indicating the brand was successfully restored.
 * @throws {Error} 500 - Returns an error if any issue occurs during the restoration process.
 * @throws {Error} 404 - Returns an error if the brand is not found or if the brand was not soft-deleted.
 */
export const restoreSingleBrand = async (req: Request, res: Response, next: NextFunction) => {
	const { brand: brandIdentifier } = req.params || {};
	const singleBrandQuery = {
		$or: [
			{ slug: brandIdentifier },
			...(brandIdentifier.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: brandIdentifier }] : []),
		],
		deleted: true,
	};

	const [brandError, brand] = await to(Brand.findOneWithDeleted(singleBrandQuery));
	if (brandError) return next(brandError);
	if (!brand) return next();

	const [restoreBrandError] = await to(Brand.restore(singleBrandQuery));
	if (restoreBrandError) return next(restoreBrandError);

	req.flash("success", "Successfully Restored.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};
