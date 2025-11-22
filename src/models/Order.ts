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
		Omit<IOrder, "user" | "items" | "history">,
		Document<string> {
	createdAt: Date;
	updatedAt: Date;
	user: Types.ObjectId | IUserDocument;
	items: (Types.ObjectId | IOrderItemDocument)[];
	history: {
		status: (typeof vars.order.status)[keyof typeof vars.order.status];
		date: Date;
		updatedBy: Types.ObjectId | IUserDocument;
	}[];
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
			description:
				"A unique, short identifier for the order used for quick reference and tracking.",
		},
		status: {
			type: String,
			enum: Object.values(vars.order.status),
			index: true,
			required: [true, "Status is required!"],
			description:
				"The current status of the order (e.g., pending, shipped, delivered), constrained to predefined allowed values.",
		},
		user: {
			type: Types.ObjectId,
			ref: "User",
			required: [true, "User is required!"],
			description: "Reference to the user who placed the order.",
		},
		items: [
			{
				type: Types.ObjectId,
				ref: "OrderItem",
				required: [true, "Order items are required!"],
				description:
					"Array of references to the items included in the order, each pointing to an OrderItem document.",
			},
		],
		taxes: [
			{
				name: {
					type: String,
					required: [true, "Tax name is required!"],
					description: "The name of the tax applied to the order.",
				},
				rate: {
					type: Number,
					default: 0,
					required: [true, "Order tax rate is required!"],
					min: [0, "Order tax rate can't be less than 0!"],
					description:
						"The rate of the tax applied, expressed as a number, defaulting to 0.",
				},
				description: {
					type: String,
					trim: true,
					maxlength: [
						1000,
						"Order tax description can't be greater than 1000 characters!",
					],
					description:
						"Optional description explaining the tax purpose or calculation rules.",
				},
				isPercentage: {
					type: Boolean,
					description:
						"Indicates whether the tax rate is a percentage of the order total.",
				},
				applicableCategories: {
					type: [String],
					default: [],
					description:
						"List of product categories to which this tax applies. Empty array means no category restriction.",
				},
				applicableToAllProducts: {
					type: Boolean,
					default: true,
					description:
						"Flag indicating whether the tax applies to all products regardless of category.",
				},
			},
		],
		shippingMethod: {
			name: {
				type: String,
				required: [true, "Shipping method name is required!"],
				description: "The name of the shipping method selected for this order.",
			},
			rate: {
				type: Number,
				required: [true, "Shipping method price is required!"],
				min: [0, "Normal price can't be less than 0!"],
				description: "The cost of the shipping method applied to the order.",
			},
			zone: {
				type: String,
				required: [true, "Zone title is required!"],
				description: "The geographical shipping zone for which this method applies.",
			},
			deliveryTime: {
				min: { type: Number, description: "Minimum estimated delivery time in days." },
				max: { type: Number, description: "Maximum estimated delivery time in days." },
			},
		},
		address: {
			name: {
				type: String,
				required: [true, "Address name is required!"],
				description: "The name associated with the delivery address.",
			},
			street: {
				type: String,
				required: [true, "Address street is required!"],
				description: "Street name of the delivery address.",
			},
			building: {
				type: Number,
				required: [true, "Address building is required!"],
				description: "Building number for the delivery address.",
			},
			floor: {
				type: Number,
				min: [1, "Floor can't be less than 1!"],
				description: "Optional floor number in the building.",
			},
			apartment: { type: String, description: "Optional apartment or unit identifier." },
			area: {
				type: String,
				required: [true, "Address area is required!"],
				description: "Neighborhood or area of the delivery address.",
			},
			country: {
				name: {
					type: String,
					index: true,
					required: [true, "Address country name is required!"],
					description: "Country name of the delivery address.",
				},
				code: {
					type: String,
					index: true,
					required: [true, "Address country code is required!"],
					description: "ISO-like code representing the country.",
				},
			},
			state: {
				name: {
					type: String,
					index: true,
					required: [true, "Address state name is required!"],
					description: "State or province name of the delivery address.",
				},
				code: {
					type: String,
					index: true,
					description: "Optional code for the state or province.",
				},
			},
			city: {
				name: { type: String, index: true, description: "Name of the city for delivery." },
			},
			zip: { type: String, description: "Postal code of the delivery address." },
		},
		paymentMethod: {
			name: {
				type: String,
				required: [true, "Payment method name is required!"],
				description: "The name of the payment method used for the order.",
			},
			description: {
				type: String,
				trim: true,
				maxlength: [1000, "Description can't be greater than 1000 characters!"],
				required: [true, "Payment method description is required!"],
				description:
					"Detailed description of the payment method, including instructions or terms.",
			},
			gateway: {
				type: Object,
				description:
					"Object containing gateway-specific configuration or transaction details.",
			},
		},
		history: [
			{
				_id: false,
				status: {
					type: String,
					enum: Object.values(vars.order.status),
					required: [true, "Status is required!"],
					description: "The status recorded in the order history at the given date.",
				},
				date: {
					type: Date,
					required: [true, "Date is required!"],
					description: "The date and time when the status update occurred.",
				},
				updatedBy: {
					type: Types.ObjectId,
					ref: "User",
					required: [true, "User is required!"],
					description: "Reference to the user who updated the order status.",
				},
			},
		],
		subtotal: {
			type: Number,
			default: 0,
			description:
				"The sum of all order items' prices before taxes, shipping, and discounts.",
		},
		total: {
			type: Number,
			default: 0,
			description:
				"The final total amount for the order, including taxes, shipping, and any discounts applied.",
		},
		note: {
			type: String,
			trim: true,
			maxlength: [1000, "Note can't be greater than 1000 characters!"],
			description: "Optional note provided by the customer or admin related to this order.",
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
	PaginateModel<IOrderDocument> &
		AggregatePaginateModel<IOrderDocument> &
		SoftDeleteModel<IOrderDocument> &
		IOrderModel
>("Order", OrderSchema);

export default OrderModal;
