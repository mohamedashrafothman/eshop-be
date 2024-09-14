import { Document, Model, PaginateModel, Schema, model } from "mongoose";
import { SoftDeleteInterface, SoftDeleteModel } from "mongoose-delete";
import IBrand from "../interfaces/Brand.interface";

// adding schema methods here
export interface IBrandDocument extends SoftDeleteInterface, IBrand, Document<string> {}

// adding statics methods here
export type IBrandModel = Model<IBrandDocument>;

// schema definition
const BrandSchema: Schema<IBrandDocument, object, IBrandDocument> = new Schema(
	{
		name: { type: String, trim: true, index: true, required: [true, "Name is required!"] },
		slug: { type: String, slug: "name", unique: true, index: true, slugPaddingSize: 6 },
		description: { type: String, trim: true },
		logo: { type: Schema.Types.ObjectId, ref: "Attachment", autopopulate: true },
	},
	{
		toJSON: {
			versionKey: false,
			virtual: true,
			transform: (_doc, { _id, ...ret }) => ({ id: _id, ...ret }),
		},
		timestamps: true,
	}
);

// modal definition
const BrandModal = model<
	IBrandDocument,
	PaginateModel<IBrandDocument> & SoftDeleteModel<IBrandDocument> & IBrandModel
>("Brand", BrandSchema);

export default BrandModal;
