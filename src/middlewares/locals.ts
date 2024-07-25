import { NextFunction, Request, Response } from "express";
import moment from "moment";
import qs from "qs";
import vars from "../utils/vars";

const middleware = (req: Request, res: Response, next: NextFunction) => {
	res.locals.vars = vars;
	res.locals.req = req || null;
	res.locals.qs = qs || {};
	res.locals.user = req.user || null;
	res.locals.lang = req.cookies.lang || req.setLocale("en");
	res.locals.csrfToken = (req?.csrfToken && req.csrfToken()) || null;
	res.locals.moment = moment;
	next();
};

export default middleware;
