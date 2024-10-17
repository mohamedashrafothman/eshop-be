import to from "await-to-js";
import { NextFunction, Request, Response } from "express";
import { body } from "express-validator";
import httpStatus from "http-status";
import isMongoId from "validator/lib/isMongoId";
import Country from "../models/Country";
import { formatResponseObject } from "../utils/helpers";

export const validator = (method: string) => {
	switch (method) {
		case "create":
			return [
				body("name")
					.trim()
					.escape()
					.notEmpty()
					.withMessage("You must supply a name!")
					.isLength({ max: 100 })
					.withMessage("Name must be at most 100 characters long!"),
				body("code")
					.trim()
					.escape()
					.notEmpty()
					.withMessage("You must supply a code!")
					.isLength({ max: 3, min: 1 })
					.withMessage("Code must be at most 100 characters long!"),
			];
		case "update":
			return [
				body("name")
					.trim()
					.escape()
					.optional()
					.notEmpty()
					.withMessage("You must supply a name!")
					.isLength({ max: 100 })
					.withMessage("Name must be at most 100 characters long!"),
				body("code")
					.trim()
					.escape()
					.optional()
					.notEmpty()
					.withMessage("You must supply a code!")
					.isLength({ max: 3, min: 1 })
					.withMessage("Code must be at most 100 characters long!"),
			];
		default:
			return [];
	}
};

export const postNewCountry = async (req: Request, res: Response, next: NextFunction) => {
	const [createdCountryError, createdCountry] = await to(Country.create(req.body));
	if (createdCountryError) return next(createdCountryError);

	req.flash("success", "Country created successfully.");
	res.status(httpStatus.CREATED).json(
		formatResponseObject({
			status: httpStatus.CREATED,
			entities: { data: createdCountry.toJSON() },
			flashes: req.flash(),
		})
	);
};

export const getCountries = async (req: Request, res: Response, next: NextFunction) => {
	const { q, deleted, ...query } = req.query || {};
	const isFilteredByDeleted = "deleted" in req.query;
	const querySearchFields = ["name", "code"];
	const sort = [
		{ name: "Name A-Z", value: { name: 1 } },
		{ name: "Name Z-A", value: { name: -1 } },
		{ name: "Created Date Ascending", value: { createdAt: 1 } },
		{ name: "Created Date Descending", value: { createdAt: -1 } },
	];

	const [paginatedCountriesError, paginatedCountries] = await to(
		Country.paginate(
			{
				...((q && {
					$or: querySearchFields.map((item) => ({
						[item]: { $regex: String(q).toLowerCase() || "", $options: "i" },
					})),
				}) ||
					{}),
				...((isFilteredByDeleted && { deleted: Boolean(deleted) }) || {}),
			},
			{ ...query }
		)
	);
	if (paginatedCountriesError) return next(paginatedCountriesError);

	const { docs, ...pagination } = paginatedCountries;

	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: {
				data: [...(docs || [])],
				meta: { pagination, sort },
			},
		})
	);
};

export const getSingleCountry = async (req: Request, res: Response, next: NextFunction) => {
	const { country: countryIdentifier } = req.params || {};
	const [countryError, country] = await to(
		Country.findOneWithDeleted({
			$or: [
				{ slug: countryIdentifier },
				...(isMongoId(countryIdentifier) ? [{ _id: countryIdentifier }] : []),
			],
		})
	);
	if (countryError || !country) return next(countryError || null);

	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, entities: { data: country } })
	);
};

export const updateSingleCountry = async (req: Request, res: Response, next: NextFunction) => {
	const { country: countryIdentifier } = req.params || {};
	let [countryError, country] = await to(
		Country.findOneWithDeleted({
			$or: [
				{ slug: countryIdentifier },
				...(isMongoId(countryIdentifier) ? [{ _id: countryIdentifier }] : []),
			],
		})
	);
	if (countryError || !country) return next(countryError || null);

	country = Object.assign(country, req.body);
	if (!country) return next();

	const [saveError, newCountry] = await to(country.save());
	if (saveError) return next(saveError);

	req.flash("success", "Successfully updated.");
	res.status(httpStatus.OK).json(
		formatResponseObject({
			status: httpStatus.OK,
			entities: { data: newCountry.toJSON() },
			flashes: req.flash(),
		})
	);
};

export const deleteSingleCountry = async (req: Request, res: Response, next: NextFunction) => {
	const { country: countryIdentifier } = req.params || {};
	const [countryError, country] = await to(
		Country.findOne({
			$or: [
				{ slug: countryIdentifier },
				...(isMongoId(countryIdentifier) ? [{ _id: countryIdentifier }] : []),
			],
		})
	);
	if (countryError || !country) return next(countryError || null);

	const [deleteCountryError] = await to(Country.deleteById(country._id, req?.user?._id));
	if (deleteCountryError) return next(deleteCountryError);

	req.flash("success", "Successfully Deleted.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};

export const restoreSingleCountry = async (req: Request, res: Response, next: NextFunction) => {
	const { country: countryIdentifier } = req.params || {};
	const singleCountryQuery = {
		$or: [
			{ slug: countryIdentifier },
			...(isMongoId(countryIdentifier) ? [{ _id: countryIdentifier }] : []),
		],
		deleted: true,
	};

	const [countryError, country] = await to(Country.findOneWithDeleted(singleCountryQuery));
	if (countryError || !country) return next(countryError || null);

	const [restoreCountryError] = await to(Country.restore(singleCountryQuery));
	if (restoreCountryError) return next(restoreCountryError);

	req.flash("success", "Successfully Restored.");
	res.status(httpStatus.OK).json(
		formatResponseObject({ status: httpStatus.OK, flashes: req.flash() })
	);
};
