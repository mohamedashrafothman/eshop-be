export default interface Coupon {
	code: string;
	discount: number;
	expirationDate: Date;
	isPercentage: boolean;
	usageLimit: number;
	usageCount: number;
	usedBy: string[];
}
