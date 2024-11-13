import { Document, Model, model, PaginateModel, Schema, Types } from "mongoose";
import { SoftDeleteInterface, SoftDeleteModel } from "mongoose-delete";
import IOrder, {
	OrderShippingMethod as IOrderShippingMethod,
	OrderTax as IOrderTax,
} from "../interfaces/Order.interface";
import vars from "../utils/vars";
import { IOrderItemDocument } from "./OrderItem";
import { IProductDocument } from "./Product";
import { IUserDocument } from "./User";

// adding schema methods here
export interface IOrderDocument
	extends SoftDeleteInterface,
		Omit<IOrder, "user" | "items">,
		Document<string> {
	createdAt: Date;
	updatedAt: Date;
	user: Types.ObjectId | IUserDocument;
	items: (Types.ObjectId | IOrderItemDocument)[];
	getAllowedNextStatuses: () => (typeof vars.order.status)[keyof typeof vars.order.status][];
}

// adding statics methods here
export type IOrderModel = Model<IOrderDocument>;

// schema definition
const OrderSchema: Schema<IOrderDocument, object, IOrderDocument> = new Schema(
	{
		shortId: {
			type: String,
			unique: true,
			index: true,
			required: [true, "Short Id is required!"],
		},
		status: {
			type: String,
			enum: Object.values(vars.order.status),
			default: vars.order.status.pending,
			index: true,
			required: [true, "Status is required!"],
		},
		user: { type: Types.ObjectId, ref: "User", required: [true, "User is required!"] },
		items: [
			{
				type: Types.ObjectId,
				ref: "OrderItem",
				required: [true, "Order items are required!"],
			},
		],
		taxes: [
			{
				name: { type: String, required: [true, "Tax name is required!"] },
				rate: {
					type: Number,
					default: 0,
					required: [true, "Order tax rate is required!"],
					min: [0, "Order tax rate can't be less than 0!"],
				},
				description: {
					type: String,
					trim: true,
					maxlength: [
						1000,
						"Order tax description can't be greater than 1000 characters!",
					],
				},
				isPercentage: Boolean,
				applicableCategories: { type: [String], default: [] },
				applicableToAllProducts: { type: Boolean, default: true },
			},
		],
		shippingMethod: {
			name: { type: String, required: [true, "Shipping method name is required!"] },
			rate: {
				type: Number,
				required: [true, "Shipping method price is required!"],
				min: [0, "Normal price can't be less than 0!"],
			},
			zone: { type: String, required: [true, "Zone title is required!"] },
			deliveryTime: { min: Number, max: Number },
		},
		address: {
			name: { type: String, required: [true, "Address name is required!"] },
			street: { type: String, required: [true, "Address street is required!"] },
			building: { type: Number, required: [true, "Address building is required!"] },
			floor: { type: Number, min: [1, "Floor can't be less than 1!"] },
			apartment: { type: String },
			area: { type: String, required: [true, "Address area is required!"] },
			country: {
				name: {
					type: String,
					index: true,
					required: [true, "Address country name is required!"],
				},
				code: {
					type: String,
					index: true,
					required: [true, "Address country code is required!"],
				},
			},
			state: {
				name: {
					type: String,
					index: true,
					required: [true, "Address state name is required!"],
				},
				code: { type: String, index: true },
			},
			city: { name: { type: String, index: true } },
			zip: { type: String },
		},
		paymentMethod: {
			name: { type: String, required: [true, "Payment method name is required!"] },
			description: {
				type: String,
				trim: true,
				maxlength: [1000, "Description can't be greater than 1000 characters!"],
				required: [true, "Payment method description is required!"],
			},
			gateway: Object,
		},
		subtotal: { type: Number, default: 0 },
		total: { type: Number, default: 0 },
		note: {
			type: String,
			trim: true,
			maxlength: [1000, "Note can't be greater than 1000 characters!"],
		},
	},
	{ toJSON: { versionKey: false, virtual: true }, timestamps: true }
);

OrderSchema.methods.getAllowedNextStatuses = function () {
	// Define allowed statuses for each order status
	const allowedStatuses = {
		[vars.order.status.pending]: [vars.order.status.processing, vars.order.status.cancelled],
		[vars.order.status.processing]: [vars.order.status.shipped],
		[vars.order.status.shipped]: [vars.order.status.completed, vars.order.status.refunded],
		[vars.order.status.refunded]: [],
		[vars.order.status.cancelled]: [],
		[vars.order.status.completed]: [],
	};
	return allowedStatuses[this.status];
};

// schema hooks
OrderSchema.pre("save", async function (next) {
	// Check if items, taxes, or shippingMethod is modified
	if (
		!this.isModified("items") &&
		!this.isModified("taxes") &&
		!this.isModified("shippingMethod")
	)
		return next();

	// Populate items to get total value from each order item product
	await this.populate({ path: "items" });
	await this.populate({ path: "items", populate: { path: "product" } });

	// Calculate subtotal and taxes based on order items and applicable taxes
	const orderTaxes = this.taxes as IOrderTax[];
	const orderItems = this.items as IOrderItemDocument[];
	const orderShippingMethod = this.shippingMethod as IOrderShippingMethod;
	const shippingMethodTotal: number = orderShippingMethod.rate || 0;

	// Calculate order items total and taxes total
	const { orderItemsTotal, taxesTotal } = orderItems.reduce(
		(acc, orderItem) => {
			const orderItemProduct = orderItem.product as IProductDocument;
			const orderItemTotal = orderItem?.total || 0;
			// Accumulate order items total
			acc.orderItemsTotal += orderItemTotal;

			// Calculate taxes for this order item
			const itemTaxesTotal = orderTaxes.reduce((taxAcc, tax) => {
				const taxApplicableCategoriesIds = tax.applicableCategories;
				const orderItemProductId =
					orderItemProduct.category?._id || orderItemProduct.category;

				// Check if the tax is applicable to this order item
				if (
					tax.applicableToAllProducts ||
					taxApplicableCategoriesIds?.includes(orderItemProductId?.toString())
				)
					return (
						taxAcc + (tax.isPercentage ? (orderItemTotal * tax.rate) / 100 : tax.rate)
					);

				return taxAcc;
			}, 0);

			// Accumulate total taxes for all items
			acc.taxesTotal += itemTaxesTotal;

			return acc;
		},
		{ orderItemsTotal: 0, taxesTotal: 0 }
	);

	this.subtotal = orderItemsTotal;
	this.total = orderItemsTotal + taxesTotal + shippingMethodTotal;

	next();
});

// modal definition
const OrderModal = model<
	IOrderDocument,
	PaginateModel<IOrderDocument> & SoftDeleteModel<IOrderDocument> & IOrderModel
>("Order", OrderSchema);

export default OrderModal;
