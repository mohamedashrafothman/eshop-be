import { Document, Model, model, PaginateModel, Schema } from "mongoose";
import { SoftDeleteInterface, SoftDeleteModel } from "mongoose-delete";
import ICart from "../interfaces/Cart.interface";
import { ICartItemDocument } from "./CartItem";

// adding schema methods here
export interface ICartDocument extends SoftDeleteInterface, ICart, Document<string> {}

// adding statics methods here
export type ICartModel = Model<ICartDocument>;

// schema definition
const CartSchema: Schema<ICartDocument, object, ICartDocument> = new Schema(
	{
		user: { type: Schema.Types.ObjectId, ref: "User", required: [true, "User is required!"] },
		items: [
			{
				type: Schema.Types.ObjectId,
				ref: "CartItem",
				autopopulate: { maxDepth: 2, select: "quantity total price size color product" },
			},
		],
		total: { type: Number, default: 0, required: [true, "Total is required!"] },
	},
	{ toJSON: { versionKey: false, virtual: true }, timestamps: true }
);

// schema hooks
CartSchema.pre("save", async function (next) {
	// check if items is modified
	if (!this.isModified("items")) return next();

	// populate items to get total value from each cart item product.
	await this.populate("items");

	// calculate total based on cart items totals.
	this.total = (this.items as ICartItemDocument[]).reduce(
		(total: number, item) => total + item.total,
		0
	);

	next();
});

// modal definition
const CartModal = model<
	ICartDocument,
	PaginateModel<ICartDocument> & SoftDeleteModel<ICartDocument> & ICartModel
>("Cart", CartSchema);

export default CartModal;
