import to from "await-to-js";
import { NextFunction, Response } from "express";
import { body, ValidationChain } from "express-validator";
import createError from "http-errors";
import httpStatus, { HttpStatus } from "http-status";
import mongoose, { ClientSession, PaginateOptions } from "mongoose";
import isMongoId from "validator/lib/isMongoId";
import { AuthenticatedRequest } from "../@types/express";
import IRole from "../interfaces/Role.interface";
import Permission from "../models/Permission";
import Role, { IRoleDocument } from "../models/Role";
import {
	formatResponseObject,
	handleTransactionError,
	type FormatResponseObjectType,
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
					.notEmpty()
					.withMessage("You must supply a name!")
					.isLength({ max: 100 })
					.withMessage("Name must be at most 100 characters long!"),
				body("description")
					.optional()
					.trim()
					.isLength({ max: 1000 })
					.withMessage("Description must be at most 1000 characters long!"),
				body("permissions")
					.exists()
					.withMessage("Permissions are required")
					.isArray()
					.withMessage("Permissions must be an array")
					.custom((permissions: string[]) => {
						// To fix duplicated permissions in request body
						return new Set(permissions).size === permissions.length;
					})
					.withMessage("Duplicate permissions are not allowed"),
				body("permissions.*")
					.notEmpty()
					.withMessage("Permission id is required")
					.custom((value) => isMongoId(value))
					.withMessage("Invalid permission id"),
			];
		case "update":
			return [
				body("name")
					.optional()
					.trim()
					.notEmpty()
					.withMessage("You must supply a name!")
					.isLength({ max: 100 })
					.withMessage("Name must be at most 100 characters long!"),
				body("description")
					.optional()
					.trim()
					.isLength({ max: 1000 })
					.withMessage("Description must be at most 1000 characters long!"),
				body("permissions")
					.optional()
					.isArray()
					.withMessage("Permissions must be an array")
					.custom((permissions: string[]) => {
						// To fix duplicated permissions in request body
						return new Set(permissions).size === permissions.length;
					})
					.withMessage("Duplicate permissions are not allowed"),
				body("permissions.*")
					.optional()
					.notEmpty()
					.withMessage("Permission id is required")
					.custom((value) => isMongoId(value))
					.withMessage("Invalid permission id"),
			];
	}
};

