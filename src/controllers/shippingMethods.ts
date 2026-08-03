import to from "await-to-js";
import { NextFunction, Response } from "express";
import { body, ValidationChain } from "express-validator";
import httpStatus, { HttpStatus } from "http-status";
import { PaginateOptions } from "mongoose";
import isMongoId from "validator/lib/isMongoId";
import { AuthenticatedRequest } from "../@types/express";
import IShippingMethod from "../interfaces/ShippingMethod.interface";
import ShippingMethod, { IShippingMethodDocument } from "../models/ShippingMethod";
import Zone from "../models/Zone";
import {
	type FormatResponseObjectType,
	type SortItemType,
	formatResponseObject,
	hasAnyPermission,
} from "../utils/helpers";
import PermissionType from "../utils/helpers/permissions";

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
					.isLength({ max: 1000 })
					.withMessage("Description must be at most 1000 characters long!"),
				body("rate")
					.isFloat({ min: 0 })
					.withMessage("Rate must be greater than or equal to 0!")
					.notEmpty()
					.withMessage("Rate is required!"),
				body("deliveryTime.min")
					.isFloat({ min: 0 })
					.withMessage("Minimum delivery time must be greater than or equal to 0!")
					.notEmpty()
					.withMessage("Minimum delivery time is required!"),
				body("deliveryTime.max")
					.optional()
					.isFloat({ min: 0 })
					.withMessage("Maximum delivery time must be greater than or equal to 0!")
					.notEmpty()
					.withMessage("Maximum delivery time is required!"),
				body("zone")
					.trim()
					.escape()
					.isMongoId()
					.withMessage("Invalid zone id!")
					.notEmpty()
					.withMessage("You must supply a zone id!"),
			];
		case "update":
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
					.isLength({ max: 1000 })
					.withMessage("Description must be at most 1000 characters long!"),
				body("rate")
					.optional()
					.isFloat({ min: 0 })
					.withMessage("Rate must be greater than or equal to 0!")
					.notEmpty()
					.withMessage("Rate is required!"),
				body("deliveryTime.min")
					.optional()
					.isFloat({ min: 0 })
					.withMessage("Minimum delivery time must be greater than or equal to 0!")
					.notEmpty()
					.withMessage("Minimum delivery time is required!"),
				body("deliveryTime.max")
					.optional()
					.isFloat({ min: 0 })
					.withMessage("Maximum delivery time must be greater than or equal to 0!")
					.notEmpty()
					.withMessage("Maximum delivery time is required!"),
				body("zone")
					.optional()
					.trim()
					.escape()
					.isMongoId()
					.withMessage("Invalid zone id!")
					.notEmpty()
					.withMessage("You must supply a zone id!"),
			];
		default:
			return [];
	}
};

