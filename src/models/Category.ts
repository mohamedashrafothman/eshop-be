import { Document, Model, PaginateModel, Schema, model } from "mongoose";
import { SoftDeleteInterface, SoftDeleteModel } from "mongoose-delete";
import ICategory from "../interfaces/Category.interface";

// adding schema methods here
export interface ICategoryDocument extends SoftDeleteInterface, ICategory, Document<string> {}

// adding statics methods here
export type ICategoryModel = Model<ICategoryDocument>;

// schema definition
const CategorySchema: Schema<ICategoryDocument, object, ICategoryDocument> = new Schema(
	{
		name: {
			type: String,
			trim: true,
			unique: true,
			index: true,
			required: [true, "Name is required!"],
		},
		slug: { type: String, slug: "name", unique: true, index: true, slugPaddingSize: 6 },
		description: { type: String, required: [true, "Name is required!"] },
		picture: { type: Schema.Types.ObjectId, ref: "Attachment" },
		icon: { type: Schema.Types.ObjectId, ref: "Attachment" },
		parent: [{ type: Schema.Types.ObjectId, ref: "Category", autopopulate: { maxDepth: 1 } }],
		children: [{ type: Schema.Types.ObjectId, ref: "Category", autopopulate: { maxDepth: 1 } }],
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
const CategoryModal = model<
	ICategoryDocument,
	PaginateModel<ICategoryDocument> & SoftDeleteModel<ICategoryDocument> & ICategoryModel
>("Category", CategorySchema);

export default CategoryModal;
