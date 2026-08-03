import { AggregatePaginateModel, Document, Model, model, PaginateModel, Schema } from "mongoose";
import { SoftDeleteInterface, SoftDeleteModel } from "mongoose-delete";
import IPermission from "../interfaces/Permission.interface";

export interface IPermissionDocument extends SoftDeleteInterface, IPermission, Document<string> {
	createdAt: Date;
	updatedAt: Date;
}

export type IPermissionModel = Model<IPermissionDocument>;

const PermissionSchema: Schema<IPermissionDocument, object, IPermissionDocument> = new Schema(
	{
		name: {
			type: String,
			trim: true,
			unique: true,
			index: true,
			required: [true, "Permission name is required!"],
			description: "The unique name of the permission (e.g. create:product)",
		},
		description: {
			type: String,
			trim: true,
			description: "A description of what this permission allows",
		},
	},
	{ toJSON: { versionKey: false, virtual: true }, timestamps: true, collection: "Permissions" }
);

const PermissionModal = model<
	IPermissionDocument,
	PaginateModel<IPermissionDocument> &
		AggregatePaginateModel<IPermissionDocument> &
		SoftDeleteModel<IPermissionDocument> &
		IPermissionModel
>("Permission", PermissionSchema);

export default PermissionModal;
