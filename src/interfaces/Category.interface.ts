export default interface Category {
	name: string;
	description: string;
	icon: string;
	parent: string[];
	children: string[];
	products: string[];
	productsCount: number;
}
