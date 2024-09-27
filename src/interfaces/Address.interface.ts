import { Types } from "mongoose";
import { IUserDocument } from "../models/User";

export default interface Address {
	name: string;
	slug: string;
	street: string;
	building: number;
	floor: number;
	apartment: number;
	area: string;
	country: string;
	city: string;
	zip?: string | null;
	default: boolean;
	user: Types.ObjectId | IUserDocument;
	createdAt: Date;
	updateAt: Date;
}
