import { Document, Model, model, PaginateModel, Schema, Types } from "mongoose";
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
		},
		slug: { type: String, slug: "name", unique: true, index: true, slugPaddingSize: 6 },
		country: {
			type: Schema.Types.ObjectId,
			required: [true, "Country is required!"],
			ref: "Country",
			autopopulate: { maxDepth: 1, select: "name code" },
		},
		state: {
			type: Schema.Types.ObjectId,
			required: [true, "State is required!"],
			ref: "State",
			autopopulate: { maxDepth: 1, select: "name code" },
		},
	},
	{ toJSON: { versionKey: false, virtual: true }, timestamps: true }
);

// modal definition
const CityModal = model<
	ICityDocument,
	PaginateModel<ICityDocument> & SoftDeleteModel<ICityDocument> & ICityModel
>("City", CitySchema);

export default CityModal;
