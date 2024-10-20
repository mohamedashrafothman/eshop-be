export default interface Address {
	name: string;
	street: string;
	building: number;
	floor?: number;
	apartment?: string;
	area: string;
	country: string;
	state: string;
	city?: string;
	zip?: string | null;
	default: boolean;
	user: string;
}
