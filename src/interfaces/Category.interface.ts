import { Types } from "mongoose";
import IAttachment from "./Attachment.interface";
import IProduct from "./Product.interface";

export default interface Category {
	name: string;
	slug: string;
	description: string;
	icon: Types.ObjectId | IAttachment;
	parent: Types.ObjectId[] | Category[];
	children: Types.ObjectId[] | Category[];
	products: Types.ObjectId[] | IProduct[];
	productsCount: number;
	createdAt: Date;
	updateAt: Date;
}
