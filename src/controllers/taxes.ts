import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body, ValidationChain } from "express-validator";
import httpStatus from "http-status";
import mongoose from "mongoose";
import isMongoId from "validator/lib/isMongoId";
import Tax from "../models/Tax";
import { formatResponseObject, handleTransactionError } from "../utils/helpers";

/**
 * Validates the input fields based on the method provided.
 */
export const validator = (method: "create" | "update"): ValidationChain[] => {
	switch (method) {
		case "create":
			return [
				body("name")
					.trim()
					.escape()
					.notEmpty()
					.withMessage("You must supply a name!")
					.isLength({ max: 100 })
					.withMessage("Name must be at most 100 characters long!"),
				body("description")
					.trim()
					.escape()
					.optional()
					.notEmpty()
					.withMessage("You must supply a description!")
					.isLength({ max: 1000 }),
				body("rate")
					.isFloat({ min: 0 })
					.withMessage("Rate must be greater than or equal to 0!")
					.notEmpty()
					.withMessage("Rate is required!"),
			];
		case "update":
			return [
				body("name")
					.trim()
					.escape()
					.optional()
					.notEmpty()
					.withMessage("You must supply a name!")
					.isLength({ max: 100 })
					.withMessage("Name must be at most 100 characters long!"),
				body("description")
					.trim()
					.escape()
					.optional()
					.notEmpty()
					.withMessage("You must supply a description!")
					.isLength({ max: 1000 }),
				body("rate")
					.optional()
					.isFloat({ min: 0 })
					.withMessage("Rate must be greater than or equal to 0!")
					.notEmpty()
					.withMessage("Rate is required!"),
			];
		default:
			return [];
	}
};

/**
 * @summary Creates a new tax entry in the database.
 * @description Handles the creation of a new tax entity using the data provided in the request body.
 * This method starts a MongoDB transaction to ensure data integrity during the tax creation process.
 * If an error occurs, the transaction is aborted and an error response is returned.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.body - The payload containing details for the new tax entity.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {void} 201 - Success response with the created tax entity.
 *   * @property {Object} entities.data - The newly created tax entity.
 * @throws {Error} 500 - Returns an error if any issue occurs during the creation process or if the transaction fails.
 */
export const postNewTax = async (req: Request, res: Response, next: NextFunction) => {
	// start transaction
	const session = await mongoose.startSession();
	session.startTransaction();

	const [taxError, tax] = await to(Tax.create([{ ...(req.body || {}) }], { session }));
	if (taxError) {
		handleTransactionError(session);
		return next(taxError);
	}

	// commit the transaction
	await session.commitTransaction();
	session.endSession();

	req.flash("success", "Tax created successfully.");
	res.status(httpStatus.CREATED).json(
		formatResponseObject({
			status: httpStatus.CREATED,
			entities: { data: tax[0] },
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Retrieves a list of tax entries with optional filters and pagination.
 * @description Fetches tax entries from the database based on search queries,
 * deletion status, and other filtering criteria. Supports pagination, sorting,
 * and searching across specific fields such as tax name and description.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.query - Query parameters for filtering and pagination.
 * @param {String} [req.query.q] - Search query to match against tax name and description.
 * @param {Boolean} [req.query.deleted] - Flag to include deleted tax entries in the response.
 * @param {Object} [req.query.page] - Pagination page number.
 * @param {Object} [req.query.limit] - Pagination limit for the number of entries per page.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with a list of taxes and pagination metadata.
 *   * @property {Array<Object>} entities.data - The list of retrieved tax entries.
 *   * @property {Object} entities.meta - Pagination and sorting metadata.
 *   * @property {Object} entities.meta.pagination - Pagination details for the tax list.
 *   * @property {Array<Object>} entities.meta.sort - Available sort options for the taxes.
 * @throws {Error} 500 - Returns an error if any issue occurs during the retrieval process.
 */
export const getTaxes = async (req: Request, res: Response, next: NextFunction) => {
	const { q, deleted, ...query } = req.query || {};
	const isFilteredByDeleted = "deleted" in req.query;
	const querySearchFields = ["name", "description"];
	const sort = [
		{ name: "Name A-Z", value: { name: 1 } },
		{ name: "Name Z-A", value: { name: -1 } },
		{ name: "Created Date Ascending", value: { createdAt: 1 } },
		{ name: "Created Date Descending", value: { createdAt: -1 } },
	];

	const [paginatedTaxesError, paginatedTaxes] = await to(
		Tax.paginate(
			{
				...((q && {
					$or: querySearchFields.map((item) => ({
						[item]: { $regex: String(q).toLowerCase() || "", $options: "i" },
					})),
				}) ||
					{}),
				...((isFilteredByDeleted && { deleted: Boolean(deleted) }) || {}),
			},
			{ ...query }
		)
	);
	if (paginatedTaxesError) return next(paginatedTaxesError);

	const { docs, ...pagination } = paginatedTaxes;

	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: [...(docs || [])], meta: { pagination, sort } },
		})
	);
};

