import { Types } from "mongoose";
import { IProductDocument } from "../models/Product";
import vars from "../utils/vars";

export default interface CartItem {
	product: Types.ObjectId | IProductDocument;
	color: string;
	size: (typeof vars.products.sizes)[number];
	quantity: number;
	price: number;
	total: number;
}
