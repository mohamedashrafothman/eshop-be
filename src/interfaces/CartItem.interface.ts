import vars from "../utils/vars";

export default interface CartItem {
	product: string;
	color: string;
	size: (typeof vars.products.sizes)[number];
	quantity: number;
	price: number;
	total: number;
}
