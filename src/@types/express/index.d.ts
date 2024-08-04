import { type RateLimitInfo } from "express-rate-limit";
import { type UAParserInstance } from "ua-parser-js";
import { type IUserDocument } from "../../models/User";
import { type VarsTypes } from "../../utils/vars";

export {};

declare global {
	namespace Express {
		// eslint-disable-next-line @typescript-eslint/no-empty-interface
		export interface User extends IUserDocument {}
		export interface Request {
			vars?: VarsTypes;
			lang?: string;
			prevPath?: string;
			prevPrevPath?: string;
			user: IUserDocument | undefined;
			userAgent: UAParserInstance;
			rateLimit: RateLimitInfo;
		}
	}
}
