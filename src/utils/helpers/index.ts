import crypto from "crypto";
import { Request } from "express";
export * from "./attachment";
export * from "./server";

export const isObject = (value: unknown): boolean =>
	typeof value === "object" && !Array.isArray(value) && value !== null;

/**
 * Calculates the time difference between a given date and the current time in days, hours, minutes and seconds.
 * @param date Date or string representing the date to calculate the time difference from
 * @returns Object containing days, hours, minutes and seconds
 */
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

/**
 * Creates a random hash token
 * @returns A random hash token
 */
export const createHashToken = (): string => crypto.randomBytes(32).toString("hex");

/**
 * Generates a unique key for each request to be used with the express-rate-limit
 * middleware. The key is a combination of the request's IP address, browser name
 * and operating system name, hashed with SHA256.
 * @param req Express request object
 * @returns A unique key for the given request
 */
export const rateLimitKeyGenerator = (req: Request): string => {
	// Generate a unique key for each request
	const ip =
		req.ip ||
		req.ips?.[0] ||
		req.socket.remoteAddress ||
		(req.headers["x-forwarded-for"] as string).split(",")?.[0] ||
		"unknown";
	const browser = req.userAgent.getBrowser()?.name || "unknown";
	const os = req.userAgent.getOS()?.name || "unknown";
	const key = `${ip}-${browser}-${os}`;

	// Hash the key to create a unique identifier
	return crypto.createHash("sha256").update(key).digest("hex");
};

/**
 * Generates a unique short id with a given length.
 * @param {number} [number=6] The length of the generated id
 * @returns {Promise<string>} A promise that resolves with a unique short id
 */
export const getShortUniqueId = async (number: number = 6) => {
	const nanoId = await import("nanoid");
	return nanoId.customAlphabet("0123456789", number)();
};
