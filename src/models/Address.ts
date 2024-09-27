import { Document, Model, PaginateModel, Schema, model } from "mongoose";
import { SoftDeleteInterface, SoftDeleteModel } from "mongoose-delete";
import IAddress from "../interfaces/Address.interface";

// adding schema methods here
export interface IAddressDocument extends SoftDeleteInterface, IAddress, Document<string> {}

// adding statics methods here
export type IAddressModel = Model<IAddressDocument>;

// schema definition
const AddressSchema: Schema<IAddressDocument, object, IAddressDocument> = new Schema(
	{
		name: { type: String, trim: true, maxlength: 100, required: [true, "Name is required!"] },
		slug: { type: String, slug: "name", unique: true, index: true, slugPaddingSize: 6 },
		street: { type: String, trim: true, required: [true, "Street is required!"] },
		building: { type: Number, required: [true, "Building is required!"] },
		floor: { type: Number, required: [true, "Floor is required!"] },
		apartment: { type: Number, required: [true, "Apartment is required!"] },
		area: { type: String, trim: true, required: [true, "Area is required!"] },
		country: { type: String, trim: true, required: [true, "Country is required!"] },
		city: { type: String, trim: true, required: [true, "City is required!"] },
		zip: { type: String },
		default: { type: Boolean, default: false },
		user: {
			type: Schema.Types.ObjectId,
			required: [true, "User is required!"],
			ref: "User",
			autopopulate: { maxDepth: 1 },
		},
	},
	{
		toJSON: { versionKey: false, virtual: true },
		timestamps: true,
	}
);

// modal definition
const AddressModal = model<
	IAddressDocument,
	PaginateModel<IAddressDocument> & SoftDeleteModel<IAddressDocument> & IAddressModel
>("Address", AddressSchema);

export default AddressModal;
