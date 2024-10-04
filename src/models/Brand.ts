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
		name: {
			type: String,
			trim: true,
			index: true,
			maxlength: [100, "Name can't be greater than 100 characters!"],
			required: [true, "Name is required!"],
		},
		slug: { type: String, slug: "name", unique: true, index: true, slugPaddingSize: 6 },
		description: {
			type: String,
			trim: true,
			maxlength: [1000, "Description can't be greater than 100 characters!"],
		},
		logo: {
			type: Schema.Types.ObjectId,
			ref: "Attachment",
			autopopulate: { select: "path alt" },
		},
		products: [
			{
				type: Schema.Types.ObjectId,
				ref: "Product",
				default: [],
				autopopulate: { maxDepth: 1, select: "name slug" },
			},
		],
		productsCount: { type: Number, default: 0 },
	},
	{
		toJSON: { versionKey: false, virtual: true },
		timestamps: true,
	}
);

BrandSchema.pre("save", function (next) {
	// Check if products isn't modified.
	if (!this.isModified("products")) return next();

	// Replace products count with new products length number.
	this.productsCount = this.products.length || 0;
	next();
});

// modal definition
const BrandModal = model<
	IBrandDocument,
	PaginateModel<IBrandDocument> & SoftDeleteModel<IBrandDocument> & IBrandModel
>("Brand", BrandSchema);

export default BrandModal;
