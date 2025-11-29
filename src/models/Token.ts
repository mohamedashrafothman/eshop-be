import {
	AggregatePaginateModel,
	Document,
	Model,
	model,
	PaginateModel,
	Schema,
	Types,
} from "mongoose";
import { SoftDeleteInterface, SoftDeleteModel } from "mongoose-delete";
import IToken from "../interfaces/Token.interface";
import vars from "../utils/vars";
import { IUserDocument } from "./User";

// adding schema methods here
export interface ITokenDocument
	extends SoftDeleteInterface,
		Omit<IToken, "user">,
		Document<string> {
	createdAt: Date;
	updatedAt: Date;
	user: Types.ObjectId | IUserDocument;
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
			description:
				"Reference to the user associated with this token, autopopulated for convenience.",
		},
		kind: {
			type: String,
			required: [true, "Kind is required!"],
			enum: [...Object.values(vars.tokenTypes)],
			description:
				"The type of token, such as access, refresh, or password reset, restricted to predefined values.",
		},
		token: {
			type: String,
			required: [true, "Token is required!"],
			index: true,
			description:
				"The unique token string used for authentication or verification purposes.",
		},
		expireAt: {
			type: Date,
			description:
				"Optional expiration date and time for the token, after which it becomes invalid.",
		},
	},
	{ toJSON: { versionKey: false, virtual: true }, timestamps: true, collection: "Tokens" }
);

// modal definition
const TokenModal = model<
	ITokenDocument,
	PaginateModel<ITokenDocument> &
		AggregatePaginateModel<ITokenDocument> &
		SoftDeleteModel<ITokenDocument> &
		ITokenModel
>("Token", TokenSchema);

export default TokenModal;
