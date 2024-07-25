import { Document, Model, PaginateModel, Schema, model } from "mongoose";
import { SoftDeleteInterface, SoftDeleteModel } from "mongoose-delete";
import IToken from "../interfaces/Token.interface";
import vars from "../utils/vars";

// adding schema methods here
export interface ITokenDocument extends SoftDeleteInterface, IToken, Document<string> {}

// adding statics methods here
export type ITokenModel = Model<ITokenDocument>;

// schema definition
const TokenSchema = new Schema<ITokenDocument, object, ITokenDocument>(
	{
		user: { type: Schema.Types.ObjectId, required: true, ref: "User", autopopulate: true },
		kind: { type: String, required: true, enum: [...Object.values(vars.tokenTypes)] },
		token: { type: String, required: true, index: true },
		expireAt: { type: Date },
	},
	{ timestamps: true }
);

// modal definition
const TokenModal = model<ITokenDocument, PaginateModel<ITokenDocument> & SoftDeleteModel<ITokenDocument> & ITokenModel>(
	"Token",
	TokenSchema
);

export default TokenModal;
