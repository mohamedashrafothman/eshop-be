import {
	AggregatePaginateModel,
	Document,
	Model,
	model,
	PaginateModel,
	Schema,
	Types,
} from "mongoose";
import { SoftDeleteInterface, SoftDeleteModel } from "mongoose-delete";
import IPaymentMethod, { PAYMENT_METHODS } from "../interfaces/PaymentMethod.interface";
import { IAttachmentDocument } from "./Attachment";

// adding schema methods here
export interface IPaymentMethodDocument
	extends SoftDeleteInterface,
		Omit<IPaymentMethod, "icon">,
		Document<string> {
	icon: Types.ObjectId | IAttachmentDocument;
	createdAt: Date;
	updatedAt: Date;
}

// adding statics methods here
export type IPaymentMethodModel = Model<IPaymentMethodDocument>;

// schema definition
const PaymentMethodSchema: Schema<IPaymentMethodDocument, object, IPaymentMethodDocument> =
	new Schema(
		{
			method: {
				type: String,
				enum: PAYMENT_METHODS,
				required: [true, "Method is required!"],
				index: true,
				unique: true,
				description:
					"The type of payment method (e.g., credit card, PayPal), constrained to allowed values in PAYMENT_METHODS.",
			},
			description: {
				type: String,
				trim: true,
				maxlength: [1000, "Description can't be greater than 1000 characters!"],
				description:
					"Detailed explanation of the payment method, including usage instructions or conditions, limited to 1000 characters.",
			},
			icon: {
				type: Schema.Types.ObjectId,
				ref: "Attachment",
				required: [true, "Icon is required!"],
				autopopulate: { select: "path alt" },
				description:
					"Reference to an attachment representing the icon for this payment method, autopopulated with path and alt text for display purposes.",
			},
		},
		{ toJSON: { versionKey: false, virtual: true }, timestamps: true }
	);

// modal definition
const PaymentMethodModal = model<
	IPaymentMethodDocument,
	PaginateModel<IPaymentMethodDocument> &
		AggregatePaginateModel<IPaymentMethodDocument> &
		SoftDeleteModel<IPaymentMethodDocument> &
		IPaymentMethodModel
>("PaymentMethod", PaymentMethodSchema);

export default PaymentMethodModal;
