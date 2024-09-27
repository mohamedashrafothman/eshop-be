import { Types } from "mongoose";
import { IAttachmentDocument } from "../models/Attachment";
import { IBrandDocument } from "../models/Brand";
import { ICategoryDocument } from "../models/Category";
import { IUserDocument } from "../models/User";
import vars from "../utils/vars";

export default interface Product {
	name: string;
	slug: string;
	description: string;
	price: { normal: number; sale?: number | null; discount: number; percentage: number };
	quantity: number;
	colors: { name: string; value: string }[];
	sizes: typeof vars.products.sizes;
	images?: (Types.ObjectId | IAttachmentDocument)[];
	thumbnail: Types.ObjectId | IAttachmentDocument;
	brand: Types.ObjectId | IBrandDocument;
	category: Types.ObjectId | ICategoryDocument;
	user: Types.ObjectId | IUserDocument;
	createdAt: Date;
	updateAt: Date;
}
