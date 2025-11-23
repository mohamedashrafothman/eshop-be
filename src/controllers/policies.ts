import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body, ValidationChain } from "express-validator";
import createError from "http-errors";
import httpStatus, { HttpStatus } from "http-status";
import { PaginateOptions } from "mongoose";
import isMongoId from "validator/lib/isMongoId";
import IPolicy from "../interfaces/Policy.interface";
import Policy, { IPolicyDocument } from "../models/Policy";
import {
	formatResponseObject,
	FormatResponseObjectType,
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
				body("title")
					.trim()
					.escape()
					.notEmpty()
					.withMessage("You must supply a title!")
					.isLength({ max: 100 })
					.withMessage("Title must be at most 100 characters long!"),
				body("content").trim().notEmpty().withMessage("You must supply content!"),
			];
		case "update":
			return [
				body("title")
					.trim()
					.escape()
					.optional()
					.notEmpty()
					.withMessage("You must supply a title!")
					.isLength({ max: 100 })
					.withMessage("Title must be at most 100 characters long!"),
				body("content")
					.trim()
					.optional()
					.notEmpty()
					.withMessage("You must supply content!"),
			];
		default:
			return [];
	}
};

/**
 * @openapi
 * /policies:
 *   post:
 *     summary: Create a new policy
 *     description: Creates a new policy. Admin/SuperAdmin only.
 *     tags: [Policies]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - content
 *             properties:
 *               title:
 *                 type: string
 *                 description: Title of the policy
 *                 maxLength: 100
 *                 example: Privacy Policy
 *               content:
 *                 type: string
 *                 description: Content of the policy
 *                 example: This is the full content of the privacy policy...
 *     responses:
 *       201:
 *         description: Policy created successfully
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
 *                           $ref: '#/components/schemas/Policies'
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
export const postNewPolicy = async (
	req: Request<
		{},
		FormatResponseObjectType<IPolicyDocument, HttpStatus["CREATED"]>,
		Pick<IPolicy, "title" | "content">
	>,
	res: Response<FormatResponseObjectType<IPolicyDocument, HttpStatus["CREATED"]>>,
	next: NextFunction
): Promise<void> => {
	// Create a new policy from the request body data, and if there was an error,
	// return the error and end the request
	const [createdPolicyError, createdPolicy] = await to(
		Policy.create({ title: req.body.title, content: req.body.content })
	);
	if (createdPolicyError) return next(createdPolicyError);

	// Set a flash message to indicate that the policy was created successfully,
	// and return the created policy in the response
	req.flash("success", "Policy created successfully.");
	res.status(httpStatus.CREATED).json(
		formatResponseObject({
			status: httpStatus.CREATED,
			entities: { data: createdPolicy },
			flashes: req.flash(),
		})
	);
};

/**
 * @openapi
 * /policies:
 *   get:
 *     summary: Get a list of policies
 *     description: Retrieves a paginated list of policies. Supports filtering by search term (q) and deleted status (admin only).
 *     tags: [Policies]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *         description: Sort field
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search term (matches title)
 *       - in: query
 *         name: deleted
 *         schema:
 *           type: boolean
 *         description: Include deleted policies (Admin/SuperAdmin only)
 *     responses:
 *       200:
 *         description: List of policies retrieved successfully
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
 *                             $ref: '#/components/schemas/Policies'
 *                         meta:
 *                           $ref: '#/components/schemas/Meta'
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const getPolicies = async (
	req: Request<
		{},
		FormatResponseObjectType<IPolicyDocument, HttpStatus["OK"]>,
		{},
		Partial<
			Pick<PaginateOptions, "sort" | "page" | "limit" | "offset" | "pagination"> & {
				q?: string;
				deleted?: boolean | number;
			}
		>
	>,
	res: Response<FormatResponseObjectType<IPolicyDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Destructure the query parameters (req.query) into
	// q (search term), deleted (include deleted countries)
	const { q, deleted } = req.query || {};

	// Check if the query includes a deleted flag
	const isFilterByDeletedAllowed: boolean =
		"deleted" in req.query &&
		Boolean(
			req.user &&
				req.user.role &&
				[vars.auth.roles.superAdmin, vars.auth.roles.admin].includes(req.user.role)
		);

	// List of fields to search for the query term
	const querySearchFields: string[] = ["title"];

	// List of sort options
	const sort: SortItemType<"title" | "createdAt">[] = [
		{ name: "Title A-Z", value: { title: 1 } },
		{ name: "Title Z-A", value: { title: -1 } },
		{ name: "Created Date Ascending", value: { createdAt: 1 } },
		{ name: "Created Date Descending", value: { createdAt: -1 } },
	];

	// Attempt to retrieve the polices using the given query and pagination options,
	// and if there was an error, return the error and end the request
	const [paginatedPolicesError, paginatedPolices] = await to(
		Policy.paginate<IPolicyDocument>(
			{
				// If the query includes a search term, filter polices by name or code
				...((q && {
					$or: querySearchFields.map((item) => ({
						[item]: { $regex: String(q).toLowerCase() || "", $options: "i" },
					})),
				}) ||
					{}),
				// If the query includes a deleted flag, include deleted polices
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
	if (paginatedPolicesError) return next(paginatedPolicesError);

	// Destructure the paginated polices into the list of polices (docs) and pagination metadata
	const { docs, ...pagination } = paginatedPolices;

	// Return the list of polices, pagination metadata, and sort options in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: [...(docs || [])], meta: { pagination, sort } },
		})
	);
};

/**
 * @openapi
 * /policies/{policy}:
 *   get:
 *     summary: Get a single policy
 *     description: Retrieves a single policy by its ID or slug.
 *     tags: [Policies]
 *     parameters:
 *       - in: path
 *         name: policy
 *         required: true
 *         schema:
 *           type: string
 *         description: Policy ID or Slug
 *         example: privacy-policy
 *     responses:
 *       200:
 *         description: Policy retrieved successfully
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
 *                           $ref: '#/components/schemas/Policies'
 *       404:
 *         description: Policy not found
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
export const getSinglePolicy = async (
	req: Request<{ policy: string }, FormatResponseObjectType<IPolicyDocument, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<IPolicyDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Retrieve the policy ID or slug from the request parameters
	const { policy: policyIdentifier } = req.params || {};

	// Attempt to retrieve a policy from the database with the given ID or slug,
	// and if there was an error or no policy was found, return the error and end the request
	const [policyError, policy] = await to(
		Policy.findOneWithDeleted({
			$or: [
				{ slug: policyIdentifier },
				...(isMongoId(policyIdentifier) ? [{ _id: policyIdentifier }] : []),
			],
		})
	);
	if (policyError || !policy) return next(policyError);

	// Return the retrieved policy in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, entities: { data: policy } })
	);
};

/**
 * @openapi
 * /policies/{policy}:
 *   patch:
 *     summary: Update a single policy
 *     description: Updates a policy's title or content. Admin/SuperAdmin only.
 *     tags: [Policies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: policy
 *         required: true
 *         schema:
 *           type: string
 *         description: Policy ID or Slug
 *         example: privacy-policy
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: New title
 *                 maxLength: 100
 *               content:
 *                 type: string
 *                 description: New content
 *     responses:
 *       200:
 *         description: Policy updated successfully
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
 *                           $ref: '#/components/schemas/Policies'
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
 *         description: Policy not found
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
export const updateSinglePolicy = async (
	req: Request<
		{ policy: string },
		FormatResponseObjectType<IPolicyDocument, HttpStatus["OK"]>,
		Partial<Pick<IPolicy, "title" | "content">>
	>,
	res: Response<FormatResponseObjectType<IPolicyDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Extract policy identifier from request parameters
	const { policy: policyIdentifier } = req.params || {};

	// Attempt to find the policy by ID or slug, and if there is an error or no policy is found,
	// pass the error to the next middleware
	let [policyError, policy] = await to(
		Policy.findOneWithDeleted({
			$or: [
				{ slug: policyIdentifier }, // search by slug
				...(isMongoId(policyIdentifier) ? [{ _id: policyIdentifier }] : []), // search by ID
			],
		})
	);
	if (policyError || !policy) return next(policyError);

	// Merge the request body data into the existing policy object
	policy = Object.assign(policy, {
		...(req.body?.title && { title: req.body.title }),
		...(req.body?.content && { content: req.body.content }),
	});

	// Save the updated policy object to the database, and if there is an error during saving,
	// pass the error to the next middleware
	const [saveError, newPolicy] = await to(policy.save());
	if (saveError) return next(saveError);

	// Flash success message and return the updated policy data in the response
	req.flash("success", "Successfully updated.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: newPolicy },
			flashes: req.flash(),
		})
	);
};

/**
 * @openapi
 * /policies/{policy}:
 *   delete:
 *     summary: Delete a single policy
 *     description: Soft deletes a single policy by its ID or slug. Admin/SuperAdmin only.
 *     tags: [Policies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: policy
 *         required: true
 *         schema:
 *           type: string
 *         description: Policy ID or Slug
 *         example: privacy-policy
 *     responses:
 *       200:
 *         description: Policy deleted successfully
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
 *         description: Policy not found
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
export const deleteSinglePolicy = async (
	req: Request<{ policy: string }, FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
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

	// Extract the policy identifier from request parameters
	const { policy: policyIdentifier } = req.params || {};

	// Attempt to find the policy by its ID or slug, and if there is an error or no policy is found,
	// pass the error to the next middleware
	const [policyError, policy] = await to(
		Policy.findOne({
			$or: [
				{ slug: policyIdentifier },
				...(isMongoId(policyIdentifier) ? [{ _id: policyIdentifier }] : []),
			],
		})
	);
	if (policyError || !policy) return next(policyError);

	// Attempt to soft-delete the found policy, and if there is an error during the deletion,
	// pass the error to the next middleware
	const [deletePolicyError] = await to(Policy.deleteById(policy._id, req.user._id));
	if (deletePolicyError) return next(deletePolicyError);

	// Flash success message and respond with success status
	req.flash("success", "Successfully Deleted.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};

/**
 * @openapi
 * /policies/{policy}/restore:
 *   patch:
 *     summary: Restore a single policy
 *     description: Restores a soft-deleted policy by its ID or slug. Admin/SuperAdmin only.
 *     tags: [Policies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: policy
 *         required: true
 *         schema:
 *           type: string
 *         description: Policy ID or Slug
 *         example: privacy-policy
 *     responses:
 *       200:
 *         description: Policy restored successfully
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
 *         description: Policy not found
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
export const restoreSinglePolicy = async (
	req: Request<{ policy: string }, FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Extract the policy identifier from request parameters
	const { policy: policyIdentifier } = req.params || {};

	// Create a query to find the policy by its ID or slug
	const singlePolicyQuery = {
		$or: [
			{ slug: policyIdentifier }, // search by slug
			...(isMongoId(policyIdentifier) ? [{ _id: policyIdentifier }] : []), // search by ID
		],
		deleted: true, // only find soft-deleted countries
	};

	// Attempt to find the policy by its ID or slug, and if there is an error or no policy is found,
	// pass the error to the next middleware
	const [policyError, policy] = await to(Policy.findOneWithDeleted(singlePolicyQuery));
	if (policyError || !policy) return next(policyError);

	// Attempt to restore the found policy, and if there is an error during the restoration,
	// pass the error to the next middleware
	const [restorePolicyError] = await to(Policy.restore(singlePolicyQuery));
	if (restorePolicyError) return next(restorePolicyError);

	// Flash success message and respond with success status
	req.flash("success", "Successfully Restored.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};
