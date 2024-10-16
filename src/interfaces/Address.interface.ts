import { Types } from "mongoose";
import { IUserDocument } from "../models/User";

export default interface Address {
	name: string;
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
}
