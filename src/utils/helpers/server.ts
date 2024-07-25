import { Request } from "express";
import { PaginateResult } from "mongoose";
import vars from "../vars";

export type FormatResponseObjectType<T> = {
	status?: number;
	entities?: {
		data?: T | T[];
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
 * check if request contains API Headers.
 */
export const isAPIHeaders = (req: Request) =>
	req.get("Content-Type") === vars.api.acceptableMediaType && req.get("Accept") === vars.api.acceptableMediaType;

/**
 * format response object
 */
export const formatResponseObject = <T = void>(options: FormatResponseObjectType<T>): FormatResponseObjectType<T> =>
	options;
