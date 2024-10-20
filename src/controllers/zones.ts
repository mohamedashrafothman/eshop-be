import { NextFunction, Request, Response } from "express";
import { ValidationChain } from "express-validator";
import { HttpStatus } from "http-status";
import { PaginateOptions } from "mongoose";
import IZone from "../interfaces/Zone";
import { IZoneDocument } from "../models/Zone";
import { type FormatResponseObjectType } from "../utils/helpers";

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
	req: Request<{}, FormatResponseObjectType<IZoneDocument, HttpStatus["CREATED"]>, IZone>,
	res: Response<FormatResponseObjectType<IZoneDocument, HttpStatus["CREATED"]>>,
	next: NextFunction
) => {};

export const getZones = async (
	req: Request<
		{},
		FormatResponseObjectType<IZoneDocument, HttpStatus["OK"]>,
		{},
		Pick<PaginateOptions, "sort" | "page" | "limit" | "offset" | "pagination"> & {
			q?: string;
			deleted?: boolean | number;
		}
	>,
	res: Response<FormatResponseObjectType<IZoneDocument, HttpStatus["OK"]>>,
	next: NextFunction
) => {};

export const getSingleZone = async (
	req: Request<{ zone: string }, FormatResponseObjectType<IZoneDocument, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<IZoneDocument, HttpStatus["OK"]>>,
	next: NextFunction
) => {};

export const updateSingleZone = async (
	req: Request<
		{ zone: string },
		FormatResponseObjectType<IZoneDocument, HttpStatus["OK"]>,
		Partial<IZone>
	>,
	res: Response<FormatResponseObjectType<IZoneDocument, HttpStatus["OK"]>>,
	next: NextFunction
) => {};

export const deleteSingleZone = async (
	req: Request<{ zone: string }, FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	next: NextFunction
) => {};

export const restoreSingleZone = async (
	req: Request<{ zone: string }, FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	res: Response<FormatResponseObjectType<undefined, HttpStatus["OK"]>>,
	next: NextFunction
) => {};
