import to from "await-to-js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Document, Model, PaginateModel, Schema, model } from "mongoose";
import { SoftDeleteInterface, SoftDeleteModel } from "mongoose-delete";
import isEmail from "validator/lib/isEmail.js";
import IUser from "../interfaces/User.interface";
import vars from "../utils/vars";

// adding schema methods here
export interface IUserDocument extends SoftDeleteInterface, IUser, Document<string> {
	comparePassword: (
		password: string,
		next: (err?: Error | null | boolean, check?: boolean | null | undefined) => any
	) => Promise<void>;
	createHashToken: () => string;
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
		},
		name: { type: String, trim: true, required: [true, "Name is required!"] },
		slug: {
			type: String,
			slug: "name",
			unique: true,
			index: true,
			slugPaddingSize: 6,
		},
		password: { type: String, hidden: true },
		picture: { type: String },
		role: {
			type: String,
			enum: [...Object.values(vars.auth.roles)],
			default: vars.auth.roles.user,
			required: [true, "Role is required!"],
		},
		active: { type: Boolean, default: false },
		emailVerified: { type: Boolean, default: false },
		google: { type: String, default: undefined },
		facebook: { type: String, default: undefined },
		addresses: [
			{
				type: Schema.Types.ObjectId,
				ref: "Address",
				default: [],
				autopopulate: { maxDepth: 1 },
			},
		],
	},
	{
		toJSON: {
			versionKey: false,
			virtual: true,
			transform: (_doc, { password, _id, ...ret }) => ({ id: _id, ...ret }),
		},
		timestamps: true,
	}
);

// schema methods
UserSchema.methods.comparePassword = async function (candidatePassword, next) {
	if (!this.password) return next(false, null);
	const [isMatchError, isMatch] = await to(bcrypt.compare(candidatePassword, this.password));
	next(isMatchError, isMatch);
};

UserSchema.methods.createHashToken = function () {
	return crypto.randomBytes(32).toString("hex");
};

UserSchema.methods.gravatar = function (user, size = 200) {
	return `https://gravatar.com/avatar/${crypto
		.createHash("md5")
		.update(user || this.email)
		.digest("hex")}?s=${size}&d=retro`;
};

// schema hooks
UserSchema.pre("save", async function (next) {
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
	PaginateModel<IUserDocument> & SoftDeleteModel<IUserDocument> & IUserModel
>("User", UserSchema);

export default UserModal;
