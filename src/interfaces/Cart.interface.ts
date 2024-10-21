export default interface Cart {
	user: string;
	items: string[];
	taxes: string[];
	shippingMethod: string;
	address: string;
	subtotal: number;
	total: number;
}
