import { Document, Model, PaginateModel, Schema, model } from "mongoose";
import { SoftDeleteInterface, SoftDeleteModel } from "mongoose-delete";
import ICategory from "../interfaces/Category.interface";

// adding schema methods here
export interface ICategoryDocument extends SoftDeleteInterface, ICategory, Document<string> {}

// adding statics methods here
export type ICategoryModel = Model<ICategoryDocument>;

// schema definition
const CategorySchema = new Schema<ICategoryDocument, object, ICategoryDocument>(
	{
		name: { type: String, trim: true, required: true, index: true },
		slug: { type: String, slug: "name", unique: true, index: true, slugPaddingSize: 6 },
		icon: { type: String },
		description: { type: String, trim: true, required: true },
		parent: [{ type: Schema.Types.ObjectId, required: true, ref: "Category", autopopulate: true }],
		children: [{ type: Schema.Types.ObjectId, required: true, ref: "Category", autopopulate: true }],
	},
	{ timestamps: true }
);

// modal definition
const CategoryModal = model<
	ICategoryDocument,
	PaginateModel<ICategoryDocument> & SoftDeleteModel<ICategoryDocument> & ICategoryModel
>("Category", CategorySchema);

export default CategoryModal;
