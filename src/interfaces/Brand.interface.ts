import IAttachment from "./Attachment.interface";

export default interface Category {
	name: string;
	slug: string;
	description?: string;
	logo?: IAttachment;
	createdAt: Date;
	updateAt: Date;
}
