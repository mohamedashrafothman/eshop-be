import { NextFunction, Request, Response } from "express";
import UAParser from "ua-parser-js";

const middleware = (req: Request, res: Response, next: NextFunction) => {
	const userAgent = req.headers["user-agent"];
	if (userAgent) req.userAgent = new UAParser(userAgent as string);
	next();
};

export default middleware;
