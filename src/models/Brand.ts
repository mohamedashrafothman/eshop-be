import { Document, Model, PaginateModel, Schema, model } from "mongoose";
import { SoftDeleteInterface, SoftDeleteModel } from "mongoose-delete";
import IBrand from "../interfaces/Brand.interface";

// adding schema methods here
export interface IBrandDocument extends SoftDeleteInterface, IBrand, Document<string> {}

// adding statics methods here
export type IBrandModel = Model<IBrandDocument>;

// schema definition
const BrandSchema = new Schema<IBrandDocument, object, IBrandDocument>(
	{
		name: { type: String, trim: true, required: true, index: true },
		slug: { type: String, slug: "name", unique: true, index: true, slugPaddingSize: 6 },
		icon: { type: String },
		description: { type: String, trim: true, required: true },
	},
	{ timestamps: true }
);

// modal definition
const BrandModal = model<IBrandDocument, PaginateModel<IBrandDocument> & SoftDeleteModel<IBrandDocument> & IBrandModel>(
	"Brand",
	BrandSchema
);

export default BrandModal;
