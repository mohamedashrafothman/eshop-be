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
		locked: { type: Boolean, default: false },
	},
	{ toJSON: { versionKey: false, virtual: true }, timestamps: true }
);

// schema hooks
CartSchema.pre("save", async function (next) {
	// Check if items, taxes, or shippingMethod is modified
	if (
		!this.isModified("items") &&
		!this.isModified("taxes") &&
		!this.isModified("shippingMethod")
	)
		return next();

	// Populate items, taxes, and shippingMethod to get total values
	await this.populate("items");
	await this.populate("taxes");
	await this.populate("shippingMethod");

	// Calculate subtotal and taxes based on cart items and applicable taxes
	const cartTaxes = this.taxes as ITaxDocument[];
	const cartItems = this.items as ICartItemDocument[];
	const cartShippingMethod = this.shippingMethod as IShippingMethodDocument;

	const shippingMethodTotal: number = cartShippingMethod.rate || 0;

	// Calculate total for cart items and taxes using reduce
	const { cartItemsTotal, taxesTotal } = cartItems.reduce(
		(acc, cartItem) => {
			const cartItemTotal = cartItem.total || 0;
			const cartItemProduct = cartItem.product as IProductDocument;

			acc.cartItemsTotal += cartItemTotal;

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
				) {
					acc.taxesTotal += tax.isPercentage
						? (cartItemTotal * tax.rate) / 100
						: tax.rate;
				}
			});

			return acc;
		},
		{ cartItemsTotal: 0, taxesTotal: 0 } // Initial accumulator object
	);

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
