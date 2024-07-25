import IBrand from "./Brand.interface";
import ICategory from "./Category.interface";

export default interface Product {
	name: string;
	slug?: string;
	description: string;
	price: number;
	sale?: {
		price?: number;
		percentage?: number;
	};
	meta?: {
		title?: string;
		description?: string;
		keywords?: [string];
	};
	quantity: number;
	category: [ICategory];
	brand: IBrand;
	pictures?: string[];
	mainPicture?: string;
}
