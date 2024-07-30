import { Request } from "express";
import { ValidationError } from "express-validator";
import { Error, PaginateResult } from "mongoose";
import vars from "../vars";
import { groupBy } from "./index";

export type FormatResponseObjectType<T> = {
	success?: boolean;
	status: number;
	entities?: {
		data: T | T[];
		meta?: { pagination: Omit<PaginateResult<unknown>, "docs" | "meta">; sort: { name: string; value: object }[] };
	};
	flashes?: { [key: string]: string[] };
	error?: Error;
	message?: string;
};

/**
 * normalize a port into a number, string, or false.
 */
export const normalizePort = (val: string): number | string | boolean => {
	const port = parseInt(val, 10);
	if (Number.isNaN(port)) return val;
	if (port >= 0) return port;
	return false;
};

/**
 * check if request contains API Acceptable Media Type.
 */
export const isAPIAcceptableMediaTypeHeader = (req: Request): boolean =>
	req.get("Content-Type") === vars.api.acceptableMediaType;

/**
 * check if request contains API Acceptable Accept.
 */
export const isAPIAcceptableAcceptHeader = (req: Request): boolean =>
	req.get("Accept") === vars.api.acceptableMediaType;

/**
 * check if request contains API Headers.
 */
export const isAPIHeaders = (req: Request) => isAPIAcceptableMediaTypeHeader(req) && isAPIAcceptableAcceptHeader(req);

/**
 * format response object
 */
export const formatResponseObject = <T = void>({
	success = true,
	status,
	entities,
	flashes,
	error,
	message,
}: FormatResponseObjectType<T>): FormatResponseObjectType<T> => ({
	success,
	status,
	entities,
	flashes,
	error,
	message,
});

/**
 * format validation error messages
 */
export const formatValidationErrorMessagesResponse = (errors: ValidationError[]) => {
	const errorsGroupedByPath = groupBy<{ path?: string; msg?: string; message?: string }>(errors, "path");
	const errorsPaths = Object.keys(errorsGroupedByPath).filter(Boolean);
	const errorsMapped = errorsPaths.map((path: string) => ({
		[path]: errorsGroupedByPath[path].map((error) => error?.msg || error?.message),
	}));
	return JSON.parse(JSON.stringify(errorsMapped));
};
