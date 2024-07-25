import MongoStore from "connect-mongo";
import session from "express-session";
import vars from "../utils/vars";

const middleware = session({
	secret: vars.session.secret,
	saveUninitialized: false,
	resave: false,
	store: new MongoStore({
		mongoUrl: vars.db.url,
		ttl: 60 * 60 * vars.session.timeoutInHours, // Time to remove session from database in hours.
		collectionName: vars.session.dbCollectionName,
		stringify: false,
	}),
});

export default middleware;
