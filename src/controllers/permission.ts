import to from "await-to-js";
import { NextFunction, Response } from "express";
import httpStatus, { HttpStatus } from "http-status";
import { PaginateOptions } from "mongoose";
import { AuthenticatedRequest } from "../@types/express";
import Permission, { IPermissionDocument } from "../models/Permission";
import {
	formatResponseObject,
	type FormatResponseObjectType,
	type SortItemType,
} from "../utils/helpers";

/**
 * @openapi
 * /v1/permissions:
 *   get:
 *     summary: Retrieves a paginated list of permissions.
 *     description: Fetches permissions with filtering and pagination.
 *     tags:
 *       - Permissions
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
 *     responses:
 *       "200":
 *         description: List of permissions retrieved successfully
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
 *                             $ref: '#/components/schemas/Permissions'
 *                         meta:
 *                           $ref: '#/components/schemas/Meta'
 *       "500":
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const getPermissions = async (
	req: AuthenticatedRequest<
		{},
		FormatResponseObjectType<IPermissionDocument, HttpStatus["OK"]>,
		{},
		Partial<
			Pick<PaginateOptions, "sort" | "page" | "limit" | "offset" | "pagination"> & {
				q?: string;
			}
		>
	>,
	res: Response<FormatResponseObjectType<IPermissionDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Destructure the query parameters (req.query) into
	// q (search term)
	const { q } = req.query || {};

	// List of fields to search for the query term
	const querySearchFields: string[] = ["name", "description"];

	// List of sort options
	const sort: SortItemType<"name" | "createdAt">[] = [
		{ name: "Name A-Z", value: { name: 1 } },
		{ name: "Name Z-A", value: { name: -1 } },
		{ name: "Created Date Ascending", value: { createdAt: 1 } },
		{ name: "Created Date Descending", value: { createdAt: -1 } },
	];

	// Attempt to retrieve the permissions using the given query and pagination options,
	// and if there was an error, return the error and end the request
	const [paginatedPermissionsError, paginatedPermissions] = await to(
		Permission.paginate<IPermissionDocument>(
			{
				// If the query includes a search term, filter permissions by name
				...((q && {
					$or: querySearchFields.map((item) => ({
						[item]: { $regex: String(q).toLowerCase() || "", $options: "i" },
					})),
				}) ||
					{}),
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
	if (paginatedPermissionsError) return next(paginatedPermissionsError);

	// Destructure the paginated permissions into the list of permissions (docs) and pagination metadata
	const { docs, ...pagination } = paginatedPermissions;

	// Return the list of permissions, pagination metadata, and sort options in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: [...(docs || [])], meta: { pagination, sort } },
		})
	);
};
