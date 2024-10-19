import { NextFunction, Request, Response } from "express";
import { ValidationChain } from "express-validator";
import { PaginateOptions } from "mongoose";

/**
 * Validates the input fields based on the method provided.
 */
export const validator = (method: "create" | "update"): ValidationChain[] => {
	switch (method) {
		case "create":
			return [];
		case "update":
			return [];
		default:
			return [];
	}
};

export const postNewZone = async (
	req: Request<{}, {}, {}>,
	res: Response,
	next: NextFunction
) => {};

export const getZones = async (
	req: Request<
		{},
		{},
		{},
		Pick<PaginateOptions, "sort" | "page" | "limit" | "offset" | "pagination"> & {
			q?: string;
			deleted?: boolean | number;
		}
	>,
	res: Response,
	next: NextFunction
) => {};

export const getSingleZone = async (
	req: Request<{ zone: string }>,
	res: Response,
	next: NextFunction
) => {};

export const updateSingleZone = async (
	req: Request<{ zone: string }, {}, {}>,
	res: Response,
	next: NextFunction
) => {};

export const deleteSingleZone = async (
	req: Request<{ zone: string }>,
	res: Response,
	next: NextFunction
) => {};

export const restoreSingleZone = async (
	req: Request<{ zone: string }>,
	res: Response,
	next: NextFunction
) => {};
