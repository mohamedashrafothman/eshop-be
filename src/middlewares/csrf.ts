import csrf from "csurf";
import { NextFunction, Request, Response } from "express";
import { isAPIAcceptableMediaTypeHeader } from "../utils/helpers/server";

const middleware = (req: Request, res: Response, next: NextFunction) =>
	!isAPIAcceptableMediaTypeHeader(req) ? csrf({ cookie: true })(req, res, next) : next();

export default middleware;
