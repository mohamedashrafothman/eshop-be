import { Types } from "mongoose";

export default interface Address {
	name: string;
	slug?: string;
	country: string;
	state: string;
	city: string;
	street: string;
	building: number;
	floor?: string;
	apartment?: string;
	zipCode: string;
	isDefault: boolean;
	user: Types.ObjectId;
}
