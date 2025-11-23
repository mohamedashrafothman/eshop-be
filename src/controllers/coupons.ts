import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body, ValidationChain } from "express-validator";
import createError from "http-errors";
import httpStatus, { HttpStatus } from "http-status";
import mongoose, { ClientSession, PaginateOptions } from "mongoose";
import isMongoId from "validator/lib/isMongoId";
import ICoupon from "../interfaces/Coupon.interface";
import Coupon, { ICouponDocument } from "../models/Coupon";
import {
	formatResponseObject,
	FormatResponseObjectType,
	handleTransactionError,
	type SortItemType,
} from "../utils/helpers";
import vars from "../utils/vars";

/**
 * Validates the input fields based on the method provided.
 */
export const validator = (method: "create" | "update"): ValidationChain[] => {
	switch (method) {
		case "create":
			return [
				body("code")
					.trim()
					.escape()
					.isString()
					.withMessage("Code must be a string!")
					.isLength({ min: 3, max: 20 })
					.withMessage("Code must be between 3 and 20 characters long!")
					.notEmpty()
					.withMessage("You must supply a code!"),
				body("discount")
					.isNumeric()
					.withMessage("Discount must be a number!")
					.custom((value, { req }) => {
						if (req.body.isPercentage) {
							if (value < 0 || value > 100) {
								throw new Error(
									"Discount must be between 0 and 100 when isPercentage is true."
								);
							}
						} else if (value < 0) {
							throw new Error("Discount must be a positive number.");
						}
						return true;
					})
					.notEmpty()
					.withMessage("Discount is required!"),
				body("isPercentage")
					.optional()
					.isBoolean()
					.withMessage("isPercentage must be a boolean value."),
				body("expirationDate")
					.trim()
					.notEmpty()
					.withMessage("Expiration date is required.")
					.isISO8601()
					.withMessage("Expiration date must be a valid ISO 8601 date string.")
					.isAfter(new Date().toISOString())
					.withMessage("Expiration date must be in the future."),
				body("usageLimit")
					.optional()
					.isInt({ min: 1 })
					.withMessage("Usage limit must be a positive integer.")
					.notEmpty()
					.withMessage("Usage limit is required!"),
			];
		case "update":
			return [
				body("code")
					.trim()
					.escape()
					.optional()
					.isString()
					.withMessage("Code must be a string!")
					.isLength({ min: 3, max: 20 })
					.withMessage("Code must be between 3 and 20 characters long!")
					.notEmpty()
					.withMessage("You must supply a code!"),
				body("discount")
					.optional()
					.isNumeric()
					.withMessage("Discount must be a number!")
					.custom((value, { req }) => {
						if (req.body.isPercentage) {
							if (value < 0 || value > 100) {
								throw new Error(
									"Discount must be between 0 and 100 when isPercentage is true."
								);
							}
						} else if (value < 0) {
							throw new Error("Discount must be a positive number.");
						}
						return true;
					})
					.notEmpty()
					.withMessage("Discount is required!"),
				body("isPercentage")
					.optional()
					.isBoolean()
					.withMessage("isPercentage must be a boolean value."),
				body("expirationDate")
					.optional()
					.trim()
					.notEmpty()
					.withMessage("Expiration date is required.")
					.isISO8601()
					.withMessage("Expiration date must be a valid ISO 8601 date string.")
					.isAfter(new Date().toISOString())
					.withMessage("Expiration date must be in the future."),
				body("usageLimit")
					.optional()
					.isInt({ min: 1 })
					.withMessage("Usage limit must be a positive integer.")
					.notEmpty()
					.withMessage("Usage limit is required!"),
			];
		default:
			return [];
	}
};

/**
 * @openapi
 * /v1/coupons:
 *   get:
 *     summary: Retrieves a paginated list of coupons.
 *     description: Fetches coupons with filtering and pagination. Admin/SuperAdmin only.
 *     tags:
 *       - Coupons
 *     security:
 *       - bearerAuth: []
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
 *     responses:
 *       "200":
 *         description: List of coupons.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 entities:
 *                   type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Coupons'
 *                     meta:
 *                       type: object
 *                       properties:
 *                         pagination:
 *                           type: object
 *       "401":
 *         description: Unauthorized.
 *       "500":
 *         description: Internal Server Error.
 */
