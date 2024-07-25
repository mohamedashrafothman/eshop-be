import fs from "fs";
import logger from "morgan";
import path from "path";
import vars from "../utils/vars";

const middleware = !vars.isProduction
	? logger("dev")
	: logger("combined", {
			stream: fs.createWriteStream(path.join(__dirname, "../../logs/", "access.log"), { flags: "a" }),
			// eslint-disable-next-line no-mixed-spaces-and-tabs
	  });

export default middleware;
