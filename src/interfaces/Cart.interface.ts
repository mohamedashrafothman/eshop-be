import { Types } from "mongoose";
import { ICartItemDocument } from "../models/CartItem";
import { IUserDocument } from "../models/User";

export default interface Cart {
	user: Types.ObjectId | IUserDocument;
	items: (Types.ObjectId | ICartItemDocument)[];
	total: number;
	createdAt: Date;
	updateAt: Date;
}
