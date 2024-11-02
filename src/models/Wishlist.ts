import { Document, Model, PaginateModel, Schema, Types, model } from "mongoose";
import { SoftDeleteInterface, SoftDeleteModel } from "mongoose-delete";
import IWishlist from "../interfaces/Wishlist.interface";
import { IProductDocument } from "./Product";
import { IUserDocument } from "./User";

// adding schema methods here
export interface IWishlistDocument
	extends SoftDeleteInterface,
		Omit<IWishlist, "user" | "products">,
		Document<string> {
	createdAt: Date;
	updatedAt: Date;
	user: Types.ObjectId | IUserDocument;
	products: (Types.ObjectId | IProductDocument)[];
}

// adding statics methods here
export type IWishlistModel = Model<IWishlistDocument>;

// schema definition
const WishlistSchema: Schema<IWishlistDocument, object, IWishlistDocument> = new Schema(
	{
		user: {
			type: Schema.Types.ObjectId,
			ref: "User",
			index: true,
			required: [true, "User is required!"],
		},
		products: [{ type: Schema.Types.ObjectId, ref: "Product" }],
	},
	{ toJSON: { versionKey: false, virtual: true }, timestamps: true }
);

// modal definition
const WishlistModal = model<
	IWishlistDocument,
	PaginateModel<IWishlistDocument> & SoftDeleteModel<IWishlistDocument> & IWishlistModel
>("Wishlist", WishlistSchema);

export default WishlistModal;
