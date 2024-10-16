import { Document, Model, PaginateModel, Schema, model } from "mongoose";
import { SoftDeleteInterface, SoftDeleteModel } from "mongoose-delete";
import isInt from "validator/lib/isInt";
import IReview from "../interfaces/Review.interface";

// adding schema methods here
export interface IReviewDocument extends SoftDeleteInterface, IReview, Document<string> {
	createdAt: Date;
	updatedAt: Date;
}

// adding statics methods here
export type IReviewModel = Model<IReviewDocument>;

// schema definition
const ReviewSchema: Schema<IReviewDocument, object, IReviewDocument> = new Schema(
	{
		title: {
			type: String,
			trim: true,
			maxlength: [100, "Title can't be greater than 100 characters!"],
			required: [true, "Title is required!"],
		},
		slug: { type: String, slug: "title", unique: true, index: true, slugPaddingSize: 6 },
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
			autopopulate: { maxDepth: 1, select: "name" },
		},
		user: {
			type: Schema.Types.ObjectId,
			ref: "User",
			required: [true, "User is required!"],
			autopopulate: { maxDepth: 1, select: "name" },
		},
	},
	{ toJSON: { versionKey: false, virtual: true }, timestamps: true }
);

// modal definition
const ReviewModal = model<
	IReviewDocument,
	PaginateModel<IReviewDocument> & SoftDeleteModel<IReviewDocument> & IReviewModel
>("Review", ReviewSchema);

export default ReviewModal;
