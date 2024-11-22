import { AggregatePaginateModel, Document, Model, PaginateModel, Schema, model } from "mongoose";
import { SoftDeleteInterface, SoftDeleteModel } from "mongoose-delete";
import ISession from "../interfaces/Session.interface";

// adding schema methods here
export interface ISessionDocument extends SoftDeleteInterface, ISession, Document<string> {
	createdAt: Date;
	updatedAt: Date;
}

// adding statics methods here
export type ISessionModel = Model<ISessionDocument>;

// schema definition
const SessionSchema: Schema<ISessionDocument, object, ISessionDocument> = new Schema(
	{},
	{ timestamps: true }
);

// modal definition
const SessionModal = model<
	ISessionDocument,
	PaginateModel<ISessionDocument> &
		AggregatePaginateModel<ISessionDocument> &
		SoftDeleteModel<ISessionDocument> &
		ISessionModel
>("Session", SessionSchema);

export default SessionModal;
