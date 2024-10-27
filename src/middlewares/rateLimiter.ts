import rateLimit from "express-rate-limit";
import MongoStore from "rate-limit-mongo";
import * as authController from "../controllers/auth";
import { rateLimitKeyGenerator } from "../utils/helpers";
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
	keyGenerator: rateLimitKeyGenerator,
	handler: authController._loginRateLimitHandler,
});

export default middleware;
