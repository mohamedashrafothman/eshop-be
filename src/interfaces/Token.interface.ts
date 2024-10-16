import { Types } from "mongoose";
import { IUserDocument } from "../models/User";

export default interface Token {
	user: Types.ObjectId | IUserDocument;
	kind: string;
	token: string;
	expireAt: Date;
}
