import { Types } from "mongoose";
import { ICountryDocument } from "../models/Country";

export default interface State {
	name: string;
	code?: string;
	country: Types.ObjectId | ICountryDocument;
}
