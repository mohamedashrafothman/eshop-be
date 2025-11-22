import { AggregatePaginateModel, Document, Model, PaginateModel, Schema, model } from "mongoose";
import { SoftDeleteInterface, SoftDeleteModel } from "mongoose-delete";
import ICountry from "../interfaces/Country.interface";

// adding schema methods here
export interface ICountryDocument extends SoftDeleteInterface, ICountry, Document<string> {
	createdAt: Date;
	updatedAt: Date;
	slug: string;
}

// adding statics methods here
export type ICountryModel = Model<ICountryDocument>;

// schema definition
const CountrySchema: Schema<ICountryDocument, object, ICountryDocument> = new Schema(
	{
		name: {
			type: String,
			trim: true,
			unique: true,
			index: true,
			maxlength: [100, "Name can't be greater than 100 characters!"],
			required: [true, "Name is required!"],
			description:
				"The official name of the country, trimmed and unique, used for display, search, and relational references.",
		},
		slug: {
			type: String,
			slug: "name",
			unique: true,
			index: true,
			slugPaddingSize: 6,
			description:
				"A URL-friendly version of the country name, automatically generated from 'name', unique for routing and SEO purposes.",
		},
		code: {
			type: String,
			trim: true,
			unique: true,
			index: true,
			uppercase: true,
			maxlength: [3, "Code can't be greater than 3 characters!"],
			required: [true, "Code is required!"],
			description:
				"The ISO-like country code (up to 3 uppercase characters), used for identification, sorting, and relational integrity.",
		},
	},
	{ toJSON: { versionKey: false, virtual: true }, timestamps: true }
);

// modal definition
const CountryModal = model<
	ICountryDocument,
	PaginateModel<ICountryDocument> &
		AggregatePaginateModel<ICountryDocument> &
		SoftDeleteModel<ICountryDocument> &
		ICountryModel
>("Country", CountrySchema);

export default CountryModal;
