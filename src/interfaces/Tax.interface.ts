export default interface Tax {
	name: string;
	rate: number;
	description?: string;
	isPercentage: boolean;
	applicableCategories: string[];
	applicableToAllProducts: boolean;
}
