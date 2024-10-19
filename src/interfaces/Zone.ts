import { Types } from "mongoose";
import { ICityDocument } from "../models/City";
import { ICountryDocument } from "../models/Country";
import { IStateDocument } from "../models/State";

export default interface Zone {
	name: string;
	description?: string;
	countries: (Types.ObjectId | ICountryDocument)[];
	states: (Types.ObjectId | IStateDocument)[];
	cities: (Types.ObjectId | ICityDocument)[];
	rate: number;
}
