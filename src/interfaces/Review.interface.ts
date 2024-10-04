import { Types } from "mongoose";
import { IProductDocument } from "../models/Product";
import { IUserDocument } from "../models/User";

export default interface Review {
	title: string;
	slug: string;
	rating: number;
	comment: string;
	product: Types.ObjectId | IProductDocument;
	user: Types.ObjectId | IUserDocument;
	createdAt: Date;
	updateAt: Date;
}
