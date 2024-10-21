import { Document, Model, model, PaginateModel, Schema, Types } from "mongoose";
import { SoftDeleteInterface, SoftDeleteModel } from "mongoose-delete";
import IZone from "../interfaces/Zone";
import { ICityDocument } from "./City";
import { ICountryDocument } from "./Country";
import { IStateDocument } from "./State";

// adding schema methods here
export interface IZoneDocument
	extends SoftDeleteInterface,
		Omit<IZone, "countries" | "states" | "cities">,
		Document<string> {
	createdAt: Date;
	updatedAt: Date;
	slug: string;
	countries: (Types.ObjectId | ICountryDocument)[];
	states: (Types.ObjectId | IStateDocument)[];
	cities: (Types.ObjectId | ICityDocument)[];
}

// adding statics methods here
export type IZoneModel = Model<IZoneDocument>;

// schema definition
const ZoneSchema: Schema<IZoneDocument, object, IZoneDocument> = new Schema(
	{
		name: {
			type: String,
			trim: true,
			maxlength: [100, "Name can't be greater than 100 characters!"],
			required: [true, "Name is required!"],
		},
		slug: { type: String, slug: "name", unique: true, index: true, slugPaddingSize: 6 },
		description: {
			type: String,
			trim: true,
			maxlength: [500, "Description can't be greater than 500 characters!"],
		},
		countries: [
			{
				type: Schema.Types.ObjectId,
				ref: "Country",
				required: [true, "Country is required!"],
				autopopulate: { maxDepth: 1, select: "name code" },
			},
		],
		states: [
			{
				type: Schema.Types.ObjectId,
				ref: "State",
				required: [true, "State is required!"],
				autopopulate: { maxDepth: 1, select: "name code" },
			},
		],
		cities: [
			{
				type: Schema.Types.ObjectId,
				ref: "City",
				required: [true, "City is required!"],
				autopopulate: { maxDepth: 1, select: "name code" },
			},
		],
	},
	{ toJSON: { versionKey: false, virtual: true }, timestamps: true }
);

// modal definition
const ZoneModal = model<
	IZoneDocument,
	PaginateModel<IZoneDocument> & SoftDeleteModel<IZoneDocument> & IZoneModel
>("Zone", ZoneSchema);

export default ZoneModal;
