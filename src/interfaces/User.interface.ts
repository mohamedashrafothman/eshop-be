export default interface User {
	email: string;
	name: string;
	password: string;
	role: string;
	active: boolean;
	emailVerified: boolean;
	google?: string;
	facebook?: string;
	addresses: string[] | [];
}
