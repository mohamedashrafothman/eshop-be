import { Types } from "mongoose";
import { ICartItemDocument } from "../models/CartItem";
import { ITaxDocument } from "../models/Tax";
import { IUserDocument } from "../models/User";

export default interface Cart {
	user: Types.ObjectId | IUserDocument;
	items: (Types.ObjectId | ICartItemDocument)[];
	taxes: (Types.ObjectId | ITaxDocument)[];
	subtotal: number;
	total: number;
}
