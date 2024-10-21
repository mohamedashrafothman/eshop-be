export default interface Token {
	user: string;
	kind: string;
	token: string;
	expireAt: Date;
}
