import { Types } from "mongoose";
import { ICountryDocument } from "../models/Country";
import { IStateDocument } from "../models/State";

export default interface State {
	name: string;
	country: Types.ObjectId | ICountryDocument;
	state: Types.ObjectId | IStateDocument;
}
