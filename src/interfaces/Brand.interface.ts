import { Types } from "mongoose";
import IAttachment from "./Attachment.interface";
import IProduct from "./Product.interface";

export default interface Category {
	name: string;
	slug: string;
	description?: string;
	logo?: Types.ObjectId | IAttachment;
	products: Types.ObjectId[] | IProduct[];
	productsCount: number;
	createdAt: Date;
	updateAt: Date;
}
