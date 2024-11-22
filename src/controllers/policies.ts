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
 * @summary Creates a new policy.
 * @description Handles the creation of a new policy in the system.
 * Validates the policy data and creates a new policy if valid.
 * Sets a success message upon successful creation and returns the created policy.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.body - The policy data to create a new policy.
 * @param {String} req.body.title - The title of the policy.
 * @param {String} req.body.content - The content of the policy.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {void} 201 - Success response with the newly created policy data.
 *   * @property {Object} entities.data - The created policy object.
 *   * @property {Array} flashes - Success message for policy creation.
 * @throws {Error} 500 - Returns an error if the policy creation fails.
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
 * @summary Retrieves a paginated list of policies.
 * @description Fetches policies from the database using various filters,
 * including search queries, and includes options for pagination and sorting.
 * If the user is an admin or super admin, deleted policies can also be included in the results.
 *
 * @param {Request} req - Express request object.
 * @param {Object} req.query - Query parameters for filtering and pagination.
 * @param {String} [req.query.sort] - The field to sort by.
 * @param {Number} [req.query.page] - The page number to retrieve.
 * @param {Number} [req.query.limit] - The number of policies to retrieve per page.
 * @param {String} [req.query.offset] - The number of policies to skip.
 * @param {String} [req.query.pagination] - Enable or disable pagination.
 * @param {String} [req.query.q] - Search query to match against policy title.
 * @param {Boolean} [req.query.deleted] - Flag to include deleted policies in the response.
 * @param {Response} res - Express response object.
 * @param {NextFunction} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with a list of policies, pagination metadata, and sort options.
 * @throws {Error} 500 - Returns an error if any issue occurs during the retrieval process.
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
 * @summary Retrieves a single policy by its ID or slug.
 * @description Fetches a policy from the database using the provided slug or MongoDB object ID.
 * Handles errors and returns the policy data if found.
 *
 * @param {Object} req - Express request object.
 * @param {String} req.params.policy - The ID or slug of the policy to retrieve.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with the retrieved policy data.
 *   * @property {Object} entities.data - The retrieved policy object.
 * @throws {Error} 404 - If no policy is found with the provided identifier.
 * @throws {Error} 500 - If an error occurs during the retrieval process.
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
 * @summary Updates a single policy by its ID or slug.
 * @description Fetches a policy from the database using the provided slug or MongoDB object ID,
 * and updates the policy with the provided data. Handles errors and returns the updated policy data.
 *
 * @param {Object} req - Express request object.
 * @param {String} req.params.policy - The ID or slug of the policy to update.
 * @param {Object} req.body - The data to update the policy with.
 * @property {String} [req.body.title] - new title of the policy (optional).
 * @property {String} [req.body.content] - new content of the policy (optional).
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response with the updated policy data.
 *   * @property {Object} entities.data - The retrieved policy object.
 * @throws {Error} 404 - If no policy is found with the provided identifier.
 * @throws {Error} 500 - If an error occurs during the update process.
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
 * @summary Deletes a single policy by its ID or slug.
 * @description This method deletes a policy from the database using the provided slug or MongoDB object ID.
 * The policy is soft-deleted by marking it as deleted, ensuring it can be restored if needed.
 * The method handles errors and returns a success response when the deletion is successful.
 *
 * @param {Object} req - Express request object.
 * @param {String} req.params.policy - The ID or slug of the policy to delete.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response indicating the policy was deleted.
 * @throws {Error} 404 - If no policy is found with the provided identifier.
 * @throws {Error} 500 - If an error occurs during the deletion process.
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
 * @summary Restores a single policy by its ID or slug.
 * @description This method restores a policy that was previously soft-deleted from the database.
 * The method handles errors and returns a success response when the policy is successfully restored.
 *
 * @param {Object} req - Express request object.
 * @param {String} req.params.policy - The ID or slug of the policy to restore.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function to handle errors.
 *
 * @returns {Object} 200 - Success response indicating the policy was restored.
 * @throws {Error} 404 - If no policy is found with the provided identifier.
 * @throws {Error} 500 - If an error occurs during the restore process.
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
