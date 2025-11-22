import { Document, Model, model, PaginateModel, Schema, Types } from "mongoose";
import { SoftDeleteInterface, SoftDeleteModel } from "mongoose-delete";
import IShippingMethod from "../interfaces/ShippingMethod.interface";
import { IZoneDocument } from "./Zone";

// adding schema methods here
export interface IShippingMethodDocument
	extends SoftDeleteInterface,
		Omit<IShippingMethod, "zone">,
		Document<string> {
	createdAt: Date;
	updatedAt: Date;
	slug: string;
	zone: Types.ObjectId | IZoneDocument;
}

// adding statics methods here
export type IShippingMethodModel = Model<IShippingMethodDocument>;

// schema definition
const ShippingMethodSchema: Schema<IShippingMethodDocument, object, IShippingMethodDocument> =
	new Schema(
		{
			name: {
				type: String,
				trim: true,
				maxlength: [100, "Name can't be greater than 100 characters!"],
				required: [true, "Name is required!"],
				description:
					"The name of the shipping method, used for display and selection in orders.",
			},
			slug: {
				type: String,
				slug: "name",
				unique: true,
				index: true,
				slugPaddingSize: 6,
				description:
					"A URL-friendly version of the shipping method name, automatically generated for routing and SEO purposes.",
			},
			description: {
				type: String,
				trim: true,
				maxlength: [500, "Description can't be greater than 500 characters!"],
				description:
					"Optional descriptive text providing details about the shipping method, such as delivery features or restrictions.",
			},
			rate: {
				type: Number,
				min: [0, "Normal price can't be less than 0!"],
				required: [true, "Normal price is required!"],
				description: "The cost associated with this shipping method.",
			},
			deliveryTime: {
				min: {
					type: Number,
					default: 1,
					required: [true, "Minimum delivery time is required!"],
					description:
						"The minimum estimated delivery time in days for this shipping method.",
				},
				max: {
					type: Number,
					description:
						"The maximum estimated delivery time in days for this shipping method.",
				},
			},
			zone: {
				type: Schema.Types.ObjectId,
				ref: "Zone",
				index: true,
				required: [true, "Zone is required!"],
				autopopulate: { maxDepth: 1, select: "name rate countries states cities" },
				description:
					"Reference to the geographical zone this shipping method applies to, autopopulated for display and filtering.",
			},
		},
		{ toJSON: { versionKey: false, virtual: true }, timestamps: true }
	);

// modal definition
const ShippingMethodModal = model<
	IShippingMethodDocument,
	PaginateModel<IShippingMethodDocument> &
		SoftDeleteModel<IShippingMethodDocument> &
		IShippingMethodModel
>("ShippingMethod", ShippingMethodSchema);

export default ShippingMethodModal;
