export default interface Cart {
	user: string;
	items: string[];
	taxes: string[];
	shippingMethod: string;
	paymentMethod: string;
	coupon?: string;
	address: string;
	subtotal: number;
	total: number;
	locked: boolean;
}
