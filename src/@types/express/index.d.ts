import { type RateLimitInfo } from "express-rate-limit";
import { type UAParserInstance } from "ua-parser-js";
import { type IUserDocument } from "../../models/User";
import { type VarsTypes } from "../../utils/vars";

declare global {
	namespace Express {
		interface User extends IUserDocument {}
		interface Request {
			vars?: VarsTypes;
			lang?: string;
			prevPath?: string;
			prevPrevPath?: string;
			userAgent: UAParserInstance;
			rateLimit: RateLimitInfo;
		}
	}
}

export {};
