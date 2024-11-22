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
import isHexColor from "validator/lib/isHexColor";
import isInt from "validator/lib/isInt";
import IOrderItem from "../interfaces/OrderItem.interface";
import vars from "../utils/vars";
import { IProductDocument } from "./Product";

// adding schema methods here
export interface IOrderItemDocument
	extends SoftDeleteInterface,
		Omit<IOrderItem, "product">,
		Document<string> {
	createdAt: Date;
	updatedAt: Date;
	product: Types.ObjectId | IProductDocument;
}

// adding statics methods here
export type IOrderItemModel = Model<IOrderItemDocument>;

// schema definition
const OrderItemSchema: Schema<IOrderItemDocument, object, IOrderItemDocument> = new Schema(
	{
		product: { type: Schema.Types.ObjectId, ref: "Product" },
		name: {
			type: String,
			trim: true,
			index: true,
			maxlength: [100, "Name can't be greater than 100 characters!"],
			required: [true, "Name is required!"],
		},
		category: { type: String, index: true, required: [true, "Category is required!"] },
		color: {
			name: { type: String, index: true, required: [true, "Color name is required!"] },
			value: {
				type: String,
				index: true,
				required: [true, "Color value is required!"],
				validate: [isHexColor, "Invalid color value!"],
			},
		},
		size: {
			type: String,
			enum: vars.products.sizes,
			index: true,
		},
		quantity: {
			type: Number,
			min: [1, "Quantity can't be less than 1!"],
			max: [1000, "Quantity can't be greater than 1000!"],
			default: 1,
			index: true,
			validate: [
				(value: IOrderItem["quantity"]) => isInt(String(value)),
				"Quantity must be an integer number!",
			],
			required: [true, "Quantity is required!"],
		},
		price: {
			type: Number,
			default: 0,
			min: [0, "Price can't be less than 0!"],
			required: [true, "Price is required!"],
		},
		total: {
			type: Number,
			default: 0,
			min: [0, "Total can't be less than 0!"],
			required: [true, "Total is required!"],
		},
	},
	{ toJSON: { versionKey: false, virtual: true }, timestamps: true }
);

// schema hooks
OrderItemSchema.pre("save", async function (next) {
	// check if price or quantity is modified
	if (!this.isModified("price") && !this.isModified("quantity")) return next();

	// populate product to get it's prices.
	await this.populate({ path: "product" });

	// extract price and quantity from document
	const price =
		(this.product as IProductDocument)?.price?.sale ||
		(this.product as IProductDocument)?.price?.normal ||
		0;

	// calculate total based on product price and quantity
	this.price = price;
	this.total = price * this.quantity;

	next();
});

// modal definition
const OrderItemModal = model<
	IOrderItemDocument,
	PaginateModel<IOrderItemDocument> &
		AggregatePaginateModel<IOrderItemDocument> &
		SoftDeleteModel<IOrderItemDocument> &
		IOrderItemModel
>("OrderItem", OrderItemSchema);

export default OrderItemModal;
