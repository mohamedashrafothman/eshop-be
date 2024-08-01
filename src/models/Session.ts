import { Document, Model, PaginateModel, Schema, model } from "mongoose";
import { SoftDeleteInterface, SoftDeleteModel } from "mongoose-delete";
import ISession from "../interfaces/Session.interface";

// adding schema methods here
export interface ISessionDocument extends SoftDeleteInterface, ISession, Document<string> {}

// adding statics methods here
export type ISessionModel = Model<ISessionDocument>;

// schema definition
const SessionSchema = new Schema<ISessionDocument, object, ISessionDocument>(
	{},
	{ timestamps: true }
);

// modal definition
const SessionModal = model<
	ISessionDocument,
	PaginateModel<ISessionDocument> & SoftDeleteModel<ISessionDocument> & ISessionModel
>("Session", SessionSchema);

export default SessionModal;
