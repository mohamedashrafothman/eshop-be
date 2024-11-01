import { Document, Model, model, PaginateModel, Schema, Types } from "mongoose";
import { SoftDeleteInterface, SoftDeleteModel } from "mongoose-delete";
import ICart from "../interfaces/Cart.interface";
import { IAddressDocument } from "./Address";
import { ICartItemDocument } from "./CartItem";
import { IPaymentMethodDocument } from "./PaymentMethod";
import { IProductDocument } from "./Product";
import { IShippingMethodDocument } from "./ShippingMethod";
import { ITaxDocument } from "./Tax";
import { IUserDocument } from "./User";

// adding schema methods here
export interface ICartDocument
	extends SoftDeleteInterface,
		Omit<ICart, "user" | "items" | "taxes" | "shippingMethod" | "address" | "paymentMethod">,
		Document<string> {
	createdAt: Date;
	updatedAt: Date;
	user: Types.ObjectId | IUserDocument;
	items: (Types.ObjectId | ICartItemDocument)[];
	taxes: (Types.ObjectId | ITaxDocument)[];
	shippingMethod: Types.ObjectId | IShippingMethodDocument;
	paymentMethod: Types.ObjectId | IPaymentMethodDocument;
	address: Types.ObjectId | IAddressDocument;
}

// adding statics methods here
export type ICartModel = Model<ICartDocument>;

// schema definition
const CartSchema: Schema<ICartDocument, object, ICartDocument> = new Schema(
	{
		user: {
			type: Schema.Types.ObjectId,
			ref: "User",
			required: [true, "User is required!"],
		},
		items: [
			{
				type: Schema.Types.ObjectId,
				ref: "CartItem",
				autopopulate: { maxDepth: 2, select: "quantity total price size color product" },
			},
		],
		taxes: [
			{
				type: Schema.Types.ObjectId,
				ref: "Tax",
				autopopulate: { maxDepth: 1, select: "name rate isPercentage" },
			},
		],
		shippingMethod: {
			type: Schema.Types.ObjectId,
			ref: "ShippingMethod",
			autopopulate: { maxDepth: 1 },
		},
		paymentMethod: {
			type: Schema.Types.ObjectId,
			ref: "PaymentMethod",
			autopopulate: { maxDepth: 1 },
		},
		address: {
			type: Schema.Types.ObjectId,
			ref: "Address",
			autopopulate: { maxDepth: 1 },
		},
		subtotal: { type: Number, default: 0 },
		total: { type: Number, default: 0 },
	},
	{ toJSON: { versionKey: false, virtual: true }, timestamps: true }
);

// schema hooks
CartSchema.pre("save", async function (next) {
	// check if items is modified
	if (
		!this.isModified("items") &&
		!this.isModified("taxes") &&
		!this.isModified("shippingMethod")
	)
		return next();

	// populate items to get total value from each cart item product.
	await this.populate("items");
	await this.populate("taxes");
	await this.populate("shippingMethod");

	// calculate subtotal and taxes based on cart items, and applicable taxes
	const cartTaxes = this.taxes as ITaxDocument[];
	const cartItems = this.items as ICartItemDocument[];
	const cartShippingMethod = this.shippingMethod as IShippingMethodDocument;
	let taxesTotal: number = 0;
	let cartItemsTotal: number = 0;
	const shippingMethodTotal: number = cartShippingMethod.rate || 0;

	cartItems.forEach((cartItem) => {
		const cartItemProduct = cartItem.product as IProductDocument;
		const cartItemTotal = cartItem?.total || 0;

		cartTaxes.forEach((tax) => {
			const taxApplicableCategoriesIds = tax.applicableCategories?.map((category) =>
				(category?._id || category)?.toString()
			);
			const cartItemProductId = (
				cartItemProduct?.category?._id || cartItemProduct.category
			)?.toString();

			if (
				tax.applicableToAllProducts ||
				taxApplicableCategoriesIds?.includes(cartItemProductId)
			)
				taxesTotal += tax.isPercentage ? (cartItemTotal * tax.rate) / 100 : tax.rate;
		});

		cartItemsTotal += cartItem.total;
	});

	this.subtotal = cartItemsTotal;
	this.total = cartItemsTotal + taxesTotal + shippingMethodTotal;

	next();
});

// modal definition
const CartModal = model<
	ICartDocument,
	PaginateModel<ICartDocument> & SoftDeleteModel<ICartDocument> & ICartModel
>("Cart", CartSchema);

export default CartModal;
