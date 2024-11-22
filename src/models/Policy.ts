import { AggregatePaginateModel, Document, Model, model, PaginateModel, Schema } from "mongoose";
import { SoftDeleteInterface, SoftDeleteModel } from "mongoose-delete";
import IPolicy from "../interfaces/Policy.interface";

// adding schema methods here
export interface IPolicyDocument extends SoftDeleteInterface, IPolicy, Document<string> {
	createdAt: Date;
	updatedAt: Date;
	slug: string;
}

// adding statics methods here
export type IPolicyModel = Model<IPolicyDocument>;

// schema definition
const PolicySchema: Schema<IPolicyDocument, object, IPolicyDocument> = new Schema(
	{
		title: {
			type: String,
			trim: true,
			index: true,
			maxlength: [100, "Title can't be greater than 100 characters!"],
			required: [true, "Title is required!"],
		},
		slug: { type: String, slug: "title", unique: true, index: true, slugPaddingSize: 6 },
		content: { type: String, required: [true, "Content is required!"] },
	},
	{ toJSON: { versionKey: false, virtual: true }, timestamps: true }
);

// modal definition
const PolicyModal = model<
	IPolicyDocument,
	PaginateModel<IPolicyDocument> &
		AggregatePaginateModel<IPolicyDocument> &
		SoftDeleteModel<IPolicyDocument> &
		IPolicyModel
>("Policy", PolicySchema);

export default PolicyModal;
