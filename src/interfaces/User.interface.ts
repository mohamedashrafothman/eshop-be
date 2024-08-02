export default interface User {
	email: string;
	name: string;
	slug?: string;
	password: string;
	picture: string;
	role: string;
	active: boolean;
	emailVerified: boolean;
	google?: string;
	facebook?: string;
}
