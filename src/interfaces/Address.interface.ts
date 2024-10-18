import { Types } from "mongoose";
import { ICityDocument } from "../models/City";
import { ICountryDocument } from "../models/Country";
import { IStateDocument } from "../models/State";
import { IUserDocument } from "../models/User";

export default interface Address {
	name: string;
	street: string;
	building: number;
	floor?: number;
	apartment?: string;
	area: string;
	country: Types.ObjectId | ICountryDocument;
	state: Types.ObjectId | IStateDocument;
	city?: Types.ObjectId | ICityDocument;
	zip?: string | null;
	default: boolean;
	user: Types.ObjectId | IUserDocument;
}
