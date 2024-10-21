import vars from "../utils/vars";

export default interface Product {
	name: string;
	description: string;
	price: { normal: number; sale?: number | null; discount: number; percentage: number };
	quantity: number;
	colors: { name: string; value: string }[];
	sizes: typeof vars.products.sizes;
	images?: string[];
	thumbnail: string;
	brand: string;
	category: string;
	user: string;
	reviews: string[];
	averageRating: number;
	reviewCount: number;
}
