export * from "./server";

export const countDownTimer = (
	date: Date | string
): { days: number; hours: number; minutes: number; seconds: number } => {
	const _distance: number = new Date(date).getTime() - new Date().getTime();
	const _second: number = 1000;
	const _minute: number = _second * 60;
	const _hour: number = _minute * 60;
	const _day: number = _hour * 24;

	if (_distance < 0) {
		return { days: 0, hours: 0, minutes: 0, seconds: 0 };
	}

	return {
		days: Math.floor(_distance / _day),
		hours: Math.floor((_distance % _day) / _hour),
		minutes: Math.floor((_distance % _hour) / _minute),
		seconds: Math.floor((_distance % _minute) / _second),
	};
};
