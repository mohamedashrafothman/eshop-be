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
import isInt from "validator/lib/isInt";
import ICartItem from "../interfaces/CartItem.interface";
import vars from "../utils/vars";
import { IProductDocument } from "./Product";

// adding schema methods here
export interface ICartItemDocument
	extends SoftDeleteInterface,
		Omit<ICartItem, "product">,
		Document<string> {
	createdAt: Date;
	updatedAt: Date;
	product: Types.ObjectId | IProductDocument;
}

// adding statics methods here
export type ICartItemModel = Model<ICartItemDocument>;

// schema definition
const CartItemSchema: Schema<ICartItemDocument, object, ICartItemDocument> = new Schema(
	{
		product: {
			type: Schema.Types.ObjectId,
			ref: "Product",
			autopopulate: {
				maxDepth: 2,
				select: "name slug thumbnail colors sizes price quantity category",
			},
			description:
				"Reference to the product being added to the cart, autopopulated up to 2 levels with selected product fields for quick access.",
		},
		color: {
			type: String,
			index: true,
			required: [true, "Color name is required!"],
			description:
				"The selected color variant of the product. Must match one of the available color options.",
		},
		size: {
			type: String,
			enum: vars.products.sizes,
			index: true,
			required: [true, "Size is required!"],
			description:
				"The selected size variant of the product, constrained to allowed sizes defined in product settings.",
		},
		quantity: {
			type: Number,
			min: [1, "Quantity can't be less than 1!"],
			max: [1000, "Quantity can't be greater than 1000!"],
			default: 1,
			index: true,
			validate: [
				(value: ICartItem["quantity"]) => isInt(String(value)),
				"Quantity must be an integer number!",
			],
			required: [true, "Quantity is required!"],
			description:
				"The number of units of this product in the cart. Must be an integer between 1 and 1000.",
		},
		price: {
			type: Number,
			default: 0,
			min: [0, "Price can't be less than 0!"],
			required: [true, "Price is required!"],
			description:
				"Unit price of the product at the time it was added to the cart. Used to calculate totals.",
		},
		total: {
			type: Number,
			default: 0,
			min: [0, "Total can't be less than 0!"],
			required: [true, "Total is required!"],
			description:
				"Total cost for this cart item, calculated as price multiplied by quantity.",
		},
	},
	{ toJSON: { versionKey: false, virtual: true }, timestamps: true, collection: "Cart Items" }
);

// schema hooks
CartItemSchema.pre("save", async function (next) {
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
const CartItemModal = model<
	ICartItemDocument,
	PaginateModel<ICartItemDocument> &
		AggregatePaginateModel<ICartItemDocument> &
		SoftDeleteModel<ICartItemDocument> &
		ICartItemModel
>("CartItem", CartItemSchema);

export default CartItemModal;
