import { AggregatePaginateModel, Document, Model, PaginateModel, Schema, model } from "mongoose";
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
		path: { type: String, description: "The path of the file" },
		dir: { type: String, description: "The directory of the file" },
		name: { type: String, description: "The name of the file" },
		extname: { type: String, description: "The extension of the file" },
		base: { type: String, description: "The base path of the file" },
		alt: {
			type: String,
			maxlength: [150, "Alternative text can't be greater than 150 characters!"],
			default: "",
			description: "Alternative text for the file",
		},
	},
	{ toJSON: { versionKey: false, virtual: true }, timestamps: true }
);

// modal definition
const AttachmentModal = model<
	IAttachmentDocument,
	PaginateModel<IAttachmentDocument> &
		AggregatePaginateModel<IAttachmentDocument> &
		SoftDeleteModel<IAttachmentDocument> &
		IAttachmentModel
>("Attachment", AttachmentSchema);

export default AttachmentModal;
