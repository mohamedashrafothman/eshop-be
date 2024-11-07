import vars from "../utils/vars";

export default interface OrderItem {
	product: string;
	name: string;
	category: string;
	color?: { name: string; value: string };
	size?: (typeof vars.products.sizes)[number];
	quantity: number;
	price: number;
	total: number;
}
