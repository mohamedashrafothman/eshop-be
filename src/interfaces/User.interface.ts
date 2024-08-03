import { Types } from "mongoose";
import IAddress from "./Address.interface";

export default interface User {
	email: string;
	name: string;
	slug: string;
	password: string;
	picture: string;
	role: string;
	active: boolean;
	emailVerified: boolean;
	google?: string;
	facebook?: string;
	addresses: [Types.ObjectId | IAddress] | [];
	createdAt: Date;
	updateAt: Date;
}
