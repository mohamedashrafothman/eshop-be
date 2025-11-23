import { AggregatePaginateModel, Document, Model, PaginateModel, Schema, model } from "mongoose";
import { SoftDeleteInterface, SoftDeleteModel } from "mongoose-delete";
import isEmail from "validator/lib/isEmail.js";
import IEmail from "../interfaces/Email.interface";

// adding schema methods here
export interface IEmailDocument extends SoftDeleteInterface, IEmail, Document<string> {
	createdAt: Date;
	updatedAt: Date;
}

// adding statics methods here
export type IEmailModel = Model<IEmailDocument>;

// schema definition
const EmailSchema: Schema<IEmailDocument, object, IEmailDocument> = new Schema(
	{
		to: [
			{
				type: String,
				index: true,
				lowercase: true,
				trim: true,
				validate: [isEmail, "Invalid Email Address"],
				description:
					"Array of recipient email addresses. Each address is trimmed, lowercased, indexed for search, and validated for proper format.",
			},
		],
		from: {
			type: String,
			index: true,
			lowercase: true,
			trim: true,
			validate: [isEmail, "Invalid Email Address"],
			description:
				"Sender email address, trimmed, lowercased, indexed, and validated for correct email format.",
		},
		html: {
			type: String,
			description:
				"The HTML content of the email, used for rich formatting and styling when sending the message.",
		},
		text: {
			type: String,
			description:
				"The plain text content of the email, used as a fallback for clients that do not support HTML.",
		},
		subject: {
			type: String,
			required: [true, "Subject is required!"],
			description:
				"The subject line of the email, required for all messages to provide context to recipients.",
		},
	},
	{ timestamps: true, collection: "Emails" }
);

// modal definition
const EmailModal = model<
	IEmailDocument,
	PaginateModel<IEmailDocument> &
		AggregatePaginateModel<IEmailDocument> &
		SoftDeleteModel<IEmailDocument> &
		IEmailModel
>("Email", EmailSchema);

export default EmailModal;
