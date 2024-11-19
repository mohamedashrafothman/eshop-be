import { Document, Model, model, PaginateModel, Schema, Types } from "mongoose";
import { SoftDeleteInterface, SoftDeleteModel } from "mongoose-delete";
import isInt from "validator/lib/isInt";
import IReview from "../interfaces/Review.interface";
import { IProductDocument } from "./Product";
import { IUserDocument } from "./User";

// adding schema methods here
export interface IReviewDocument
	extends SoftDeleteInterface,
		Omit<IReview, "product" | "user">,
		Document<string> {
	createdAt: Date;
	updatedAt: Date;
	product: Types.ObjectId | IProductDocument;
	user: Types.ObjectId | IUserDocument;
}

// adding statics methods here
export type IReviewModel = Model<IReviewDocument>;

// schema definition
const ReviewSchema: Schema<IReviewDocument, object, IReviewDocument> = new Schema(
	{
		comment: {
			type: String,
			trim: true,
			maxlength: [1000, "Comment can't be greater than 1000 characters!"],
		},
		rating: {
			type: Number,
			min: [1, "Rating can't be less than 1!"],
			max: [5, "Rating can't be greater than 5!"],
			default: 0,
			index: true,
			validate: [
				(value: IReview["rating"]) => isInt(String(value)),
				"Rating must be an integer number!",
			],
			required: [true, "Rating is required!"],
		},
		product: {
			type: Schema.Types.ObjectId,
			ref: "Product",
			required: [true, "Product is required!"],
		},
		user: { type: Schema.Types.ObjectId, ref: "User", required: [true, "User is required!"] },
	},
	{ toJSON: { versionKey: false, virtual: true }, timestamps: true }
);

// modal definition
const ReviewModal = model<
	IReviewDocument,
	PaginateModel<IReviewDocument> & SoftDeleteModel<IReviewDocument> & IReviewModel
>("Review", ReviewSchema);

export default ReviewModal;
