import crypto from "crypto";
import rateLimit from "express-rate-limit";
import createError from "http-errors";
import httpStatus from "http-status";
import MongoStore from "rate-limit-mongo";
import { countDownTimer, formatResponseObject } from "../utils/helpers";
import vars from "../utils/vars";

const middleware = rateLimit({
	store: new MongoStore({
		uri: vars.db.url,
		expireTimeMs: 1000 * 60 * vars.rateLimiter.timeLimitInMinutes, // should match windowMs option
		collectionName: "rateLimit",
		connectionOptions: { keepAlive: 1, useNewUrlParser: true, useUnifiedTopology: true },
		errorHandler: console.error.bind(null, "rate-limit-mongo"),
	}),
	windowMs: 1000 * 60 * vars.rateLimiter.timeLimitInMinutes, // (n) minutes
	max: Number(vars.rateLimiter.maxRequests), // Limit each IP to (n) requests per `window` (here, per (n) minutes)
	skipSuccessfulRequests: true,
	standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

export const loginRateLimiter = rateLimit({
	store: new MongoStore({
		uri: vars.db.url,
		expireTimeMs: 1000 * 60 * vars.rateLimiter.loginFailedAttemptsTimeInMinutes, // should match windowMs option
		collectionName: "loginRateLimit",
		connectionOptions: { keepAlive: 1, useNewUrlParser: true, useUnifiedTopology: true },
		errorHandler: console.error.bind(null, "rate-limit-mongo"),
	}),
	windowMs: 1000 * 60 * vars.rateLimiter.loginFailedAttemptsTimeInMinutes, // (n) minutes
	max: Number(vars.rateLimiter.loginFailedAttemptsMaxNumber), // Limit each IP to (n) requests per `window` (here, per (n) minutes)
	skipSuccessfulRequests: true,
	standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers
	keyGenerator: (req) => {
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
	},
	handler: (req, res, next) => {
		const resetTime = req.rateLimit?.resetTime;

		// Check if the reset time is valid
		if (!resetTime) {
			const error = createError(httpStatus.INTERNAL_SERVER_ERROR);
			return next({ ...(error || {}), status: error.status });
		}

		// Check if the user has exceeded the maximum attempts
		const remainingTime = countDownTimer(resetTime);
		req.flash(
			"danger",
			`Too Many Login Attempts. Please try again in ${remainingTime.minutes}:${remainingTime.seconds} ${remainingTime?.minutes ? "minutes" : "seconds"}.`
		);
		return res.status(httpStatus.TOO_MANY_REQUESTS).json(
			formatResponseObject({
				status: httpStatus.TOO_MANY_REQUESTS,
				flashes: req.flash(),
			})
		);
	},
});

export default middleware;
