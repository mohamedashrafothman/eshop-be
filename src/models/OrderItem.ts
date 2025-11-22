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
		product: {
			type: Schema.Types.ObjectId,
			ref: "Product",
			description: "Reference to the product associated with this order item.",
		},
		name: {
			type: String,
			trim: true,
			index: true,
			maxlength: [100, "Name can't be greater than 100 characters!"],
			required: [true, "Name is required!"],
			description:
				"The display name of the product for this order item, used in order summaries and listings.",
		},
		category: {
			type: String,
			index: true,
			required: [true, "Category is required!"],
			description:
				"The product category this order item belongs to, useful for filtering and reporting.",
		},
		color: {
			name: {
				type: String,
				index: true,
				required: [true, "Color name is required!"],
				description: "The human-readable name of the selected product color.",
			},
			value: {
				type: String,
				index: true,
				required: [true, "Color value is required!"],
				validate: [isHexColor, "Invalid color value!"],
				description: "The hexadecimal or CSS color code representing the selected color.",
			},
		},
		size: {
			type: String,
			enum: vars.products.sizes,
			index: true,
			description:
				"The size selected for the product, constrained to predefined sizes in the product settings.",
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
			description:
				"The number of units of this product in the order, must be an integer between 1 and 1000.",
		},
		price: {
			type: Number,
			default: 0,
			min: [0, "Price can't be less than 0!"],
			required: [true, "Price is required!"],
			description:
				"The unit price of the product at the time the order was placed, used to calculate totals.",
		},
		total: {
			type: Number,
			default: 0,
			min: [0, "Total can't be less than 0!"],
			required: [true, "Total is required!"],
			description:
				"The total cost for this order item, calculated as price multiplied by quantity.",
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
