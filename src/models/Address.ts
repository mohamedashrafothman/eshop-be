import { Document, Model, PaginateModel, Schema, model } from "mongoose";
import { SoftDeleteInterface, SoftDeleteModel } from "mongoose-delete";
import IAddress from "../interfaces/Address.interface";

// adding schema methods here
export interface IAddressDocument extends SoftDeleteInterface, IAddress, Document<string> {
	createdAt: Date;
	updatedAt: Date;
	slug: string;
}

// adding statics methods here
export type IAddressModel = Model<IAddressDocument>;

// schema definition
const AddressSchema: Schema<IAddressDocument, object, IAddressDocument> = new Schema(
	{
		name: {
			type: String,
			trim: true,
			maxlength: [100, "Name can't be greater than 100 characters!"],
			required: [true, "Name is required!"],
		},
		slug: { type: String, slug: "name", unique: true, index: true, slugPaddingSize: 6 },
		street: { type: String, trim: true, required: [true, "Street is required!"] },
		building: { type: Number, required: [true, "Building is required!"] },
		floor: { type: Number },
		apartment: { type: String },
		area: { type: String, trim: true, required: [true, "Area is required!"] },
		zip: { type: String },
		default: { type: Boolean, default: false },
		country: {
			type: Schema.Types.ObjectId,
			ref: "Country",
			required: [true, "Country is required!"],
			autopopulate: { maxDepth: 1, select: "name code" },
		},
		state: {
			type: Schema.Types.ObjectId,
			ref: "State",
			required: [true, "State is required!"],
			autopopulate: { maxDepth: 1, select: "name code" },
		},
		city: {
			type: Schema.Types.ObjectId,
			ref: "City",
			required: [true, "City is required!"],
			autopopulate: { maxDepth: 1, select: "name" },
		},
		user: {
			type: Schema.Types.ObjectId,
			ref: "User",
			required: [true, "User is required!"],
			autopopulate: { maxDepth: 1 },
		},
	},
	{ toJSON: { versionKey: false, virtual: true }, timestamps: true }
);

// modal definition
const AddressModal = model<
	IAddressDocument,
	PaginateModel<IAddressDocument> & SoftDeleteModel<IAddressDocument> & IAddressModel
>("Address", AddressSchema);

export default AddressModal;
