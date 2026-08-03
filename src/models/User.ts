import to from "await-to-js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
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
import isEmail from "validator/lib/isEmail.js";
import IUser from "../interfaces/User.interface";
import vars from "../utils/vars";
import { IAddressDocument } from "./Address";
import { IRoleDocument } from "./Role";

// adding schema methods here
export interface IUserDocument
	extends SoftDeleteInterface,
		Omit<IUser, "addresses" | "roles">,
		Document<string> {
	createdAt: Date;
	updatedAt: Date;
	slug: string;
	roles: (Types.ObjectId | IRoleDocument)[];
	permissions?: string[];
	addresses: (Types.ObjectId | IAddressDocument)[] | [];
	comparePassword: (
		password: string,
		next: (err?: Error | null | boolean, check?: boolean | null | undefined) => any
	) => Promise<void>;
	gravatar: (user: IUser["email"], size: number) => string;
}

// adding statics methods here
export type IUserModel = Model<IUserDocument>;

// schema definition
const UserSchema: Schema<IUserDocument, object, IUserDocument> = new Schema(
	{
		email: {
			type: String,
			unique: true,
			index: true,
			lowercase: true,
			trim: true,
			required: [true, "Email is required!"],
			validate: [isEmail, "Invalid Email Address!"],
			description:
				"The user's email address, used for login, communication, and unique identification.",
		},
		name: {
			type: String,
			trim: true,
			maxlength: [100, "Name can't be greater than 100 characters!"],
			required: [true, "Name is required!"],
			description:
				"The full name of the user, used for display and personalization, limited to 100 characters.",
		},
		slug: {
			type: String,
			slug: "name",
			unique: true,
			index: true,
			slugPaddingSize: 6,
			description:
				"A URL-friendly version of the user's name, generated from 'name', used for routing and SEO.",
		},
		password: {
			type: String,
			hidden: true,
			description:
				"Hashed password for authentication; hidden in outputs and not exposed via toJSON.",
		},
		roles: {
			type: [Schema.Types.ObjectId],
			ref: "Role",
			default: [],
			autopopulate: { maxDepth: 1, select: "name permissions" },
			description: "The user's roles, referencing Role documents.",
		},
		active: {
			type: Boolean,
			default: false,
			description:
				"Indicates whether the user's account is active and can be used to log in.",
		},
		emailVerified: {
			type: Boolean,
			default: false,
			description: "Indicates whether the user's email address has been verified.",
		},
		google: {
			type: String,
			default: undefined,
			description: "Identifier or token for the user's Google authentication, if linked.",
		},
		facebook: {
			type: String,
			default: undefined,
			description: "Identifier or token for the user's Facebook authentication, if linked.",
		},
		addresses: [
			{
				type: Schema.Types.ObjectId,
				ref: "Address",
				default: [],
				autopopulate: { maxDepth: 1 },
				description:
					"Array of references to the user's saved addresses, autopopulated for display and order selection.",
			},
		],
	},
	{
		toJSON: {
			versionKey: false,
			virtual: true,
			transform: (_doc, { password, ...ret }) => {
				// Serialize each populated role object to just its name string
				if (Array.isArray(ret.roles)) {
					ret.roles = ret.roles.map((r: any) =>
						typeof r === "object" && r !== null && "name" in r ? r.name : String(r)
					);
				}
				return ret;
			},
		},
		timestamps: true,
		collection: "Users",
	}
);

// schema methods
UserSchema.methods.comparePassword = async function (candidatePassword, next) {
	if (!this.password) return next(false, null);
	const [isMatchError, isMatch] = await to(bcrypt.compare(candidatePassword, this.password));
	next(isMatchError, isMatch);
};

UserSchema.methods.gravatar = function (user, size = 200) {
	return `https://gravatar.com/avatar/${crypto
		.createHash("md5")
		.update(user || this.email)
		.digest("hex")}?s=${size}&d=retro`;
};

// schema hooks
UserSchema.pre("save", async function (next) {
	// If roles is empty, assign the default 'USER' role
	if (!this.roles || !this.roles.length) {
		const defaultRole = await model("Role").findOne({ name: vars.auth.roles.user });
		if (defaultRole) {
			this.roles = [defaultRole._id];
		}
	}

	// Check if password isn't modified.
	if (!this.isModified("password")) return next();

	// Generate salt.
	const [saltError, salt] = await to(bcrypt.genSalt(Number(vars.password.hashRounds)));
	if (saltError) return next(saltError);

	// Generate hashed password using generated salt.
	const [hashError, hash] = await to(bcrypt.hash(this.password, salt));
	if (hashError) return next(hashError);

	// Replace password with generated hash.
	this.password = hash;
	next();
});

// modal definition
const UserModal = model<
	IUserDocument,
	PaginateModel<IUserDocument> &
		AggregatePaginateModel<IUserDocument> &
		SoftDeleteModel<IUserDocument> &
		IUserModel
>("User", UserSchema);

export default UserModal;
