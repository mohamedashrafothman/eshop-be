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
				autopopulate: {
					maxDepth: 1,
					select: "name rate isPercentage applicableCategories applicableToAllProducts",
				},
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

	// Populate items to get total value from each cart item product
	await this.populate({ path: "items", populate: { path: "product" } });
	await this.populate({ path: "taxes" });
	await this.populate({ path: "shippingMethod" });

	// Get the current cart data
	const cartTaxes = this.taxes as ITaxDocument[];
	const cartItems = this.items as ICartItemDocument[];
	const cartShippingMethod = this.shippingMethod as IShippingMethodDocument;
	const shippingMethodTotal: number = cartShippingMethod?.rate || 0;

	// Calculate cart items total and taxes total using reduce
	const { cartItemsTotal, taxesTotal } = cartItems.reduce(
		(acc, cartItem) => {
			const cartItemProduct = cartItem.product as IProductDocument;
			const cartItemTotal = cartItem?.total || 0;

			// Accumulate cart items total
			acc.cartItemsTotal += cartItemTotal;

			// Calculate taxes for the current cart item
			const itemTaxesTotal = cartTaxes.reduce((taxAcc, tax) => {
				const taxApplicableCategoriesIds = tax.applicableCategories?.map((category) =>
					(category?._id || category)?.toString()
				);
				const cartItemProductId = (
					cartItemProduct?.category?._id || cartItemProduct.category
				)?.toString();

				// Check if the tax is applicable to the current cart item
				if (
					tax.applicableToAllProducts ||
					taxApplicableCategoriesIds?.includes(cartItemProductId)
				)
					return (
						taxAcc + (tax.isPercentage ? (cartItemTotal * tax.rate) / 100 : tax.rate)
					);

				return taxAcc;
			}, 0);

			// Accumulate total taxes for all items
			acc.taxesTotal += itemTaxesTotal;

			return acc;
		},
		{ cartItemsTotal: 0, taxesTotal: 0 }
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
