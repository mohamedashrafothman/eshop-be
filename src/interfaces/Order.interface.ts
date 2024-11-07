import vars from "../utils/vars";

export default interface Order {
	shortId: string;
	status: (typeof vars.order.status)[keyof typeof vars.order.status];
	user: string;
	items: string[];
	taxes: {
		name: string;
		rate: number;
		description?: string;
		isPercentage: boolean;
		applicableCategories: string[];
		applicableToAllProducts: boolean;
	}[];
	shippingMethod: {
		name: string;
		rate: number;
		zone: string;
		deliveryTime: { min: number; max: number };
	};
	address: {
		name: string;
		street: string;
		building: number;
		floor?: number;
		apartment?: string;
		area: string;
		country: string;
		state: string;
		city?: string;
		zip?: string;
	};
	paymentMethod: { name: string; gateway?: Record<string, any> };
	subtotal: number;
	total: number;
	note: string;
}
