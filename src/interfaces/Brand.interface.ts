import { Types } from "mongoose";
import { IAttachmentDocument } from "../models/Attachment";
import { IProductDocument } from "../models/Product";

export default interface Category {
	name: string;
	slug: string;
	description?: string;
	logo?: Types.ObjectId | IAttachmentDocument;
	products: (Types.ObjectId | IProductDocument)[];
	productsCount: number;
}
