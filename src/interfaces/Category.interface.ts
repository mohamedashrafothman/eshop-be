import { Types } from "mongoose";
import { IAttachmentDocument } from "../models/Attachment";
import { ICategoryDocument } from "../models/Category";
import { IProductDocument } from "../models/Product";

export default interface Category {
	name: string;
	description: string;
	icon: Types.ObjectId | IAttachmentDocument;
	parent: (Types.ObjectId | ICategoryDocument)[];
	children: (Types.ObjectId | ICategoryDocument)[];
	products: (Types.ObjectId | IProductDocument)[];
	productsCount: number;
}
