import cors from "cors";
import vars from "../utils/vars";

const middleware = cors({
	origin: (origin, callback) => {
		if (!origin) return callback(null, true); // allow curl/Postman
		if (vars.cors.allowedOrigins.includes(origin)) return callback(null, true);
		callback(new Error("CORS: Origin not allowed"));
	},
	methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
	allowedHeaders: ["Content-Type", "Authorization"],
	credentials: true, // if using cookies or auth headers
});

export default middleware;
