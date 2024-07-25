import { Document, Model, PaginateModel, Schema, model } from "mongoose";
import { SoftDeleteInterface, SoftDeleteModel } from "mongoose-delete";
import IProduct from "../interfaces/Product.interface";

// adding schema methods here
export interface IProductDocument extends SoftDeleteInterface, IProduct, Document<string> {}

// adding statics methods here
export type IProductModel = Model<IProductDocument>;

// schema definition
const ProductSchema = new Schema<IProductDocument, object, IProductDocument>(
	{
		name: { type: String, trim: true, required: true, index: true },
		slug: { type: String, slug: "name", unique: true, index: true, slugPaddingSize: 6 },
		description: { type: String, trim: true, required: true },
		price: { type: Number, required: true },
		sale: { price: { type: Number }, percentage: { type: Number } },
		quantity: { type: Number, required: true },
		mainPicture: { type: String },
		pictures: [{ type: String }],
		meta: { title: { type: String }, description: { type: String }, keywords: { type: String } },
		category: [{ type: Schema.Types.ObjectId, required: true, ref: "Category", autopopulate: true }],
		brand: { type: Schema.Types.ObjectId, required: true, ref: "Brand", autopopulate: true },
	},
	{ timestamps: true }
);

// modal definition
const ProductModal = model<
	IProductDocument,
	PaginateModel<IProductDocument> & SoftDeleteModel<IProductDocument> & IProductModel
>("Product", ProductSchema);

export default ProductModal;
