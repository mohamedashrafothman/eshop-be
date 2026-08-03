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
import IRole from "../interfaces/Role.interface";
import { IPermissionDocument } from "./Permission";

// adding schema methods here
export interface IRoleDocument
	extends SoftDeleteInterface,
		Omit<IRole, "permissions">,
		Document<string> {
	permissions: (Types.ObjectId | IPermissionDocument)[];
	createdAt: Date;
	updatedAt: Date;
}

// adding statics methods here
export type IRoleModel = Model<IRoleDocument>;

// schema definition
const RoleSchema: Schema<IRoleDocument, object, IRoleDocument> = new Schema(
	{
		name: {
			type: String,
			required: [true, "Role name is required!"],
			unique: true,
			trim: true,
			index: true,
			description: "The unique name of the role (e.g. USER, ADMIN, SUPER_ADMIN)",
		},
		description: {
			type: String,
			trim: true,
			description: "A description of the role functions",
		},
		permissions: {
			type: [Schema.Types.ObjectId],
			ref: "Permission",
			default: [],
			autopopulate: { maxDepth: 1, select: "name description" },
			description: "The list of permissions granted to this role",
		},
	},
	{ toJSON: { versionKey: false, virtual: true }, timestamps: true, collection: "Roles" }
);

// modal definition
const RoleModal = model<
	IRoleDocument,
	PaginateModel<IRoleDocument> &
		AggregatePaginateModel<IRoleDocument> &
		SoftDeleteModel<IRoleDocument> &
		IRoleModel
>("Role", RoleSchema);

export default RoleModal;
