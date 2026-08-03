import to from "await-to-js";
import { NextFunction, Response } from "express";
import { body, ValidationChain } from "express-validator";
import httpStatus, { HttpStatus } from "http-status";
import mongoose, { ClientSession, PaginateOptions } from "mongoose";
import isMongoId from "validator/lib/isMongoId";
import { AuthenticatedRequest } from "../@types/express";
import ITax from "../interfaces/Tax.interface";
import Tax, { ITaxDocument } from "../models/Tax";
import {
	formatResponseObject,
	FormatResponseObjectType,
	handleTransactionError,
	type SortItemType,
} from "../utils/helpers";

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
					.isString()
					.withMessage("Name must be a string!")
					.notEmpty()
					.withMessage("You must supply a name!")
					.isLength({ max: 100 })
					.withMessage("Name must be at most 100 characters long!"),
				body("description")
					.trim()
					.escape()
					.optional()
					.isString()
					.withMessage("Description must be a string!")
					.notEmpty()
					.withMessage("You must supply a description!")
					.isLength({ max: 1000 }),
				body("rate")
					.isNumeric()
					.withMessage("Rate must be a number!")
					.custom((value, { req }) => {
						if (req.body.isPercentage) {
							if (value < 0 || value > 100) {
								throw new Error(
									"Rate must be between 0 and 100 when isPercentage is true."
								);
							}
						} else if (value < 0) {
							throw new Error("Rate must be a positive number.");
						}
						return true;
					})
					.notEmpty()
					.withMessage("Rate is required!"),
				body("isPercentage")
					.optional()
					.isBoolean()
					.withMessage("isPercentage must be a boolean value."),
			];
		case "update":
			return [
				body("name")
					.trim()
					.escape()
					.optional()
					.isString()
					.withMessage("Name must be a string!")
					.notEmpty()
					.withMessage("You must supply a name!")
					.isLength({ max: 100 })
					.withMessage("Name must be at most 100 characters long!"),
				body("description")
					.trim()
					.escape()
					.optional()
					.isString()
					.withMessage("Description must be a string!")
					.notEmpty()
					.withMessage("You must supply a description!")
					.isLength({ max: 1000 }),
				body("rate")
					.optional()
					.isNumeric()
					.withMessage("Rate must be a number!")
					.custom((value, { req }) => {
						if (req.body.isPercentage) {
							if (value < 0 || value > 100) {
								throw new Error(
									"Rate must be between 0 and 100 when isPercentage is true."
								);
							}
						} else if (value < 0) {
							throw new Error("Rate must be a positive number.");
						}
						return true;
					})
					.notEmpty()
					.withMessage("Rate is required!"),
				body("isPercentage")
					.optional()
					.isBoolean()
					.withMessage("isPercentage must be a boolean value."),
			];
		default:
			return [];
	}
};

