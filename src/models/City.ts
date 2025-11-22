import {
	AggregatePaginateModel,
	Document,
	Model,
	model,
	PaginateModel,
	Schema,
	Types,
} from "mongoose";
import { SoftDeleteInterface, SoftDeleteModel } from "mongoose-delete";
import ICity from "../interfaces/City.interface";
import { ICountryDocument } from "./Country";
import { IStateDocument } from "./State";

// adding schema methods here
export interface ICityDocument
	extends SoftDeleteInterface,
		Omit<ICity, "country" | "state">,
		Document<string> {
	createdAt: Date;
	updatedAt: Date;
	slug: string;
	country: Types.ObjectId | ICountryDocument;
	state: Types.ObjectId | IStateDocument;
}

// adding statics methods here
export type ICityModel = Model<ICityDocument>;

// schema definition
const CitySchema: Schema<ICityDocument, object, ICityDocument> = new Schema(
	{
		name: {
			type: String,
			trim: true,
			index: true,
			maxlength: [100, "Name can't be greater than 100 characters!"],
			required: [true, "Name is required!"],
			description:
				"The official name of the city, trimmed and indexed for search, limited to 100 characters.",
		},
		slug: {
			type: String,
			slug: "name",
			unique: true,
			index: true,
			slugPaddingSize: 6,
			description:
				"A URL-friendly version of the city name, automatically generated from 'name', unique for routing and SEO purposes.",
		},
		country: {
			type: Schema.Types.ObjectId,
			required: [true, "Country is required!"],
			ref: "Country",
			autopopulate: { maxDepth: 1, select: "name code" },
			description:
				"Reference to the country this city belongs to, autopopulated with 'name' and 'code' for display and relational purposes.",
		},
		state: {
			type: Schema.Types.ObjectId,
			required: [true, "State is required!"],
			ref: "State",
			autopopulate: { maxDepth: 1, select: "name code" },
			description:
				"Reference to the state/province this city is located in, autopopulated with 'name' and 'code' for context.",
		},
	},
	{ toJSON: { versionKey: false, virtual: true }, timestamps: true }
);

// modal definition
const CityModal = model<
	ICityDocument,
	PaginateModel<ICityDocument> &
		AggregatePaginateModel<ICityDocument> &
		SoftDeleteModel<ICityDocument> &
		ICityModel
>("City", CitySchema);

export default CityModal;
