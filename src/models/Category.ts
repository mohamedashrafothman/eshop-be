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
			index: true,
			maxlength: 100,
			required: [true, "Name is required!"],
		},
		slug: { type: String, slug: "name", unique: true, index: true, slugPaddingSize: 6 },
		description: {
			type: String,
			maxlength: 1000,
			required: [true, "Description is required!"],
		},
		icon: {
			type: Schema.Types.ObjectId,
			ref: "Attachment",
			required: [true, "Icon is required!"],
			autopopulate: { select: "-_id path alt" },
		},
		parent: [{ type: Schema.Types.ObjectId, ref: "Category", autopopulate: { maxDepth: 2 } }],
		children: [{ type: Schema.Types.ObjectId, ref: "Category", autopopulate: { maxDepth: 2 } }],
		products: [{ type: Schema.Types.ObjectId, ref: "Product", default: [] }],
		productsCount: { type: Number, default: 0 },
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

CategorySchema.pre("save", function (next) {
	// Check if products isn't modified.
	if (!this.isModified("products")) return next();

	// Replace products count with new products length number.
	this.productsCount = this.products.length || 0;
	next();
});

// modal definition
const CategoryModal = model<
	ICategoryDocument,
	PaginateModel<ICategoryDocument> & SoftDeleteModel<ICategoryDocument> & ICategoryModel
>("Category", CategorySchema);

export default CategoryModal;