/**
 * @openapi
 * /v1/taxes:
 *   post:
 *     summary: Creates a new tax.
 *     description: Creates a tax with name, rate, and percentage flag.
 *     tags:
 *       - Taxes
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - rate
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 maxLength: 1000
 *               rate:
 *                 type: number
 *                 description: Tax rate (0-100 if percentage).
 *               isPercentage:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       "201":
 *         description: Tax created successfully
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
 *                           $ref: '#/components/schemas/Taxes'
 *                         flashes:
 *                           $ref: '#/components/schemas/Flash'
 *       "400":
 *         description: Bad Request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       "401":
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       "422":
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       "500":
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const postNewTax = async (
	req: AuthenticatedRequest<
		{},
		FormatResponseObjectType<ITaxDocument, HttpStatus["CREATED"]>,
		Pick<ITax, "name" | "description" | "rate" | "isPercentage">
	>,
	res: Response<FormatResponseObjectType<ITaxDocument, HttpStatus["CREATED"]>>,
	next: NextFunction
): Promise<void> => {
	// Destructure the name, description, and rate from the request body
	const { name, description, rate, isPercentage } = req.body;
	const isPercentageFoundInRequestBody = "isPercentage" in req.body;

	// Create a new tax from the request body data, and if there was an error,
	// return the error and end the request
	const [taxError, tax] = await to(
		Tax.create({
			name,
			rate,
			...(description && { description }),
			...(isPercentageFoundInRequestBody && { isPercentage }),
		})
	);
	if (taxError) return next(taxError);

	// Set a flash message to indicate that the tax was created successfully,
	// and return the created tax in the response
	req.flash("success", "Tax created successfully.");
	res.status(httpStatus.CREATED).json(
		formatResponseObject({
			status: httpStatus.CREATED,
			entities: { data: tax },
			flashes: req.flash(),
		})
	);
};

/**
 * @openapi
 * /v1/taxes:
 *   get:
 *     summary: Retrieves a paginated list of taxes.
 *     description: Fetches taxes with filtering, sorting, and pagination.
 *     tags:
 *       - Taxes
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
 *         description: Search query (name or description).
 *       - in: query
 *         name: deleted
 *         schema:
 *           type: boolean
 *         description: Include deleted taxes.
 *     responses:
 *       "200":
 *         description: List of taxes retrieved successfully
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
 *                             $ref: '#/components/schemas/Taxes'
 *                         meta:
 *                           $ref: '#/components/schemas/Meta'
 *       "401":
 *         description: Unauthorized
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
export const getTaxes = async (
	req: AuthenticatedRequest<
		{},
		FormatResponseObjectType<ITaxDocument, HttpStatus["OK"]>,
		{},
		Partial<
			Pick<PaginateOptions, "sort" | "page" | "limit" | "offset" | "pagination"> & {
				q?: string;
				deleted?: boolean | number;
			}
		>
	>,
	res: Response<FormatResponseObjectType<ITaxDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Destructure the query parameters (req.query) into
	// q (search term), deleted (include deleted countries)
	const { q, deleted } = req.query || {};

	// Check if the query includes a deleted flag
	const isFilterByDeletedAllowed = "deleted" in req.query;

	// List of fields to search for the query term
	const querySearchFields: string[] = ["name", "description"];

	// List of sort options
	const sort: SortItemType<"name" | "createdAt">[] = [
		{ name: "Name A-Z", value: { name: 1 } },
		{ name: "Name Z-A", value: { name: -1 } },
		{ name: "Created Date Ascending", value: { createdAt: 1 } },
		{ name: "Created Date Descending", value: { createdAt: -1 } },
	];

	const [paginatedTaxesError, paginatedTaxes] = await to(
		Tax.paginate<ITaxDocument>(
			{
				// If the query includes a search term, filter taxes by name or code
				...((q && {
					$or: querySearchFields.map((item) => ({
						[item]: { $regex: String(q).toLowerCase() || "", $options: "i" },
					})),
				}) ||
					{}),
				// If the query includes a deleted flag, include deleted taxes
				...((isFilterByDeletedAllowed && { deleted: Boolean(deleted) }) || {}),
			},
			// Use the query parameters for pagination and sorting
			{
				...("sort" in req.query && { sort: req.query.sort }),
				...("page" in req.query && { page: Number(req.query.page) }),
				...("limit" in req.query && { limit: Number(req.query.limit) }),
				...("offset" in req.query && { offset: Number(req.query.offset) }),
				...("pagination" in req.query && { pagination: Boolean(req.query.pagination) }),
			}
		)
	);
	if (paginatedTaxesError) return next(paginatedTaxesError);

	// Destructure the paginated taxes into the list of taxes (docs) and pagination metadata
	const { docs, ...pagination } = paginatedTaxes;

	// Return the list of taxes, pagination metadata, and sort options in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: [...(docs || [])], meta: { pagination, sort } },
		})
	);
};

/**
 * @openapi
 * /v1/taxes/{tax}:
 *   get:
 *     summary: Retrieves a single tax.
 *     description: Fetches a tax by ID or slug.
 *     tags:
 *       - Taxes
 *     parameters:
 *       - in: path
 *         name: tax
 *         required: true
 *         schema:
 *           type: string
 *         description: Tax ID or slug.
 *     responses:
 *       "200":
 *         description: Tax details retrieved successfully
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
 *                           $ref: '#/components/schemas/Taxes'
 *       "401":
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       "404":
 *         description: Tax not found
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
export const getSingleTax = async (
	req: AuthenticatedRequest<
		{ tax: string },
		FormatResponseObjectType<ITaxDocument, HttpStatus["OK"]>
	>,
	res: Response<FormatResponseObjectType<ITaxDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Retrieve the tax ID or slug from the request parameters
	const { tax: taxIdentifier } = req.params || {};

	// Attempt to retrieve a tax from the database with the given ID or slug,
	// and if there was an error or no tax was found, return the error and end the request
	const [taxError, tax] = await to(
		Tax.findOneWithDeleted({
			$or: [
				{ slug: taxIdentifier },
				...(isMongoId(taxIdentifier) ? [{ _id: taxIdentifier }] : []),
			],
		})
	);
	if (taxError || !tax) return next(taxError);

	// Return the retrieved tax in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, entities: { data: tax } })
	);
};

/**
 * @openapi
 * /v1/taxes/{tax}:
 *   patch:
 *     summary: Updates a single tax.
 *     description: Updates tax details.
 *     tags:
 *       - Taxes
 *     parameters:
 *       - in: path
 *         name: tax
 *         required: true
 *         schema:
 *           type: string
 *         description: Tax ID or slug.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 maxLength: 1000
 *               rate:
 *                 type: number
 *               isPercentage:
 *                 type: boolean
 *     responses:
 *       "200":
 *         description: Tax updated successfully
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
 *                           $ref: '#/components/schemas/Taxes'
 *                         flashes:
 *                           $ref: '#/components/schemas/Flash'
 *       "400":
 *         description: Bad Request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       "401":
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       "404":
 *         description: Tax not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       "422":
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       "500":
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const updateSingleTax = async (
	req: AuthenticatedRequest<
		{ tax: string },
		FormatResponseObjectType<ITaxDocument, HttpStatus["OK"]>,
		Partial<Pick<ITax, "name" | "description" | "rate" | "isPercentage">>
	>,
	res: Response<FormatResponseObjectType<ITaxDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	// Retrieve the tax ID or slug from the request parameters
	const { tax: taxIdentifier } = req.params || {};

	// Attempt to retrieve a tax from the database with the given ID or slug,
	// and if there was an error or no tax was found, return the error and end the request
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

	// Merge the request body data into the existing tax object
	Object.assign(tax, {
		...(req.body?.name && { name: req.body.name }),
		...(req.body?.description && { description: req.body.description }),
		...(req.body?.rate && { rate: req.body.rate }),
		...("isPercentage" in req.body && { isPercentage: req.body.isPercentage }),
	});

	// Save the updated tax object to the database, and if there is an error during saving,
	// pass the error to the next middleware
	const [saveError, newTax] = await to(tax.save({ session }));
	if (saveError) {
		handleTransactionError(session);
		return next(saveError);
	}

	// Commit the transaction
	await session.commitTransaction();
	session.endSession();

	// Flash success message and return the updated tax data in the response
	req.flash("success", "successfully updated.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: newTax },
			flashes: req.flash(),
		})
	);
};

/**
 * @openapi
 * /v1/taxes/{tax}:
 *   delete:
 *     summary: Deletes a single tax.
 *     description: Soft-deletes a tax. Requires Admin or SuperAdmin role.
 *     tags:
 *       - Taxes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tax
 *         required: true
 *         schema:
 *           type: string
 *         description: Tax ID or slug.
 *     responses:
 *       "200":
 *         description: Tax deleted successfully
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
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       "404":
 *         description: Tax not found
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
export const deleteSingleTax = async (
	req: AuthenticatedRequest<
		{ tax: string },
		FormatResponseObjectType<undefined, HttpStatus["OK"]>
	>,
	res: Response<FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Extract the tax identifier from request parameters
	const { tax: taxIdentifier } = req.params || {};

	// Attempt to find the tax by its ID or slug, and if there is an error or no tax is found,
	// pass the error to the next middleware
	const [taxError, tax] = await to(
		Tax.findOne({
			$or: [
				{ slug: taxIdentifier },
				...(isMongoId(taxIdentifier) ? [{ _id: taxIdentifier }] : []),
			],
		})
	);
	if (taxError || !tax) return next(taxError);

	// Attempt to soft-delete the found tax, and if there is an error during the deletion,
	// pass the error to the next middleware
	const [deleteTaxError] = await to(Tax.deleteById(tax._id, req.user._id));
	if (deleteTaxError) return next(deleteTaxError);

	// Flash success message and respond with success status
	req.flash("success", "Successfully Deleted.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};

/**
 * @openapi
 * /v1/taxes/{tax}/restore:
 *   patch:
 *     summary: Restores a single tax.
 *     description: Restores a soft-deleted tax.
 *     tags:
 *       - Taxes
 *     parameters:
 *       - in: path
 *         name: tax
 *         required: true
 *         schema:
 *           type: string
 *         description: Tax ID or slug.
 *     responses:
 *       "200":
 *         description: Tax restored successfully
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
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       "404":
 *         description: Tax not found
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
export const restoreSingleTax = async (
	req: AuthenticatedRequest<
		{ tax: string },
		FormatResponseObjectType<undefined, HttpStatus["OK"]>
	>,
	res: Response<FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Extract the tax identifier from request parameters
	const { tax: taxIdentifier } = req.params || {};

	// Create a query to find the tax by its ID or slug
	const singleTaxQuery = {
		$or: [
			{ slug: taxIdentifier }, // search by slug
			...(isMongoId(taxIdentifier) ? [{ _id: taxIdentifier }] : []), // search by ID
		],
		deleted: true, // only find soft-deleted countries
	};

	// Attempt to find the tax by its ID or slug, and if there is an error or no tax is found,
	// pass the error to the next middleware
	const [taxError, tax] = await to(Tax.findOneWithDeleted(singleTaxQuery));
	if (taxError || !tax) return next(taxError);

	// Attempt to restore the found tax, and if there is an error during the restoration,
	// pass the error to the next middleware
	const [restoreTaxError] = await to(Tax.restore(singleTaxQuery));
	if (restoreTaxError) return next(restoreTaxError);

	// Flash success message and respond with success status
	req.flash("success", "Successfully Restored.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};
