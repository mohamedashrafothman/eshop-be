import vars from "../utils/vars";

export interface OrderTax {
	name: string;
	rate: number;
	description?: string;
	isPercentage: boolean;
	applicableCategories: string[];
	applicableToAllProducts: boolean;
}

export interface OrderShippingMethod {
	name: string;
	rate: number;
	zone: string;
	deliveryTime: { min: number; max: number };
}

export interface OrderAddress {
	name: string;
	street: string;
	building: number;
	floor?: number;
	apartment?: string;
	area: string;
	country: { name: string; code: string };
	state: { name: string; code?: string };
	city?: { name: string };
	zip?: string;
}

export interface OrderPaymentMethod {
	name: string;
	description: string;
	gateway?: Record<string, any>;
}

export interface History {
	status: (typeof vars.order.status)[keyof typeof vars.order.status];
	date: Date;
	updatedBy: string;
}

export default interface Order {
	shortId: string;
	status: (typeof vars.order.status)[keyof typeof vars.order.status];
	user: string;
	items: string[];
	taxes: OrderTax[];
	shippingMethod: OrderShippingMethod;
	address: OrderAddress;
	paymentMethod: OrderPaymentMethod;
	history: History[];
	subtotal: number;
	total: number;
	note: string;
}