/**
 * @openapi
 * /v1/roles:
 *   get:
 *     summary: Retrieves a paginated list of roles.
 *     description: Fetches roles with filtering and pagination.
 *     tags:
 *       - Roles
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
 *         description: List of roles retrieved successfully
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
 *                             $ref: '#/components/schemas/Roles'
 *                         meta:
 *                           $ref: '#/components/schemas/Meta'
 *       "500":
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const getRoles = async (
	req: AuthenticatedRequest<
		{},
		FormatResponseObjectType<IRoleDocument, HttpStatus["OK"]>,
		{},
		Partial<
			Pick<PaginateOptions, "sort" | "page" | "limit" | "offset" | "pagination"> & {
				q?: string;
			}
		>
	>,
	res: Response<FormatResponseObjectType<IRoleDocument, HttpStatus["OK"]>>,
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

	// Attempt to retrieve the roles using the given query and pagination options,
	// and if there was an error, return the error and end the request
	const [paginatedRolesError, paginatedRoles] = await to(
		Role.paginate<IRoleDocument>(
			{
				// If the query includes a search term, filter roles by name
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
	if (paginatedRolesError) return next(paginatedRolesError);

	// Destructure the paginated roles into the list of roles (docs) and pagination metadata
	const { docs, ...pagination } = paginatedRoles;

	// Return the list of roles, pagination metadata, and sort options in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: [...(docs || [])], meta: { pagination, sort } },
		})
	);
};

/**
 * @openapi
 * /v1/roles:
 *   post:
 *     summary: Creates a new role.
 *     description: Creates a role with name, description, and permissions.
 *     tags:
 *       - Roles
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
 *               - permissions
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 20
 *               description:
 *                 type: string
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["roles:read", "roles:create", "roles:update", "roles:delete"]
 *     responses:
 *       "201":
 *         description: Role created successfully.
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
 *                       $ref: '#/components/schemas/Roles'
 *                 flashes:
 *                   type: object
 *       "400":
 *         description: Invalid data.
 *       "401":
 *         description: Unauthorized.
 *       "409":
 *         description: Role already exists.
 *       "500":
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const postNewRole = async (
	req: AuthenticatedRequest<
		{},
		FormatResponseObjectType<IRoleDocument, HttpStatus["CREATED"]>,
		Pick<IRole, "name" | "description" | "permissions">
	>,
	res: Response<FormatResponseObjectType<IRoleDocument, HttpStatus["CREATED"]>>,
	next: NextFunction
): Promise<void> => {
	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	const { name, description, permissions = [] } = req.body;

	// Check role name uniqueness
	const [existingRoleError, existingRole] = await to(
		Role.findOne({ name: new RegExp(`^${name}$`, "i") }).session(session)
	);
	if (existingRoleError) {
		handleTransactionError(session);
		return next(existingRoleError);
	}
	if (existingRole) {
		handleTransactionError(session);
		const error = createError(httpStatus.CONFLICT, `Role ${name} already exists!`);
		return next({ ...(error || {}), status: error.status });
	}

	// Validate permissions
	if (permissions.length) {
		const permissionCount = await Permission.countDocuments({
			_id: { $in: permissions },
		}).session(session);
		if (permissionCount !== permissions.length) {
			handleTransactionError(session);
			const error = createError(
				httpStatus.BAD_REQUEST,
				"One or more permissions do not exist"
			);
			return next({ ...(error || {}), status: error.status });
		}
	}

	// Create a new role from the request body data, and if there was an error,
	// return the error and end the request
	const [createRoleError, createdRole] = await to(
		Role.create([{ name: name.trim(), description, permissions }], { session })
	);
	if (createRoleError) {
		handleTransactionError(session);
		return next(createRoleError);
	}

	// Commit the transaction
	await session.commitTransaction();
	session.endSession();

	// Set a flash message to indicate that the role was created successfully,
	// and return the created role in the response
	req.flash("success", `Role "${createdRole[0].name}" created successfully!`);
	res.status(httpStatus.CREATED).json(
		formatResponseObject({
			status: httpStatus.CREATED,
			entities: { data: createdRole[0] },
			flashes: req.flash(),
		})
	);
};

/**
 * @openapi
 * /v1/roles/{roleId}:
 *   get:
 *     summary: Get a single role
 *     description: Retrieves a single role by its ID. Admin/SuperAdmin only.
 *     tags:
 *       - Roles
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roleId
 *         required: true
 *         schema:
 *           type: string
 *         description: Role ID
 *         example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: Role retrieved successfully
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
 *                           $ref: '#/components/schemas/Roles'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       404:
 *         description: Role not found
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
export const getSingleRole = async (
	req: AuthenticatedRequest<
		{ roleId: string },
		FormatResponseObjectType<IRoleDocument, HttpStatus["OK"]>
	>,
	res: Response<FormatResponseObjectType<IRoleDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Retrieve the role ID from the request parameters
	const { roleId: roleIdentifier } = req.params || {};

	// Attempt to retrieve a role from the database with the given ID,
	// and if there was an error or no role was found, return the error and end the request
	const [roleError, role] = await to(Role.findOneWithDeleted({ _id: roleIdentifier }));
	if (roleError || !role) return next(roleError);

	// Return the retrieved role in the response
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, entities: { data: role } })
	);
};

/**
 * @openapi
 * /v1/roles/{roleId}:
 *   patch:
 *     summary: Update a single role's permissions
 *     description: Updates a role's permissions. Admin/SuperAdmin only.
 *     tags:
 *       - [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roleId
 *         required: true
 *         schema:
 *           type: string
 *         description: Role ID
 *         example: 507f1f77bcf86cd799439011
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               permissions:
 *                 type: array
 *                 description: array of permission ids
 *                 items:
 *                   type: string
 *                   format: uuid
 *     responses:
 *       200:
 *         description: Role permissions updated successfully
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
 *                           $ref: '#/components/schemas/Roles'
 *                         flashes:
 *                           $ref: '#/components/schemas/Flash'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       404:
 *         description: Role not found
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
export const updateSingleRole = async (
	req: AuthenticatedRequest<
		{ roleId: string },
		FormatResponseObjectType<IRoleDocument, HttpStatus["OK"]>,
		Partial<Pick<IRole, "name" | "description" | "permissions">>
	>,
	res: Response<FormatResponseObjectType<IRoleDocument, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Start a transaction to ensure data integrity
	const session: ClientSession = await mongoose.startSession();
	session.startTransaction();

	// Destructure the request parameters to get the role ID and role data
	const { roleId } = req.params;
	const { name, description, permissions } = req.body;

	// Check if the role exists
	let [roleError, role] = await to(Role.findOne({ _id: roleId }).session(session));
	if (roleError || !role) {
		handleTransactionError(session);
		return next(roleError);
	}

	// Check if the role name already exists (different role)
	if (name) {
		const [existingRoleError, existingRole] = await to(
			Role.findOne({ _id: { $ne: roleId }, name: new RegExp(`^${name}$`, "i") }).session(
				session
			)
		);

		if (existingRoleError) {
			handleTransactionError(session);
			return next(existingRoleError);
		}

		if (existingRole) {
			handleTransactionError(session);
			const error = createError(httpStatus.CONFLICT, `Role "${name}" already exists!`);
			return next({ ...(error || {}), status: error.status });
		}
	}

	// Check if all permissions exist
	if (permissions) {
		const existingPermissions = await Permission.countDocuments({
			_id: { $in: permissions },
		}).session(session);
		if (existingPermissions !== permissions.length) {
			handleTransactionError(session);
			const error = createError(
				httpStatus.BAD_REQUEST,
				"One or more permissions do not exist!"
			);
			return next({ ...(error || {}), status: error.status });
		}
	}

	// Assign the name, description and permissions to the role
	Object.assign(role, {
		...(name && { name: name.trim() }),
		...(description && { description: description }),
		...(permissions && { permissions: permissions }),
	});

	// Attempt to update the role with the new permissions
	[roleError] = await to(role.save({ session }));
	if (roleError) {
		handleTransactionError(session);
		return next(roleError);
	}

	// Commit the transaction
	await session.commitTransaction();
	session.endSession();

	// Set a flash message to indicate that the role was updated successfully,
	// and return the updated role in the response
	req.flash("success", `Role "${role.name}" updated successfully!`);
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: role },
			flashes: req.flash(),
		})
	);
};

/**
 * @openapi
 * /v1/roles/{roleId}:
 *   delete:
 *     summary: Delete a single role
 *     description: Soft deletes a single role by its ID. Admin/SuperAdmin only.
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roleId
 *         required: true
 *         schema:
 *           type: string
 *         description: Role ID
 *         example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: Role deleted successfully
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
 *         description: Role not found
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
export const deleteSingleRole = async (
	req: AuthenticatedRequest<
		{ roleId: string },
		FormatResponseObjectType<undefined, HttpStatus["OK"]>
	>,
	res: Response<FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Extract the role identifier from request parameters
	const { roleId } = req.params || {};

	// Attempt to find the role by its ID, and if there is an error or no role is found,
	// pass the error to the next middleware
	const [roleError, role] = await to(Role.findOne({ _id: roleId }));
	if (roleError || !role) return next(roleError);

	// Attempt to soft-delete the found role, and if there is an error during the deletion,
	// pass the error to the next middleware
	const [deleteRoleError] = await to(Role.deleteById(role._id, req.user._id));
	if (deleteRoleError) return next(deleteRoleError);

	// Flash success message and respond with success status
	req.flash("success", "Successfully Deleted.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};

/**
 * @openapi
 * /v1/roles/{roleId}/restore:
 *   patch:
 *     summary: Restore a single role
 *     description: Restores a soft-deleted role by its ID. Admin/SuperAdmin only.
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roleId
 *         required: true
 *         schema:
 *           type: string
 *         description: Role ID
 *         example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: Role restored successfully
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
 *         description: Role not found
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
export const restoreSingleRole = async (
	req: AuthenticatedRequest<
		{ roleId: string },
		FormatResponseObjectType<undefined, HttpStatus["OK"]>
	>,
	res: Response<FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	next: NextFunction
): Promise<void> => {
	// Extract the role identifier from request parameters
	const { roleId } = req.params || {};

	// Create a query to find the role by its ID
	const singleRoleQuery = {
		_id: roleId, // find the role by its ID
		deleted: true, // only find soft-deleted roles
	};

	// Attempt to find the role by its ID, and if there is an error or no role is found,
	// pass the error to the next middleware
	const [roleError, role] = await to(Role.findOneWithDeleted(singleRoleQuery));
	if (roleError || !role) return next(roleError);

	// Attempt to restore the found role, and if there is an error during the restoration,
	// pass the error to the next middleware
	const [restoreRoleError] = await to(Role.restore(singleRoleQuery));
	if (restoreRoleError) return next(restoreRoleError);

	// Flash success message and respond with success status
	req.flash("success", "Successfully Restored.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};
