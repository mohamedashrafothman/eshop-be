import { Types } from "mongoose";
import { IZoneDocument } from "../models/Zone";

export default interface ShippingMethod {
	name: string;
	description?: string;
	rate: number;
	deliveryTime: { min: number; max: number };
	zone: Types.ObjectId | IZoneDocument;
}
