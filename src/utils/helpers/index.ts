export * from "./server";

export const isEmpty = (obj: any) =>
	[Object, Array].includes((obj || {}).constructor) && !Object.entries(obj || {}).length;

export const groupBy = <T extends Record<string, any>>(
	objArray: T[],
	prop: keyof T
): { [key: string]: T[] } => {
	return objArray.reduce(
		(acc, obj) => {
			const key = obj[prop] as string; // Explicitly type key as string
			if (!acc[key]) acc[key] = [];
			acc[key].push(obj);
			return acc;
		},
		{} as { [key: string]: T[] }
	);
};

export const isFunction = (value: any): boolean => typeof value === "function";

export const countDownTimer = (
	date: Date | string
): { days: number; hours: number; minutes: number; seconds: number } => {
	const distance: number = new Date(date).getTime() - new Date().getTime();
	const _second: number = 1000;
	const _minute: number = _second * 60;
	const _hour: number = _minute * 60;
	const _day: number = _hour * 24;

	if (distance < 0) {
		return { days: 0, hours: 0, minutes: 0, seconds: 0 };
	}

	return {
		days: Math.floor(distance / _day),
		hours: Math.floor((distance % _day) / _hour),
		minutes: Math.floor((distance % _hour) / _minute),
		seconds: Math.floor((distance % _minute) / _second),
	};
};
