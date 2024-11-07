import * as dotenv from "dotenv";
import * as dotenvExpand from "dotenv-expand";
import path from "path";

const env = dotenv.config({ path: path.join(__dirname, "../../../.env") });
dotenvExpand.expand(env);

// constants
const ORDER_STATUS_PENDING = "pending";
const ORDER_STATUS_PROCESSING = "processing";
const ORDER_STATUS_SHIPPED = "shipped";
const ORDER_STATUS_COMPLETED = "completed";
const ORDER_STATUS_CANCELLED = "cancelled";
const ORDER_STATUS_REFUNDED = "refunded";

type VarsTypes = {
	isProduction: boolean;
	app: {
		name: string;
		port: string;
		host: string;
		protocol: string;
		url: string;
		frontEndUrl: string;
	};
	tokenTypes: {
		jwt: "JWT";
		facebook: "FACEBOOK";
		google: "GOOGLE";
		resetPassword: "RESET_PASSWORD";
		verifyEmail: "VERIFY_EMAIL";
	};
	api: { acceptableMediaType: string[] };
	db: {
		host: string;
		port: string;
		database: string;
		url: string;
	};
	cors: { allowedOrigins: string[] };
	session: {
		secret: string;
		timeoutInHours: number;
		dbCollectionName: string;
	};
	cookies: { maxAgeInHours: number };
	auth: {
		strategies: {
			locale: {
				usernameField: "email";
				passwordField: "password";
			};
			jwt: {
				accessTokenSecret: string;
				accessTokenExpiresInMinutes: number;
				refreshTokenSecret: string;
				refreshTokenExpiresInDays: number;
				tokenType: "Bearer";
			};
			social: {
				facebook: {
					scope: ["email", "public_profile"];
					redirect: {
						successRedirect: "/dashboard";
						failureRedirect: "/dashboard/auth/login";
					};
					clientId: string;
					secret: string;
					callbackUrl: "/dashboard/auth/facebook/redirect";
					profileFields: ["name", "email", "link", "locale", "timezone", "gender"];
				};
				google: {
					scope: "profile email";
					redirect: {
						successRedirect: "/dashboard";
						failureRedirect: "/dashboard/auth/login";
					};
					clientId: string;
					secret: string;
					callbackUrl: "/dashboard/auth/google/redirect";
					profileFields: ["r_basicprofile", "r_emailaddress"];
				};
			};
		};
		roles: {
			user: string;
			admin: string;
			superAdmin: string;
		};
	};
	password: {
		hashRounds: number;
		resetTimeLimitInHours: number;
	};
	email: {
		host: string;
		port: string;
		user: string;
		pass: string;
		sender: string;
		emailVerifyTokenExpiresInMinutes: number;
	};
	rateLimiter: {
		timeLimitInMinutes: number;
		maxRequests: number;
		loginFailedAttemptsTimeInMinutes: number;
		loginFailedAttemptsMaxNumber: number;
	};
	storage: {
		uploadPath: string;
		allowedFileSizeInMB: number;
	};
	products: {
		sizes: ["S", "M", "L", "XL", "XXL"];
		imagesMaxLength: number;
	};
	paymentMethods: { cashOnDelivery: { name: "cash_on_delivery" }; paymob: { name: "paymob" } };
	order: {
		status: {
			pending: typeof ORDER_STATUS_PENDING;
			processing: typeof ORDER_STATUS_PROCESSING;
			shipped: typeof ORDER_STATUS_SHIPPED;
			completed: typeof ORDER_STATUS_COMPLETED;
			cancelled: typeof ORDER_STATUS_CANCELLED;
			refunded: typeof ORDER_STATUS_REFUNDED;
		};
	};
};

