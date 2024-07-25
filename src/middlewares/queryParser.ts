import { queryParser } from "express-query-parser";

const middleware = queryParser({ parseNull: true, parseUndefined: true, parseBoolean: true, parseNumber: true });
export default middleware;
