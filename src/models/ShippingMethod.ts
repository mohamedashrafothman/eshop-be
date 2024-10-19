import { Document, Model, PaginateModel, Schema, model } from "mongoose";
import { SoftDeleteInterface, SoftDeleteModel } from "mongoose-delete";
import IShippingMethod from "../interfaces/ShippingMethod.interface";

// adding schema methods here
export interface IShippingMethodDocument
	extends SoftDeleteInterface,
		IShippingMethod,
		Document<string> {
	createdAt: Date;
	updatedAt: Date;
	slug: string;
}

// adding statics methods here
export type IShippingMethodModel = Model<IShippingMethodDocument>;

// schema definition
const ShippingMethodSchema: Schema<IShippingMethodDocument, object, IShippingMethodDocument> =
	new Schema(
		{
			name: {
				type: String,
				trim: true,
				maxlength: [100, "Name can't be greater than 100 characters!"],
				required: [true, "Name is required!"],
			},
			slug: { type: String, slug: "name", unique: true, index: true, slugPaddingSize: 6 },
			description: {
				type: String,
				trim: true,
				maxlength: [500, "Description can't be greater than 500 characters!"],
			},
			rate: {
				type: Number,
				min: [0, "Normal price can't be less than 0!"],
				required: [true, "Normal price is required!"],
			},
			deliveryTime: {
				min: {
					type: Number,
					default: 1,
					required: [true, "Minimum delivery time is required!"],
				},
				max: { type: Number },
			},
			zone: {
				type: Schema.Types.ObjectId,
				ref: "Zone",
				required: [true, "Zone is required!"],
				autopopulate: { maxDepth: 1, select: "name rate countries states cities" },
			},
		},
		{ toJSON: { versionKey: false, virtual: true }, timestamps: true }
	);

// modal definition
const ShippingMethodModal = model<
	IShippingMethodDocument,
	PaginateModel<IShippingMethodDocument> &
		SoftDeleteModel<IShippingMethodDocument> &
		IShippingMethodModel
>("ShippingMethod", ShippingMethodSchema);

export default ShippingMethodModal;