export const getCoupons = async (
	req: Request<
		{},
		FormatResponseObjectType<ICouponDocument, HttpStatus["OK"]>,
		{},
		Partial<
			Pick<PaginateOptions, "sort" | "page" | "limit" | "offset" | "pagination"> & {
				q?: string;
				deleted?: boolean | number;
			}
		>
	>,
	res: Response<FormatResponseObjectType<ICouponDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Destructure the query parameters (req.query) into
	// q (search term), deleted (include deleted countries)
	const { q, deleted } = req.query || {};

	// Check if the query includes a deleted flag
	const isFilterByDeletedAllowed = "deleted" in req.query;

	// List of fields to search for the query term
	const querySearchFields: string[] = ["code"];

	// List of sort options
	const sort: SortItemType<"code" | "createdAt">[] = [
		{ name: "Code A-Z", value: { code: 1 } },
		{ name: "Code Z-A", value: { code: -1 } },
		{ name: "Created Date Ascending", value: { createdAt: 1 } },
		{ name: "Created Date Descending", value: { createdAt: -1 } },
	];

	const [paginatedCouponsError, paginatedCoupons] = await to(
		Coupon.paginate<ICouponDocument>(
			{
				// If the query includes a search term, filter coupons by name or code
				...((q && {
					$or: querySearchFields.map((item) => ({
						[item]: { $regex: String(q).toLowerCase() || "", $options: "i" },
					})),
				}) ||
					{}),
				// If the query includes a deleted flag, include deleted coupons
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
	if (paginatedCouponsError) return next(paginatedCouponsError);

	// Destructure the paginated coupons into the list of coupons (docs) and pagination metadata
	const { docs, ...pagination } = paginatedCoupons;

	// Return the list of coupons, pagination metadata, and sort options in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: [...(docs || [])], meta: { pagination, sort } },
		})
	);
};

/**
 * @openapi
 * /v1/coupons:
 *   post:
 *     summary: Creates a new coupon.
 *     description: Creates a coupon with code, discount, etc. Admin/SuperAdmin only.
 *     tags:
 *       - Coupons
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *               - discount
 *               - expirationDate
 *               - usageLimit
 *             properties:
 *               code:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 20
 *               discount:
 *                 type: number
 *               isPercentage:
 *                 type: boolean
 *               expirationDate:
 *                 type: string
 *                 format: date-time
 *               usageLimit:
 *                 type: integer
 *                 minimum: 1
 *     responses:
 *       "201":
 *         description: Coupon created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 201
 *                 entities:
 *                   type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Coupons'
 *                 flashes:
 *                   type: object
 *       "400":
 *         description: Invalid data.
 *       "401":
 *         description: Unauthorized.
 *       "409":
 *         description: Coupon code already exists.
 *       "500":
 *         description: Internal Server Error.
 */
export const postNewCoupon = async (
	req: Request<
		{},
		FormatResponseObjectType<ICouponDocument, HttpStatus["CREATED"]>,
		Pick<ICoupon, "code" | "discount" | "isPercentage" | "expirationDate" | "usageLimit">
	>,
	res: Response<FormatResponseObjectType<ICouponDocument, HttpStatus["CREATED"]>>,
	next: NextFunction
): Promise<void> => {
	// Destructure the request body
	const { code, discount, isPercentage, expirationDate, usageLimit } = req.body;
	const isPercentageFoundInRequestBody = "isPercentage" in req.body;
	const isUsageLimitFoundInRequestBody = "usageLimit" in req.body;

	// Create a new coupon from the request body data, and if there was an error,
	// return the error and end the request
	const [couponError, coupon] = await to(
		Coupon.create({
			code,
			discount,
			expirationDate,
			...(isUsageLimitFoundInRequestBody && { usageLimit }),
			...(isPercentageFoundInRequestBody && { isPercentage }),
		})
	);
	if (couponError) return next(couponError);

	// Set a flash message to indicate that the coupon was created successfully,
	// and return the created coupon in the response
	req.flash("success", "Coupon created successfully.");
	res.status(httpStatus.CREATED).json(
		formatResponseObject({
			status: httpStatus.CREATED,
			entities: { data: coupon },
			flashes: req.flash(),
		})
	);
};

