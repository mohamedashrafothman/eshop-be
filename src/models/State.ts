import { Document, Model, model, PaginateModel, Schema, Types } from "mongoose";
import { SoftDeleteInterface, SoftDeleteModel } from "mongoose-delete";
import IState from "../interfaces/State.interface";
import { ICountryDocument } from "./Country";

// adding schema methods here
export interface IStateDocument
	extends SoftDeleteInterface,
		Omit<IState, "country">,
		Document<string> {
	createdAt: Date;
	updatedAt: Date;
	slug: string;
	country: Types.ObjectId | ICountryDocument;
}

// adding statics methods here
export type IStateModel = Model<IStateDocument>;

// schema definition
const StateSchema: Schema<IStateDocument, object, IStateDocument> = new Schema(
	{
		name: {
			type: String,
			trim: true,
			index: true,
			maxlength: [100, "Name can't be greater than 100 characters!"],
			required: [true, "Name is required!"],
		},
		slug: { type: String, slug: "name", unique: true, index: true, slugPaddingSize: 6 },
		code: {
			type: String,
			trim: true,
			uppercase: true,
			index: true,
			maxlength: [3, "Code can't be greater than 3 characters!"],
		},
		country: {
			type: Schema.Types.ObjectId,
			required: [true, "Country is required!"],
			ref: "Country",
			autopopulate: { maxDepth: 1, select: "name code" },
		},
	},
	{ toJSON: { versionKey: false, virtual: true }, timestamps: true }
);

// modal definition
const StateModal = model<
	IStateDocument,
	PaginateModel<IStateDocument> & SoftDeleteModel<IStateDocument> & IStateModel
>("State", StateSchema);

export default StateModal;