const vars: VarsTypes = {
	isProduction: process.env?.NODE_ENV?.trim() === "production" || false,
	app: {
		name: process.env?.APP_NAME || "",
		port: process.env.APP_PORT || "",
		host: process.env?.APP_HOST || "",
		protocol: process.env?.APP_PROTOCOL || "",
		url: process.env?.APP_URL || "",
		frontEndUrl: process.env?.APP_FRONT_END_URL || "",
	},
	tokenTypes: {
		jwt: "JWT",
		facebook: "FACEBOOK",
		google: "GOOGLE",
		resetPassword: "RESET_PASSWORD",
		verifyEmail: "VERIFY_EMAIL",
	},
	api: { acceptableMediaType: ["application/json", "multipart/form-data"] },
	db: {
		host: process.env?.DB_HOST || "",
		port: process.env?.DB_PORT || "",
		database: process.env?.DB_DATABASE || "",
		url: process.env?.DB_URL || "",
	},
	cors: {
		allowedOrigins: [
			...((process.env?.CORS_ALLOWED_ORIGINS || "").split(",").filter(Boolean) || []),
		],
	},
	session: {
		secret: process.env?.SESSION_SECRET || "",
		timeoutInHours: Number(process.env?.SESSION_TIMEOUT_IN_HOURS || 0) || 0,
		dbCollectionName: process.env?.SESSION_DB_COLLECTION_NAME || "",
	},
	cookies: {
		maxAgeInHours: Number(process.env?.COOKIES_MAX_AGE_IN_HOURS || 0) || 0,
	},
	auth: {
		strategies: {
			locale: {
				usernameField: "email",
				passwordField: "password",
			},
			jwt: {
				accessTokenSecret: process.env?.JWT_ACCESS_TOKEN_SECRET || "",
				accessTokenExpiresInMinutes:
					Number(process.env?.JWT_ACCESS_TOKEN_EXPIRES_IN_MINUTES || 0) || 0,
				refreshTokenSecret: process.env?.JWT_REFRESH_TOKEN_SECRET || "",
				refreshTokenExpiresInDays:
					Number(process.env?.JWT_REFRESH_TOKEN_EXPIRES_IN_DAYS || 0) || 0,
				tokenType: "Bearer",
			},
			social: {
				facebook: {
					scope: ["email", "public_profile"],
					redirect: {
						successRedirect: "/dashboard",
						failureRedirect: "/dashboard/auth/login",
					},
					clientId: process.env?.FACEBOOK_CLIENT_ID || "",
					secret: process.env?.FACEBOOK_CLIENT_SECRET || "",
					callbackUrl: "/dashboard/auth/facebook/redirect",
					profileFields: ["name", "email", "link", "locale", "timezone", "gender"],
				},
				google: {
					scope: "profile email",
					redirect: {
						successRedirect: "/dashboard",
						failureRedirect: "/dashboard/auth/login",
					},
					clientId: process.env?.GOOGLE_CLIENT_ID || "",
					secret: process.env?.GOOGLE_CLIENT_SECRET || "",
					callbackUrl: "/dashboard/auth/google/redirect",
					profileFields: ["r_basicprofile", "r_emailaddress"],
				},
			},
		},
		roles: {
			user: "USER",
			admin: "ADMIN",
			superAdmin: "SUPER_ADMIN",
		},
	},
	password: {
		hashRounds: Number(process.env?.PASSWORD_HASH_ROUNDS || 0) || 0,
		resetTimeLimitInHours: Number(process.env?.PASSWORD_RESET_TIME_LIMIT_IN_HOURS || 0) || 0,
	},
	email: {
		host: process.env?.EMAIL_HOST || "",
		port: process.env?.EMAIL_PORT || "",
		user: process.env?.EMAIL_USER || "",
		pass: process.env?.EMAIL_PASS || "",
		sender: process.env?.EMAIL_SENDER || "",
		emailVerifyTokenExpiresInMinutes:
			Number(process.env?.EMAIL_VERIFY_TOKEN_EXPIRES_IN_MINUTES || 0) || 0,
	},
	rateLimiter: {
		timeLimitInMinutes: Number(process.env?.RATE_LIMITER_TIME_LIMIT_IN_MINUTES || 0) || 0,
		maxRequests: Number(process.env?.RATE_LIMITER_MAX_REQUESTS || 0) || 0,
		loginFailedAttemptsTimeInMinutes:
			Number(process.env?.RATE_LIMITER_LOGIN_FAILED_ATTEMPTS_TIME_IN_MINUTES || 0) || 0,
		loginFailedAttemptsMaxNumber:
			Number(process.env?.RATE_LIMITER_LOGIN_FAILED_ATTEMPTS_MAX_NUMBER || 0) || 0,
	},
	storage: {
		uploadPath: process.env?.UPLOAD_STORAGE || "",
		allowedFileSizeInMB: Number(process.env?.ATTACHMENT_MAX_SIZE_IN_MB || 0) || 0,
	},
	products: {
		sizes: ["S", "M", "L", "XL", "XXL"],
		imagesMaxLength: 10,
	},
	paymentMethods: { cashOnDelivery: { name: "cash_on_delivery" }, paymob: { name: "paymob" } },
	order: {
		status: {
			pending: ORDER_STATUS_PENDING,
			processing: ORDER_STATUS_PROCESSING,
			shipped: ORDER_STATUS_SHIPPED,
			completed: ORDER_STATUS_COMPLETED,
			cancelled: ORDER_STATUS_CANCELLED,
			refunded: ORDER_STATUS_REFUNDED,
		},
	},
};

export default vars;
