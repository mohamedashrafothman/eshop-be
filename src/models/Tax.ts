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
import ITax from "../interfaces/Tax.interface";
import { ICategoryDocument } from "./Category";

// adding schema methods here
export interface ITaxDocument
	extends SoftDeleteInterface,
		Omit<ITax, "applicableCategories">,
		Document<string> {
	createdAt: Date;
	updatedAt: Date;
	slug: string;
	applicableCategories: (Types.ObjectId | ICategoryDocument)[];
}

// adding statics methods here
export type ITaxModel = Model<ITaxDocument>;

// schema definition
const TaxSchema: Schema<ITaxDocument, object, ITaxDocument> = new Schema(
	{
		name: {
			type: String,
			unique: true,
			index: true,
			trim: true,
			maxlength: [100, "Name can't be greater than 100 characters!"],
			required: [true, "Name is required!"],
		},
		slug: { type: String, slug: "name", unique: true, index: true, slugPaddingSize: 6 },
		description: {
			type: String,
			trim: true,
			maxlength: [1000, "Description can't be greater than 1000 characters!"],
		},
		rate: {
			type: Number,
			default: 0,
			required: [true, "Rate is required!"],
			min: [0, "Rate can't be less than 0!"],
		},
		isPercentage: { type: Boolean, default: true },
		applicableCategories: {
			type: [{ type: Schema.Types.ObjectId, ref: "Category" }],
			default: [],
			autopopulate: { maxDepth: 1, select: "name slug description" },
		},
		applicableToAllProducts: { type: Boolean, default: true },
	},
	{ toJSON: { versionKey: false, virtual: true }, timestamps: true }
);

// modal definition
const TaxModal = model<
	ITaxDocument,
	PaginateModel<ITaxDocument> &
		AggregatePaginateModel<ITaxDocument> &
		SoftDeleteModel<ITaxDocument> &
		ITaxModel
>("Tax", TaxSchema);

export default TaxModal;
