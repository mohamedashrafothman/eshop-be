import { Document, Model, PaginateModel, Schema, model } from "mongoose";
import { SoftDeleteInterface, SoftDeleteModel } from "mongoose-delete";
import IAddress from "../interfaces/Address.interface";

// adding schema methods here
export interface IAddressDocument extends SoftDeleteInterface, IAddress, Document<string> {}

// adding statics methods here
export type IAddressModel = Model<IAddressDocument>;

// schema definition
const AddressSchema = new Schema<IAddressDocument, object, IAddressDocument>(
	{
		name: { type: String, index: true, required: [true, "Name is required!"] },
		slug: { type: String, slug: "name", unique: true, index: true, slugPaddingSize: 6 },
		country: { type: String, required: [true, "Country is required!"] },
		city: { type: String, required: [true, "City is required!"] },
		state: { type: String, required: [true, "State is required!"] },
		street: { type: String, required: [true, "Street is required!"] },
		building: { type: Number, required: [true, "Building is required!"] },
		floor: { type: String },
		apartment: { type: String },
		zipCode: { type: String, required: [true, "Zip Code is required!"] },
		isDefault: { type: Boolean, default: false, index: true },
		user: { type: Schema.Types.ObjectId, required: [true, "User is required!"], ref: "User", autopopulate: true },
	},
	{ timestamps: true }
);

// modal definition
const AddressModal = model<
	IAddressDocument,
	PaginateModel<IAddressDocument> & SoftDeleteModel<IAddressDocument> & IAddressModel
>("Address", AddressSchema);

export default AddressModal;
