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
		name: { type: String, index: true, required: true },
		slug: { type: String, slug: "name", unique: true, index: true, slugPaddingSize: 6 },
		country: { type: String, required: true },
		city: { type: String, required: true },
		state: { type: String, required: true },
		street: { type: String, required: true },
		building: { type: Number, required: true },
		floor: { type: String },
		apartment: { type: String },
		zipCode: { type: String, required: true },
		isDefault: { type: Boolean, default: false, index: true },
		user: { type: Schema.Types.ObjectId, required: true, ref: "User", autopopulate: true },
	},
	{ timestamps: true }
);

// modal definition
const AddressModal = model<
	IAddressDocument,
	PaginateModel<IAddressDocument> & SoftDeleteModel<IAddressDocument> & IAddressModel
>("Address", AddressSchema);

export default AddressModal;
