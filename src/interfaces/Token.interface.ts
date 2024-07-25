import { Types } from "mongoose";

export default interface Token {
	user: Types.ObjectId;
	kind: string;
	token: string;
	expireAt: Date;
}
