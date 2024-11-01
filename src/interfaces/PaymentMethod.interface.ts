import vars from "../utils/vars/index";

export const PAYMENT_METHODS: string[] = Object.entries(vars.paymentMethods).map(
	([_, { name }]) => name
);

export default interface PaymentMethod {
	method: (typeof PAYMENT_METHODS)[number];
	description?: string;
	icon: string;
}
