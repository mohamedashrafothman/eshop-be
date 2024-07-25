import IAddress from "./Address.interface";

export default interface User {
	email: string;
	name: string;
	slug?: string;
	password: string;
	picture: string;
	active: boolean;
	verified: boolean;
	google?: string;
	facebook?: string;
	addresses?: [IAddress];
}
