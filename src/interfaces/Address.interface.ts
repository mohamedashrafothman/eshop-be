import { Types } from "mongoose";
import IUser from "./User.interface";

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
	user: Types.ObjectId | IUser;
	createdAt: Date;
	updateAt: Date;
}
