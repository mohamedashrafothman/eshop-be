export default interface Category {
	name: string;
	slug?: string;
	description: string;
	icon?: string;
	parent?: [Category];
	children?: [Category];
}
