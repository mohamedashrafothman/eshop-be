import { Types } from "mongoose";
import vars from "../utils/vars";
import IAttachment from "./Attachment.interface";
import IBrand from "./Brand.interface";
import ICategory from "./Category.interface";
import IUser from "./User.interface";

export default interface Product {
	name: string;
	slug: string;
	description: string;
	price: { normal: number; sale?: number | null; discount: number; percentage: number };
	quantity: number;
	colors: { name: string; value: string }[];
	sizes: typeof vars.products.sizes;
	images?: Types.ObjectId[] | IAttachment[];
	thumbnail: Types.ObjectId | IAttachment;
	brand: Types.ObjectId | IBrand;
	category: Types.ObjectId | ICategory;
	user: Types.ObjectId | IUser;
	createdAt: Date;
	updateAt: Date;
}
