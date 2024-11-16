import { Document, Model, model, PaginateModel, Schema, Types } from "mongoose";
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
		},
		slug: { type: String, slug: "code", unique: true, index: true, slugPaddingSize: 6 },
		discount: {
			type: Number,
			default: 0,
			required: [true, "Discount is required!"],
			min: [0, "Discount can't be less than 0!"],
		},
		isPercentage: { type: Boolean, default: false },
		usageLimit: { type: Number, default: 1, min: [1, "Usage limit can't be less than 1!"] },
		usageCount: { type: Number, default: 0, min: [0, "Usage count can't be less than 0!"] },
		usedBy: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [] },
		expirationDate: {
			type: Date,
			index: true,
			required: [true, "Expiration date is required!"],
		},
	},
	{ toJSON: { versionKey: false, virtual: true }, timestamps: true }
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
	PaginateModel<ICouponDocument> & SoftDeleteModel<ICouponDocument> & ICouponModel
>("Coupon", CouponSchema);

export default CouponModal;
