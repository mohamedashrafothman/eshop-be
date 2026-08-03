import { NextFunction, Response } from "express";
import createError from "http-errors";
import httpStatus from "http-status";
import { AuthenticatedRequest } from "../@types/express";
import { hasAnyPermission } from "../utils/helpers";
import PermissionType from "../utils/helpers/permissions";

/**
 * Middleware to check if the authenticated user has any of the specified permissions.
 */
const middleware = (...permissions: PermissionType[]) => {
	return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
		if (!req.user) {
			return next(createError(httpStatus.UNAUTHORIZED, "You are not authenticated"));
		}

		if (permissions.length && !hasAnyPermission(req.user.permissions || [], ...permissions)) {
			return next(
				createError(
					httpStatus.FORBIDDEN,
					"You don't have permission to perform this action"
				)
			);
		}

		next();
	};
};

export default middleware;
