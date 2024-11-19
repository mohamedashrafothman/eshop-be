import { Request } from "express";
import { ValidationError } from "express-validator";
import httpStatus from "http-status";
import _ from "lodash";
import { ClientSession, Error, PaginateResult } from "mongoose";
import vars from "../vars";

// constants
const SUCCESS_STATUS_CODE = [
	httpStatus.CREATED, // 201 - Created
	httpStatus.OK, // 200 - OK
	httpStatus.ACCEPTED, // 202 - Accepted
	httpStatus.NO_CONTENT, // 204 - No Content
];
const ERROR_STATUS_CODE = [
	httpStatus.BAD_REQUEST, // 400 - Bad Request
	httpStatus.UNAUTHORIZED, // 401 - Unauthorized
	httpStatus.FORBIDDEN, // 403 - Forbidden
	httpStatus.NOT_FOUND, // 404 - Not Found
	httpStatus.METHOD_NOT_ALLOWED, // 405 - Method Not Allowed
	httpStatus.NOT_ACCEPTABLE, // 406 - Not Acceptable
	httpStatus.CONFLICT, // 409 - Conflict
	httpStatus.UNPROCESSABLE_ENTITY, // 422 - Unprocessable Entity
	httpStatus.TOO_MANY_REQUESTS, // 429 - Too Many Requests
	httpStatus.INTERNAL_SERVER_ERROR, // 500 - Internal Server Error
];

// types
type SuccessStatusCodeType = (typeof SUCCESS_STATUS_CODE)[number];
type ErrorStatusCodeType = (typeof ERROR_STATUS_CODE)[number];
export type SortItemType<T extends string = string> = {
	name: string;
	value: { [K in T]?: 1 | -1 } & { [K in Exclude<T, keyof any>]?: never };
};
type MetaDataType<T> = {
	pagination: Omit<PaginateResult<T>, "docs" | "meta">;
	sort: SortItemType[];
};
type SingleEntityDataType<T> = { data: T; meta?: never };
type MultipleEntityDataType<T> = { data: T[]; meta: MetaDataType<T> };
type FormatResponseSuccessObjectType<T, S> = {
	success: true;
	status: S | SuccessStatusCodeType;
	entities: SingleEntityDataType<T> | MultipleEntityDataType<T>;
	redirectURL?: string;
	error?: never;
};
type FormatResponseErrorObjectType<S> = {
	success: false;
	status: S | ErrorStatusCodeType;
	entities?: never;
	error: Error;
};
export type FormatResponseObjectType<T, S> = {
	flashes?: { [key: string]: string[] };
	message?: string;
} & (FormatResponseSuccessObjectType<T, S> | FormatResponseErrorObjectType<S>);

/**
 * Normalizes a port into a number, string, or false.
 *
 * @param val - The port value to normalize, provided as a string.
 * @returns The port as a number if it is a valid number greater than or equal to zero,
 *          the original string if it is not a valid number,
 *          or false if the port is a negative number.
 */
export const normalizePort = (val: string): number | string | boolean => {
	const port = parseInt(val, 10);
	if (Number.isNaN(port)) return val;
	if (port >= 0) return port;
	return false;
};

/**
 * Checks if a request contains API Acceptable Content-Type header.
 *
 * @param {Request} req - The Express.js Request object.
 * @returns {boolean} - Whether the request contains API Acceptable Content-Type header.
 */
export const isAPIAcceptableMediaTypeHeader = (req: Request): boolean => {
	const headerOption = req.get("Content-Type");
	return headerOption
		? vars.api.acceptableMediaType.some((item) => headerOption?.startsWith(item))
		: false;
};

/**
 * Checks if a request contains API Acceptable Accept header.
 *
 * @param {Request} req - The Express.js Request object.
 * @returns {boolean} - Whether the request contains API Acceptable Accept header.
 */
export const isAPIAcceptableAcceptHeader = (req: Request): boolean => {
	const headerOption = req.get("Accept");
	return headerOption
		? vars.api.acceptableMediaType.some((item) => headerOption?.startsWith(item))
		: false;
};

/**
 * Checks if a request contains API Acceptable Media Type and Accept headers.
 *
 * @param {Request} req - The Express.js Request object.
 * @returns {boolean} - Whether the request contains API Acceptable headers.
 */
export const isAPIHeaders = (req: Request) =>
	isAPIAcceptableMediaTypeHeader(req) && isAPIAcceptableAcceptHeader(req);

