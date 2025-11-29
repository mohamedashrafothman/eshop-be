import {
	AggregatePaginateModel,
	Document,
	Model,
	PaginateModel,
	Schema,
	Types,
	model,
} from "mongoose";
import { SoftDeleteInterface, SoftDeleteModel } from "mongoose-delete";
import IAddress from "../interfaces/Address.interface";
import { ICityDocument } from "./City";
import { ICountryDocument } from "./Country";
import { IStateDocument } from "./State";
import { IUserDocument } from "./User";

// adding schema methods here
export interface IAddressDocument
	extends SoftDeleteInterface,
		Omit<IAddress, "country" | "state" | "city" | "user">,
		Document<string> {
	createdAt: Date;
	updatedAt: Date;
	slug: string;
	country: Types.ObjectId | ICountryDocument;
	state: Types.ObjectId | IStateDocument;
	city?: Types.ObjectId | ICityDocument;
	user: Types.ObjectId | IUserDocument;
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
			description: "Human-readable name for the address (e.g., Home, Office).",
		},
		slug: {
			type: String,
			slug: "name",
			unique: true,
			index: true,
			slugPaddingSize: 6,
			description: "Auto-generated unique slug based on the name.",
		},
		street: {
			type: String,
			trim: true,
			required: [true, "Street is required!"],
			description: "Street name or street description of the address.",
		},
		building: {
			type: Number,
			required: [true, "Building is required!"],
			description: "Building number of the address.",
		},
		floor: {
			type: Number,
			min: [1, "Floor can't be less than 1!"],
			description: "Floor number. Must be at least 1.",
		},
		apartment: {
			type: String,
			description: "Apartment or unit number, if applicable.",
		},
		area: {
			type: String,
			trim: true,
			required: [true, "Area is required!"],
			description: "Neighborhood, district, or area name.",
		},
		zip: {
			type: String,
			description: "Postal or ZIP code of the location.",
		},
		default: {
			type: Boolean,
			default: false,
			description: "Indicates whether this address is the user's default address.",
		},
		country: {
			type: Schema.Types.ObjectId,
			ref: "Country",
			required: [true, "Country is required!"],
			autopopulate: { maxDepth: 1, select: "name code" },
			description: "Reference to the country where this address is located.",
		},
		state: {
			type: Schema.Types.ObjectId,
			ref: "State",
			required: [true, "State is required!"],
			autopopulate: { maxDepth: 1, select: "name code" },
			description: "Reference to the state/province for this address.",
		},
		city: {
			type: Schema.Types.ObjectId,
			ref: "City",
			required: [true, "City is required!"],
			autopopulate: { maxDepth: 1, select: "name" },
			description: "Reference to the city where the address is located.",
		},
		user: {
			type: Schema.Types.ObjectId,
			ref: "User",
			required: [true, "User is required!"],
			description: "The user who owns this address.",
		},
	},
	{ toJSON: { versionKey: false, virtual: true }, timestamps: true, collection: "Addresses" }
);

// modal definition
const AddressModal = model<
	IAddressDocument,
	PaginateModel<IAddressDocument> &
		AggregatePaginateModel<IAddressDocument> &
		SoftDeleteModel<IAddressDocument> &
		IAddressModel
>("Address", AddressSchema);

export default AddressModal;