/**
 * @openapi
 * /v1/coupons/{coupon}:
 *   get:
 *     summary: Retrieves a single coupon.
 *     description: Fetches a coupon by ID or slug. Admin/SuperAdmin only.
 *     tags:
 *       - Coupons
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: coupon
 *         required: true
 *         schema:
 *           type: string
 *         description: Coupon ID or slug.
 *     responses:
 *       "200":
 *         description: Coupon details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 entities:
 *                   type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Coupons'
 *       "401":
 *         description: Unauthorized.
 *       "404":
 *         description: Coupon not found.
 *       "500":
 *         description: Internal Server Error.
 */
export const getSingleCoupon = async (
	req: Request<{ coupon: string }, FormatResponseObjectType<ICouponDocument, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<ICouponDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Retrieve the coupon ID or slug from the request parameters
	const { coupon: couponIdentifier } = req.params || {};

	// Attempt to retrieve a coupon from the database with the given ID or slug,
	// and if there was an error or no coupon was found, return the error and end the request
	const [couponError, coupon] = await to(
		Coupon.findOneWithDeleted({
			$or: [
				{ slug: couponIdentifier },
				...(isMongoId(couponIdentifier) ? [{ _id: couponIdentifier }] : []),
			],
		})
	);
	if (couponError || !coupon) return next(couponError);

	// Return the retrieved coupon in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, entities: { data: coupon } })
	);
};

/**
 * @openapi
 * /v1/coupons/{coupon}:
 *   patch:
 *     summary: Updates a single coupon.
 *     description: Updates coupon details. Admin/SuperAdmin only.
 *     tags:
 *       - Coupons
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: coupon
 *         required: true
 *         schema:
 *           type: string
 *         description: Coupon ID or slug.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               code:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 20
 *               discount:
 *                 type: number
 *               isPercentage:
 *                 type: boolean
 *               expirationDate:
 *                 type: string
 *                 format: date-time
 *               usageLimit:
 *                 type: integer
 *                 minimum: 1
 *     responses:
 *       "200":
 *         description: Coupon updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 entities:
 *                   type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Coupons'
 *                 flashes:
 *                   type: object
 *       "400":
 *         description: Invalid data or usage limit exceeded.
 *       "401":
 *         description: Unauthorized.
 *       "404":
 *         description: Coupon not found.
 *       "500":
 *         description: Internal Server Error.
 */
export const updateSingleCoupon = async (
	req: Request<
		{ coupon: string },
		FormatResponseObjectType<ICouponDocument, HttpStatus["OK"]>,
		Partial<
			Pick<ICoupon, "code" | "discount" | "isPercentage" | "expirationDate" | "usageLimit">
		>
	>,
	res: Response<FormatResponseObjectType<ICouponDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	// Retrieve the coupon ID or slug from the request parameters
	const { coupon: couponIdentifier } = req.params || {};

	// Extract the new coupon data from the request body
	const { code, discount, isPercentage, expirationDate, usageLimit } = req.body;
	const isPercentageFoundInRequestBody = "isPercentage" in req.body;

	// Attempt to retrieve a coupon from the database with the given ID or slug,
	// and if there was an error or no coupon was found, return the error and end the request
	let [couponError, coupon] = await to(
		Coupon.findOneWithDeleted({
			$or: [
				{ slug: couponIdentifier },
				...(isMongoId(couponIdentifier) ? [{ _id: couponIdentifier }] : []),
			],
		}).session(session)
	);
	if (couponError || !coupon) {
		handleTransactionError(session);
		return next(couponError);
	}

	// Check if the coupon limit has been reached
	if (usageLimit && usageLimit < coupon.usageLimit - coupon.usageCount) {
		handleTransactionError(session);
		const error = createError(httpStatus.BAD_REQUEST, "Usage limit exceeded.");
		return next({ ...(error || {}), status: error.status });
	}

	// Merge the request body data into the existing coupon object
	coupon = Object.assign(coupon, {
		...(code && { code }),
		...(discount && { discount }),
		...(usageLimit && { usageLimit }),
		...(expirationDate && { expirationDate }),
		...(isPercentageFoundInRequestBody && { isPercentage }),
	});

	// Save the updated coupon object to the database, and if there is an error during saving,
	// pass the error to the next middleware
	const [saveError, newCoupon] = await to(coupon.save({ session }));
	if (saveError) {
		handleTransactionError(session);
		return next(saveError);
	}

	// Commit the transaction
	await session.commitTransaction();
	session.endSession();

	// Flash success message and return the updated coupon data in the response
	req.flash("success", "successfully updated.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: newCoupon },
			flashes: req.flash(),
		})
	);
};

