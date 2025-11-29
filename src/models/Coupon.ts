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
import ICoupon from "../interfaces/Coupon.interface";
import { ICategoryDocument } from "./Category";

// adding schema methods here
export interface ICouponDocument
	extends SoftDeleteInterface,
		Omit<ICoupon, "usedBy">,
		Document<string> {
	createdAt: Date;
	updatedAt: Date;
	slug: string;
	usedBy: (Types.ObjectId | ICategoryDocument)[];
}

// adding statics methods here
export type ICouponModel = Model<ICouponDocument>;

// schema definition
const CouponSchema: Schema<ICouponDocument, object, ICouponDocument> = new Schema(
	{
		code: {
			type: String,
			unique: true,
			index: true,
			trim: true,
			maxlength: [20, "code can't be greater than 20 characters!"],
			minLength: [3, "code can't be less than 3 characters!"],
			required: [true, "code is required!"],
			description:
				"The unique coupon code entered by users to receive discounts, trimmed and constrained between 3 and 20 characters.",
		},
		slug: {
			type: String,
			slug: "code",
			unique: true,
			index: true,
			slugPaddingSize: 6,
			description:
				"A URL-friendly version of the coupon code, automatically generated from 'code', used for routing and SEO purposes.",
		},
		discount: {
			type: Number,
			default: 0,
			required: [true, "Discount is required!"],
			min: [0, "Discount can't be less than 0!"],
			description:
				"The numeric value of the discount provided by the coupon, either in currency or percentage based on 'isPercentage'.",
		},
		isPercentage: {
			type: Boolean,
			default: false,
			description:
				"Indicates whether the discount is a percentage of the total order (true) or a fixed amount (false).",
		},
		usageLimit: {
			type: Number,
			default: 1,
			min: [1, "Usage limit can't be less than 1!"],
			description: "The maximum number of times this coupon can be used across all users.",
		},
		usageCount: {
			type: Number,
			default: 0,
			min: [0, "Usage count can't be less than 0!"],
			description: "Tracks how many times the coupon has already been used.",
		},
		usedBy: {
			type: [{ type: Schema.Types.ObjectId, ref: "User" }],
			default: [],
			description:
				"Array of references to users who have redeemed this coupon, useful for tracking and validation.",
		},
		expirationDate: {
			type: Date,
			index: true,
			required: [true, "Expiration date is required!"],
			description:
				"The date after which the coupon becomes invalid, indexed for efficient querying of active coupons.",
		},
	},
	{ toJSON: { versionKey: false, virtual: true }, timestamps: true, collection: "Coupons" }
);

// schema hooks
CouponSchema.pre("save", async function (next) {
	// Check if usedBy array is modified
	if (!this.isModified("usedBy")) return next();

	// Update usage count
	this.usageCount = this.usedBy.length;

	next();
});

// modal definition
const CouponModal = model<
	ICouponDocument,
	PaginateModel<ICouponDocument> &
		AggregatePaginateModel<ICouponDocument> &
		SoftDeleteModel<ICouponDocument> &
		ICouponModel
>("Coupon", CouponSchema);

export default CouponModal;
