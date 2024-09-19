import { Document, Model, PaginateModel, Schema, model } from "mongoose";
import { SoftDeleteInterface, SoftDeleteModel } from "mongoose-delete";
import isHexColor from "validator/lib/isHexColor";
import isInt from "validator/lib/isInt";
import IProduct from "../interfaces/Product.interface";
import vars from "../utils/vars";

// adding schema methods here
export interface IProductDocument extends SoftDeleteInterface, IProduct, Document<string> {}

// adding statics methods here
export type IProductModel = Model<IProductDocument>;

// schema definition
const ProductSchema: Schema<IProductDocument, object, IProductDocument> = new Schema(
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
			trim: true,
			index: true,
			maxlength: 1000,
			required: [true, "Description is required!"],
		},
		quantity: {
			type: Number,
			min: 0,
			default: 1,
			validator: [isInt, "Quantity must be an integer number!"],
		},
		price: {
			normal: {
				type: Number,
				index: 0,
				default: 0,
				min: 0,
				required: [true, "Normal price is required!"],
			},
			sale: {
				type: Number,
				default: null,
				min: 0,
				validate: [
					function (this: IProductDocument, value: IProduct["price"]["sale"]) {
						return value === null || value === undefined || value < this.price.normal;
					},
					"Sale price must be less than normal price!",
				],
			},
			discount: { type: Number, default: 0, min: 0 },
			percentage: { type: Number, default: 0, min: 0, max: 100 },
		},
		colors: [
			{
				_id: false,
				name: { type: String, index: true, required: [true, "Color name is required!"] },
				value: {
					type: String,
					index: true,
					required: [true, "Color value is required!"],
					validate: [isHexColor, "Invalid color value!"],
				},
			},
		],
		sizes: [
			{
				type: String,
				enum: vars.products.sizes,
				index: true,
				required: [true, "Size is required!"],
			},
		],
		// images: [
		// 	{
		// 		type: Schema.Types.ObjectId,
		// 		ref: "Attachment",
		// 		default: [],
		// 		autopopulate: {select: "-_id path alt"},
		// 		maxlength: vars.products.imagesMaxLength,
		// 	},
		// ],
		// thumbnail: {
		// 	type: Schema.Types.ObjectId,
		// 	ref: "Attachment",
		// 	required: [true, "Thumbnail is required!"],
		// 	autopopulate: {select: "-_id path alt"},
		// },
		brand: {
			type: Schema.Types.ObjectId,
			ref: "Brand",
			index: true,
			required: [true, "Brand is required!"],
			autopopulate: { maxDepth: 1, select: "_id name slug description" },
		},
		category: {
			type: Schema.Types.ObjectId,
			ref: "Category",
			index: true,
			required: [true, "Category is required!"],
			autopopulate: { maxDepth: 1, select: "_id name slug description" },
		},
		user: { type: Schema.Types.ObjectId, ref: "User", required: [true, "User is required!"] },
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

ProductSchema.pre("save", function (next) {
	// Check if sale price isn't modified.
	if (!this.isModified("price.sale") && !this.isModified("price.normal")) return next();

	// extract normal price from document price object.
	const { sale = 0, normal = 0 } = this.price;

	// Check if sale price is less than normal price.
	const isSaleLessThanNormal = sale && normal && sale < normal;

	// Replace percentage with new calculated value.
	this.price.discount = (isSaleLessThanNormal && normal - sale) || 0;
	this.price.percentage =
		(isSaleLessThanNormal && Math.round((this.price.discount / normal) * 100)) || 0;
	next();
});

// modal definition
const ProductModal = model<
	IProductDocument,
	PaginateModel<IProductDocument> & SoftDeleteModel<IProductDocument> & IProductModel
>("Product", ProductSchema);

export default ProductModal;
