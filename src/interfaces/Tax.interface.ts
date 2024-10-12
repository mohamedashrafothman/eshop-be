import { Types } from "mongoose";
import { ICategoryDocument } from "../models/Category";

export default interface Tax {
	name: string;
	slug: string;
	rate: number;
	description?: string;
	isPercentage: boolean;
	applicableCategories: (Types.ObjectId | ICategoryDocument)[];
	applicableToAllProducts: boolean;
	createdAt: Date;
	updateAt: Date;
}