/**
 * Formats a response object based on the provided parameters.
 *
 * @template T - The type of the data entity/ies in the response.
 * @template S - The type of the status code, can be success or error status.
 *
 * @param {Object} params - An object containing response details.
 * @param {boolean} [params.success] - Indicates if the response is successful. Defaults to true if the status is a success status code.
 * @param {S} params.status - The HTTP status code of the response.
 * @param {Record<string, string[]>} [params.flashes] - Optional flash messages.
 * @param {SingleEntityDataType<T> | MultipleEntityDataType<T>} [params.entities] - The data entity/ies of the response.
 * @param {Error} [params.error] - The error object if the response is an error.
 * @param {string} [params.message] - An optional message for the response.
 *
 * @returns {FormatResponseObjectType<T, S>} - The formatted response object which includes success status, HTTP status code, data entities or error.
 *
 * @throws Will throw an error if the status code is neither a success nor an error status code.
 */
export const formatResponseObject = <
	T = object | undefined,
	S = SuccessStatusCodeType | ErrorStatusCodeType,
>({
	success: successParam,
	status,
	flashes,
	entities,
	error,
	message,
}: Omit<FormatResponseObjectType<T, S>, "success"> &
	(
		| {
				success?: true;
				status: SuccessStatusCodeType;
		  }
		| {
				success?: false;
				status: ErrorStatusCodeType;
		  }
	)): FormatResponseObjectType<T, S> => {
	const isSuccessStatus = SUCCESS_STATUS_CODE.includes(status as SuccessStatusCodeType);
	const isErrorStatus = ERROR_STATUS_CODE.includes(status as ErrorStatusCodeType);
	const success = successParam ?? isSuccessStatus;

	if (!isSuccessStatus && !isErrorStatus)
		throw new Error(
			`Invalid status code: ${status}. Must be one of ${SUCCESS_STATUS_CODE} or ${ERROR_STATUS_CODE}`
		);

	if (success && isSuccessStatus)
		return {
			success: true,
			status: status as SuccessStatusCodeType,
			entities: entities || { data: {} as T },
			...(flashes && { flashes }),
			...(message && { message }),
		};

	return {
		success: false,
		status: status as ErrorStatusCodeType,
		error: error || new Error("Unknown error"),
		...(flashes && { flashes }),
		...(message && { message }),
	};
};

/**
 * Formats an array of validation errors into a response object.
 *
 * @param {ValidationError[]} errors - An array of validation errors.
 * @returns {Record<string, string[]>[]} An array of objects where each key is a field path,
 * and the value is an array of error messages associated with that field.
 */
export const formatValidationErrorMessagesResponse = (errors: ValidationError[]) => {
	const errorsGroupedByPath = _.groupBy<{
		path?: string;
		msg?: string;
		message?: string;
	}>(errors, "path");
	const errorsPaths = Object.keys(errorsGroupedByPath).filter(Boolean);
	const errorsMapped = errorsPaths.map((path: string) => ({
		[path]: errorsGroupedByPath[path].map((error) => error?.msg || error?.message),
	}));
	return JSON.parse(JSON.stringify(errorsMapped));
};

/**
 * Converts a nested object into a flat object with dot notation keys.
 *
 * @param {any} obj - The object to be converted.
 * @param {string} [prefix=""] - The prefix to be used for the keys in the dot notation format.
 * @param {Record<string, any>} [result={}] - The resulting object with dot notation keys.
 * @returns {Record<string, any>} A flat object with keys in dot notation format.
 */
export const convertToDotNotation = (
	obj: any,
	prefix: string = "",
	result: Record<string, any> = {}
): Record<string, any> => {
	for (const key in obj) {
		if (Object.prototype.hasOwnProperty.call(obj, key)) {
			const value = obj[key];
			const newKey = prefix ? `${prefix}.${key}` : key;

			if (typeof value === "object" && value !== null && !Array.isArray(value)) {
				// Recursively process nested objects
				convertToDotNotation(value, newKey, result);
			} else {
				// Add key-value pair in dot notation
				result[newKey] = value;
			}
		}
	}
	return result;
};

/**
 * Handles a transaction error by aborting the transaction and ending the session.
 * @param {ClientSession} session - The mongoose session to handle the transaction error for.
 */
export const handleTransactionError = async (session: ClientSession) => {
	await session.abortTransaction();
	session.endSession();
};