/**
 * @summary Retrieves a single tax entry by its slug or ID.
 * @description This method fetches a single tax record from the database using either the tax slug or the MongoDB object ID. If the provided identifier is a valid MongoDB ID, it will attempt to find the tax by its ID; otherwise, it will search by the slug. It also accounts for deleted tax records.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.params - Route parameters.
 * @param {String} req.params.tax - The slug or ID of the tax entry to retrieve.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with the retrieved tax data.
 *   * @property {Object} entities.data - The retrieved tax object.
 * @throws {Error} 404 - If no tax is found with the provided identifier.
 * @throws {Error} 500 - If an error occurs during the retrieval process.
 */
export const getSingleTax = async (req: Request, res: Response, next: NextFunction) => {
	const { tax: taxIdentifier } = req.params || {};
	const [taxError, tax] = await to(
		Tax.findOneWithDeleted({
			$or: [
				{ slug: taxIdentifier },
				...(isMongoId(taxIdentifier) ? [{ _id: taxIdentifier }] : []),
			],
		})
	);
	if (taxError) return next(taxError);
	if (!tax) return next();

	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, entities: { data: tax } })
	);
};

/**
 * @summary Updates a single tax entry by its slug or ID.
 * @description This method updates an existing tax record in the database using the provided slug or MongoDB object ID. The tax entry is updated with the new data from the request body. The method also handles updating deleted tax entries and ensures the operation is wrapped within a MongoDB transaction for atomicity.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.params - Route parameters.
 * @param {String} req.params.tax - The slug or ID of the tax entry to update.
 * @param {Object} req.body - The updated data for the tax entry.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with the updated tax data.
 *   * @property {Object} entities.data - The updated tax object.
 * @throws {Error} 404 - If no tax is found with the provided identifier.
 * @throws {Error} 500 - If an error occurs during the update process.
 */
export const updateSingleTax = async (req: Request, res: Response, next: NextFunction) => {
	// start transaction
	const session = await mongoose.startSession();
	session.startTransaction();

	const { tax: taxIdentifier } = req.params || {};
	let [taxError, tax] = await to(
		Tax.findOneWithDeleted({
			$or: [
				{ slug: taxIdentifier },
				...(isMongoId(taxIdentifier) ? [{ _id: taxIdentifier }] : []),
			],
		}).session(session)
	);
	if (taxError || !tax) {
		handleTransactionError(session);
		return next(taxError);
	}

	tax = Object.assign(tax, { ...(req?.body || {}) });
	if (!tax) {
		handleTransactionError(session);
		return next();
	}

	const [saveError, newTax] = await to(tax.save({ session }));
	if (saveError) {
		handleTransactionError(session);
		return next(saveError);
	}

	// commit the transaction
	await session.commitTransaction();
	session.endSession();

	req.flash("success", "successfully updated.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: { ...(newTax?.toJSON() || {}) } },
			flashes: req.flash(),
		})
	);
};

/**
 * @summary Deletes a single tax entry by its slug or ID.
 * @description This method deletes a tax entry from the database using the provided slug or MongoDB object ID. The tax is soft-deleted by marking it as deleted, ensuring it can be restored if needed. The method handles errors and returns a success response when the deletion is successful.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.params - Route parameters.
 * @param {String} req.params.tax - The slug or ID of the tax entry to delete.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response indicating the tax was deleted.
 * @throws {Error} 404 - If no tax is found with the provided identifier.
 * @throws {Error} 500 - If an error occurs during the deletion process.
 */
export const deleteSingleTax = async (req: Request, res: Response, next: NextFunction) => {
	const { tax: taxIdentifier } = req.params || {};
	const [taxError, tax] = await to(
		Tax.findOne({
			$or: [
				{ slug: taxIdentifier },
				...(isMongoId(taxIdentifier) ? [{ _id: taxIdentifier }] : []),
			],
		})
	);
	if (taxError) return next(taxError);
	if (!tax) return next();

	const [deleteTaxError] = await to(Tax.deleteById(tax._id, req?.user?._id));
	if (deleteTaxError) return next(deleteTaxError);

	req.flash("success", "Successfully Deleted.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};

/**
 * @summary Restores a soft-deleted tax entry by its slug or ID.
 * @description This method restores a tax entry that has been soft-deleted (marked as deleted) by searching for the tax using its slug or MongoDB object ID. If a matching deleted tax is found, it is restored to an active state. The method handles errors and returns a success response when the restoration is successful.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.params - Route parameters.
 * @param {String} req.params.tax - The slug or ID of the tax entry to restore.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response indicating the tax was successfully restored.
 * @throws {Error} 404 - If no deleted tax is found with the provided identifier.
 * @throws {Error} 500 - If an error occurs during the restoration process.
 */
export const restoreSingleTax = async (req: Request, res: Response, next: NextFunction) => {
	const { tax: taxIdentifier } = req.params || {};
	const singleTaxQuery = {
		$or: [
			{ slug: taxIdentifier },
			...(isMongoId(taxIdentifier) ? [{ _id: taxIdentifier }] : []),
		],
		deleted: true,
	};

	const [taxError, tax] = await to(Tax.findOneWithDeleted(singleTaxQuery));
	if (taxError) return next(taxError);
	if (!tax) return next();

	const [restoreTaxError] = await to(Tax.restore(singleTaxQuery));
	if (restoreTaxError) return next(restoreTaxError);

	req.flash("success", "Successfully Restored.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};