/**
 * @openapi
 * /v1/shipping-methods:
 *   post:
 *     summary: Creates a new shipping method.
 *     description: Creates a shipping method with rate and delivery time. Requires Admin or SuperAdmin role.
 *     tags:
 *       - Shipping-Methods
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - rate
 *               - deliveryTime
 *               - zone
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 maxLength: 1000
 *               rate:
 *                 type: number
 *                 minimum: 0
 *               deliveryTime:
 *                 type: object
 *                 required:
 *                   - min
 *                 properties:
 *                   min:
 *                     type: number
 *                     minimum: 0
 *                   max:
 *                     type: number
 *                     minimum: 0
 *               zone:
 *                 type: string
 *                 description: Zone ID
 *     responses:
 *       201:
 *         description: Shipping method created successfully
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
 *                           $ref: '#/components/schemas/Shipping-Methods'
 *                         flashes:
 *                           $ref: '#/components/schemas/Flash'
 *       400:
 *         description: Bad Request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       422:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const postNewShippingMethod = async (
	req: AuthenticatedRequest<
		{},
		FormatResponseObjectType<IShippingMethodDocument, HttpStatus["CREATED"]>,
		Pick<IShippingMethod, "name" | "description" | "rate" | "zone"> & {
			deliveryTime: Pick<IShippingMethod["deliveryTime"], "min" | "max">;
		}
	>,
	res: Response<FormatResponseObjectType<IShippingMethodDocument, HttpStatus["CREATED"]>>,
	next: NextFunction
): Promise<void> => {
	// Check if the zone ID provided in the request body exist in the database
	// and if there was an error, return the error and end the request
	// If the zone ID do not exist in the database, return an error
	const [zoneError, zone] = await to(Zone.findById({ _id: req.body.zone }));
	if (zoneError || !zone)
		return next(
			zoneError ||
				new Error(
					"Invalid zone ID provided. Please ensure all zone ID exist in the database."
				)
		);

	// Create a new shipping method from the request body data, and if there was an error,
	// return the error and end the request
	const [createdShippingMethodError, createdShippingMethod] = await to(
		ShippingMethod.create({
			name: req.body.name,
			rate: req.body.rate,
			deliveryTime: {
				min: req.body.deliveryTime.min,
				...(req.body.deliveryTime.max && { max: req.body.deliveryTime.max }),
			},
			zone: zone._id,
			...(req.body?.description && { description: req.body.description }),
		})
	);
	if (createdShippingMethodError) return next(createdShippingMethodError);

	// Set a flash message to indicate that the shipping method was created successfully,
	// and return the created shipping method in the response
	req.flash("success", "Shipping method created successfully.");
	res.status(httpStatus.CREATED).json(
		formatResponseObject({
			status: httpStatus.CREATED,
			entities: { data: createdShippingMethod },
			flashes: req.flash(),
		})
	);
};

/**
 * @openapi
 * /v1/shipping-methods:
 *   get:
 *     summary: Retrieves a paginated list of shipping methods.
 *     description: Fetches shipping methods with filtering, sorting, and pagination.
 *     tags:
 *       - Shipping-Methods
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
 *         description: Include deleted shipping methods (Admin only).
 *       - in: query
 *         name: zone
 *         schema:
 *           type: string
 *         description: Filter by Zone ID.
 *     responses:
 *       200:
 *         description: List of shipping methods retrieved successfully
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
 *                             $ref: '#/components/schemas/Shipping-Methods'
 *                         meta:
 *                           $ref: '#/components/schemas/Meta'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const getShippingMethods = async (
	req: AuthenticatedRequest<
		{},
		FormatResponseObjectType<IShippingMethodDocument, HttpStatus["OK"]>,
		{},
		Partial<
			Pick<PaginateOptions, "sort" | "page" | "limit" | "offset" | "pagination"> & {
				q?: string;
				deleted?: boolean | number;
				zone?: string;
			}
		>
	>,
	res: Response<FormatResponseObjectType<IShippingMethodDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Destructure the query parameters (req.query) into
	// q (search term), deleted (include deleted shipping methods), zone (id of zone) and query (pagination & sorting options)
	const { q, deleted, zone } = req.query || {};

	// Check if the query includes a deleted flag
	const isFilterByDeletedAllowed: boolean =
		"deleted" in req.query &&
		Boolean(
			req?.user &&
				hasAnyPermission(req.user.permissions || [], PermissionType.MANAGE_SETTINGS)
		);

	// Check if the query includes a zone
	const isFilterByZoneAllowed: boolean = "zone" in req.query;

	// List of fields to search for the query term
	const querySearchFields: string[] = ["name", "description"];

	// List of sort options
	const sort: SortItemType<"name" | "createdAt">[] = [
		{ name: "Name A-Z", value: { name: 1 } },
		{ name: "Name Z-A", value: { name: -1 } },
		{ name: "Created Date Ascending", value: { createdAt: 1 } },
		{ name: "Created Date Descending", value: { createdAt: -1 } },
	];

	// Attempt to retrieve the shipping methods using the given query and pagination options,
	// and if there was an error, return the error and end the request
	const [paginatedShippingMethodsError, paginatedShippingMethods] = await to(
		ShippingMethod.paginate<IShippingMethodDocument>(
			{
				// If the query includes a search term, filter shipping methods by name or description
				...((q && {
					$or: querySearchFields.map((item) => ({
						[item]: { $regex: String(q).toLowerCase() || "", $options: "i" },
					})),
				}) ||
					{}),
				// If the query includes a deleted flag, include deleted shipping methods
				...((isFilterByDeletedAllowed && { deleted: Boolean(deleted) }) || {}),
				// If the query includes a zone, include zone shipping methods
				...((isFilterByZoneAllowed && { zone: Boolean(zone) }) || {}),
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
	if (paginatedShippingMethodsError) return next(paginatedShippingMethodsError);

	// Destructure the paginated shipping methods into the list of shipping methods (docs) and pagination metadata
	const { docs, ...pagination } = paginatedShippingMethods;

	// Return the list of shipping methods, pagination metadata, and sort options in the response
	res.status(httpStatus.OK).json(
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
 * @openapi
 * /v1/shipping-methods/{method}:
 *   get:
 *     summary: Retrieves a single shipping method.
 *     description: Fetches a shipping method by ID or slug. Requires Admin or SuperAdmin role.
 *     tags:
 *       - Shipping-Methods
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: method
 *         required: true
 *         schema:
 *           type: string
 *         description: Shipping Method ID or slug.
 *     responses:
 *       200:
 *         description: Shipping method retrieved successfully
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
 *                           $ref: '#/components/schemas/Shipping-Methods'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       404:
 *         description: Shipping method not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const getSingleShippingMethod = async (
	req: AuthenticatedRequest<
		{ method: string },
		FormatResponseObjectType<IShippingMethodDocument, HttpStatus["OK"]>
	>,
	res: Response<FormatResponseObjectType<IShippingMethodDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Retrieve the shipping method ID or slug from the request parameters
	const { method: shippingMethodIdentifier } = req.params || {};

	// Attempt to retrieve a shipping method from the database with the given ID or slug,
	// and if there was an error or no shipping method was found, return the error and end the request
	const [shippingMethodError, shippingMethod] = await to(
		ShippingMethod.findOneWithDeleted({
			$or: [
				{ slug: shippingMethodIdentifier }, // search by slug
				...((isMongoId(shippingMethodIdentifier) && [{ _id: shippingMethodIdentifier }]) ||
					[]), // search by ID
			],
		})
	);
	if (shippingMethodError || !shippingMethod) return next(shippingMethodError);

	// Return the retrieved shipping method in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, entities: { data: shippingMethod } })
	);
};

/**
 * @openapi
 * /v1/shipping-methods/{method}:
 *   patch:
 *     summary: Updates a single shipping method.
 *     description: Updates shipping method details. Requires Admin or SuperAdmin role.
 *     tags:
 *       - Shipping-Methods
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: method
 *         required: true
 *         schema:
 *           type: string
 *         description: Shipping Method ID or slug.
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
 *                 minimum: 0
 *               deliveryTime:
 *                 type: object
 *                 properties:
 *                   min:
 *                     type: number
 *                     minimum: 0
 *                   max:
 *                     type: number
 *                     minimum: 0
 *               zone:
 *                 type: string
 *                 description: Zone ID
 *     responses:
 *       200:
 *         description: Shipping method updated successfully
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
 *                           $ref: '#/components/schemas/Shipping-Methods'
 *                         flashes:
 *                           $ref: '#/components/schemas/Flash'
 *       400:
 *         description: Bad Request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       404:
 *         description: Shipping method not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       422:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const updateSingleShippingMethod = async (
	req: AuthenticatedRequest<
		{ method: string },
		FormatResponseObjectType<IShippingMethodDocument, HttpStatus["OK"]>,
		Partial<
			Pick<IShippingMethod, "name" | "description" | "rate" | "zone"> & {
				deliveryTime: Pick<IShippingMethod["deliveryTime"], "min" | "max">;
			}
		>
	>,
	res: Response<FormatResponseObjectType<IShippingMethodDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Check if the zone ID provided in the request body exist in the database
	// and if there was an error, return the error and end the request
	// If the zone ID do not exist in the database, return an error
	if (req.body?.zone) {
		const [zoneError, zone] = await to(Zone.findById({ _id: req.body.zone }));
		if (zoneError || !zone)
			return next(
				zoneError ||
					new Error(
						"Invalid zone ID provided. Please ensure all zone ID exist in the database."
					)
			);
	}

	// Extract shipping method identifier from request parameters
	const { method: shippingMethodIdentifier } = req.params || {};

	// Attempt to find the shipping method by ID or slug, and if there is an error or no shipping method is found,
	// pass the error to the next middleware
	let [shippingMethodError, shippingMethod] = await to(
		ShippingMethod.findOneWithDeleted({
			$or: [
				{ slug: shippingMethodIdentifier }, // search by slug
				...(isMongoId(shippingMethodIdentifier) ? [{ _id: shippingMethodIdentifier }] : []), // search by ID
			],
		})
	);
	if (shippingMethodError || !shippingMethod) return next(shippingMethodError);

	// Merge the request body data into the existing shipping method object
	Object.assign(shippingMethod, {
		...(req.body?.name && { name: req.body.name }),
		...(req.body?.description && { description: req.body.description }),
		...(req.body?.rate && { rate: req.body.rate }),
		...(req.body?.zone && { zone: req.body.zone }),
		...(req.body?.deliveryTime && {
			deliveryTime: {
				...((req.body.deliveryTime?.min || shippingMethod.deliveryTime.min) && {
					min: req.body.deliveryTime?.min || shippingMethod.deliveryTime.min,
				}),
				...((req.body.deliveryTime?.max || shippingMethod.deliveryTime.max) && {
					max: req.body.deliveryTime?.max || shippingMethod.deliveryTime.max,
				}),
			},
		}),
	});

	// Save the updated shipping method object to the database, and if there is an error during saving,
	// pass the error to the next middleware
	const [saveError, newShippingMethod] = await to(shippingMethod.save());
	if (saveError) return next(saveError);

	// Flash success message and return the updated shipping method data in the response
	req.flash("success", "Successfully updated.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: newShippingMethod },
			flashes: req.flash(),
		})
	);
};

/**
 * @openapi
 * /v1/shipping-methods/{method}:
 *   delete:
 *     summary: Deletes a single shipping method.
 *     description: Soft-deletes a shipping method. Requires Admin or SuperAdmin role.
 *     tags:
 *       - Shipping-Methods
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: method
 *         required: true
 *         schema:
 *           type: string
 *         description: Shipping Method ID or slug.
 *     responses:
 *       200:
 *         description: Shipping method deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     flashes:
 *                       $ref: '#/components/schemas/Flash'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       404:
 *         description: Shipping method not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const deleteSingleShippingMethod = async (
	req: AuthenticatedRequest<
		{ method: string },
		FormatResponseObjectType<undefined, HttpStatus["OK"]>
	>,
	res: Response<FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Extract the shipping method identifier from request parameters
	const { method: shippingMethodIdentifier } = req.params || {};

	// Attempt to find the shipping method by its ID or slug, and if there is an error or no shipping method is found,
	// pass the error to the next middleware
	const [shippingMethodError, shippingMethod] = await to(
		ShippingMethod.findOne({
			$or: [
				{ slug: shippingMethodIdentifier }, // search by slug
				...(isMongoId(shippingMethodIdentifier) ? [{ _id: shippingMethodIdentifier }] : []), // search by ID
			],
		})
	);
	if (shippingMethodError || !shippingMethod) return next(shippingMethodError);

	// Attempt to soft-delete the found shipping method, and if there is an error during the deletion,
	// pass the error to the next middleware
	const [deleteShippingMethodError] = await to(
		ShippingMethod.deleteById(shippingMethod._id, req.user._id)
	);
	if (deleteShippingMethodError) return next(deleteShippingMethodError);

	// Flash success message and respond with success status
	req.flash("success", "Successfully Deleted.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};

/**
 * @openapi
 * /v1/shipping-methods/{method}/restore:
 *   patch:
 *     summary: Restores a single shipping method.
 *     description: Restores a soft-deleted shipping method. Requires Admin or SuperAdmin role.
 *     tags:
 *       - Shipping-Methods
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: method
 *         required: true
 *         schema:
 *           type: string
 *         description: Shipping Method ID or slug.
 *     responses:
 *       200:
 *         description: Shipping method restored successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     flashes:
 *                       $ref: '#/components/schemas/Flash'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       404:
 *         description: Shipping method not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const restoreSingleShippingMethod = async (
	req: AuthenticatedRequest<
		{ method: string },
		FormatResponseObjectType<undefined, HttpStatus["OK"]>
	>,
	res: Response<FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Extract the shipping method identifier from request parameters
	const { method: shippingMethodIdentifier } = req.params || {};

	// Create a query to find the shipping method by its ID or slug
	const singleShippingMethodQuery = {
		$or: [
			{ slug: shippingMethodIdentifier }, // search by slug
			...(isMongoId(shippingMethodIdentifier) ? [{ _id: shippingMethodIdentifier }] : []), // search by ID
		],
		deleted: true, // only find soft-deleted countries
	};

	// Attempt to find the shipping method by its ID or slug, and if there is an error or no shipping method is found,
	// pass the error to the next middleware
	const [shippingMethodError, shippingMethod] = await to(
		ShippingMethod.findOneWithDeleted(singleShippingMethodQuery)
	);
	if (shippingMethodError || !shippingMethod) return next(shippingMethodError);

	// Attempt to restore the found shipping method, and if there is an error during the restoration,
	// pass the error to the next middleware
	const [restoreShippingMethodError] = await to(
		ShippingMethod.restore(singleShippingMethodQuery)
	);
	if (restoreShippingMethodError) return next(restoreShippingMethodError);

	// Flash success message and respond with success status
	req.flash("success", "Successfully Restored.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};
