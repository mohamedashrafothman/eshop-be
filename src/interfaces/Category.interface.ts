import { Types } from "mongoose";
import IAttachment from "./Attachment.interface";

export default interface Category {
	name: string;
	slug: string;
	description: string;
	picture: IAttachment;
	icon: IAttachment;
	parent: Types.ObjectId[] | Category[];
	children: Types.ObjectId[] | Category[];
	createdAt: Date;
	updateAt: Date;
}
