import { Types } from "mongoose";
import { IAddressDocument } from "../models/Address";

export default interface User {
	email: string;
	name: string;
	password: string;
	picture: string;
	role: string;
	active: boolean;
	emailVerified: boolean;
	google?: string;
	facebook?: string;
	addresses: (Types.ObjectId | IAddressDocument)[] | [];
}
