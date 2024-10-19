import { Document, Model, PaginateModel, Schema, model } from "mongoose";
import { SoftDeleteInterface, SoftDeleteModel } from "mongoose-delete";
import IAttachment from "../interfaces/Attachment.interface";

// adding schema methods here
export interface IAttachmentDocument extends SoftDeleteInterface, IAttachment, Document<string> {
	createdAt: Date;
	updatedAt: Date;
}

// adding statics methods here
export type IAttachmentModel = Model<IAttachmentDocument>;

// schema definition
const AttachmentSchema: Schema<IAttachmentDocument, object, IAttachmentDocument> = new Schema(
	{
		path: { type: String },
		dir: { type: String },
		name: { type: String },
		extname: { type: String },
		base: { type: String },
		alt: {
			type: String,
			maxlength: [150, "Alternative text can't be greater than 150 characters!"],
			default: "",
		},
	},
	{ toJSON: { versionKey: false, virtual: true }, timestamps: true }
);

// modal definition
const AttachmentModal = model<
	IAttachmentDocument,
	PaginateModel<IAttachmentDocument> & SoftDeleteModel<IAttachmentDocument> & IAttachmentModel
>("Attachment", AttachmentSchema);

export default AttachmentModal;
