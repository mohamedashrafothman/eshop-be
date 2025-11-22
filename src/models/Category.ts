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
import ICategory from "../interfaces/Category.interface";
import { IAttachmentDocument } from "./Attachment";
import { IProductDocument } from "./Product";

// adding schema methods here
export interface ICategoryDocument
	extends SoftDeleteInterface,
		Omit<ICategory, "icon" | "parent" | "children" | "products">,
		Document<string> {
	createdAt: Date;
	updatedAt: Date;
	slug: string;
	icon: Types.ObjectId | IAttachmentDocument;
	parent: (Types.ObjectId | ICategoryDocument)[];
	children: (Types.ObjectId | ICategoryDocument)[];
	products: (Types.ObjectId | IProductDocument)[];
}

// adding statics methods here
export type ICategoryModel = Model<ICategoryDocument>;

// schema definition
const CategorySchema: Schema<ICategoryDocument, object, ICategoryDocument> = new Schema(
	{
		name: {
			type: String,
			trim: true,
			index: true,
			maxlength: [100, "Name can't be greater than 100 characters!"],
			required: [true, "Name is required!"],
			description:
				"The display name of the category, used for listing and navigation. Indexed for faster search and constrained to 100 characters.",
		},
		slug: {
			type: String,
			slug: "name",
			unique: true,
			index: true,
			slugPaddingSize: 6,
			description:
				"A URL-friendly version of the category name, generated automatically from 'name' and unique for routing and SEO purposes.",
		},
		description: {
			type: String,
			maxlength: [1000, "Description can't be greater than 1000 characters!"],
			required: [true, "Description is required!"],
			description:
				"A detailed textual description of the category, explaining its purpose and contents, constrained to 1000 characters.",
		},
		icon: {
			type: Schema.Types.ObjectId,
			ref: "Attachment",
			required: [true, "Icon is required!"],
			autopopulate: { select: "path alt" },
			description:
				"Reference to an attachment representing the category icon, autopopulated with path and alt text for display purposes.",
		},
		parent: [
			{
				type: Schema.Types.ObjectId,
				ref: "Category",
				autopopulate: { maxDepth: 2 },
				description:
					"Array of parent categories for hierarchical categorization, autopopulated up to 2 levels to provide context within category trees.",
			},
		],
		children: [
			{
				type: Schema.Types.ObjectId,
				ref: "Category",
				autopopulate: true,
				description:
					"Array of child categories under this category, autopopulated fully to allow quick access to subcategories.",
			},
		],
		products: [
			{
				type: Schema.Types.ObjectId,
				ref: "Product",
				default: [],
				description:
					"References to products that belong to this category. Defaults to an empty array if no products are assigned.",
			},
		],
		productsCount: {
			type: Number,
			default: 0,
			description:
				"The total number of products in this category, used for quick display and statistics.",
		},
	},
	{ toJSON: { versionKey: false, virtual: true }, timestamps: true }
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
	PaginateModel<ICategoryDocument> &
		AggregatePaginateModel<ICategoryDocument> &
		SoftDeleteModel<ICategoryDocument> &
		ICategoryModel
>("Category", CategorySchema);

export default CategoryModal;
