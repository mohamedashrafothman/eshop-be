import { Document, Model, PaginateModel, Schema, model } from "mongoose";
import { SoftDeleteInterface, SoftDeleteModel } from "mongoose-delete";
import IToken from "../interfaces/Token.interface";
import vars from "../utils/vars";

// adding schema methods here
export interface ITokenDocument extends SoftDeleteInterface, IToken, Document<string> {
	createdAt: Date;
	updatedAt: Date;
}

// adding statics methods here
export type ITokenModel = Model<ITokenDocument>;

// schema definition
const TokenSchema: Schema<ITokenDocument, object, ITokenDocument> = new Schema(
	{
		user: {
			type: Schema.Types.ObjectId,
			required: [true, "User is required!"],
			ref: "User",
			autopopulate: true,
		},
		kind: {
			type: String,
			required: [true, "Kind is required!"],
			enum: [...Object.values(vars.tokenTypes)],
		},
		token: {
			type: String,
			required: [true, "Token is required!"],
			index: true,
		},
		expireAt: { type: Date },
	},
	{ toJSON: { versionKey: false, virtual: true }, timestamps: true }
);

// modal definition
const TokenModal = model<
	ITokenDocument,
	PaginateModel<ITokenDocument> & SoftDeleteModel<ITokenDocument> & ITokenModel
>("Token", TokenSchema);

export default TokenModal;
