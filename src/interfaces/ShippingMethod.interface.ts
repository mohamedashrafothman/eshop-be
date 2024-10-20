export default interface ShippingMethod {
	name: string;
	description?: string;
	rate: number;
	deliveryTime: { min: number; max: number };
	zone: string;
}