/**
 * @openapi
 * /v1/coupons/{coupon}:
 *   delete:
 *     summary: Deletes a single coupon.
 *     description: Soft-deletes a coupon. Admin/SuperAdmin only.
 *     tags:
 *       - Coupons
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: coupon
 *         required: true
 *         schema:
 *           type: string
 *         description: Coupon ID or slug.
 *     responses:
 *       "200":
 *         description: Coupon deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 flashes:
 *                   type: object
 *       "401":
 *         description: Unauthorized.
 *       "404":
 *         description: Coupon not found.
 *       "500":
 *         description: Internal Server Error.
 */
export const deleteSingleCoupon = async (
	req: Request<{ coupon: string }, FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
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

	// Extract the coupon identifier from request parameters
	const { coupon: couponIdentifier } = req.params || {};

	// Attempt to find the coupon by its ID or slug, and if there is an error or no coupon is found,
	// pass the error to the next middleware
	const [couponError, coupon] = await to(
		Coupon.findOne({
			$or: [
				{ slug: couponIdentifier },
				...(isMongoId(couponIdentifier) ? [{ _id: couponIdentifier }] : []),
			],
		})
	);
	if (couponError || !coupon) return next(couponError);

	// Attempt to soft-delete the found coupon, and if there is an error during the deletion,
	// pass the error to the next middleware
	const [deleteCouponError] = await to(Coupon.deleteById(coupon._id, req.user._id));
	if (deleteCouponError) return next(deleteCouponError);

	// Flash success message and respond with success status
	req.flash("success", "Successfully Deleted.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};

/**
 * @openapi
 * /v1/coupons/{coupon}/restore:
 *   patch:
 *     summary: Restores a single coupon.
 *     description: Restores a soft-deleted coupon. Admin/SuperAdmin only.
 *     tags:
 *       - Coupons
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: coupon
 *         required: true
 *         schema:
 *           type: string
 *         description: Coupon ID or slug.
 *     responses:
 *       "200":
 *         description: Coupon restored successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 flashes:
 *                   type: object
 *       "401":
 *         description: Unauthorized.
 *       "404":
 *         description: Coupon not found.
 *       "500":
 *         description: Internal Server Error.
 */
export const restoreSingleCoupon = async (
	req: Request<{ coupon: string }, FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Extract the coupon identifier from request parameters
	const { coupon: couponIdentifier } = req.params || {};

	// Create a query to find the coupon by its ID or slug
	const singleCouponQuery = {
		$or: [
			{ slug: couponIdentifier }, // search by slug
			...(isMongoId(couponIdentifier) ? [{ _id: couponIdentifier }] : []), // search by ID
		],
		deleted: true, // only find soft-deleted countries
	};

	// Attempt to find the coupon by its ID or slug, and if there is an error or no coupon is found,
	// pass the error to the next middleware
	const [couponError, coupon] = await to(Coupon.findOneWithDeleted(singleCouponQuery));
	if (couponError || !coupon) return next(couponError);

	// Attempt to restore the found coupon, and if there is an error during the restoration,
	// pass the error to the next middleware
	const [restoreCouponError] = await to(Coupon.restore(singleCouponQuery));
	if (restoreCouponError) return next(restoreCouponError);

	// Flash success message and respond with success status
	req.flash("success", "Successfully Restored.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};
