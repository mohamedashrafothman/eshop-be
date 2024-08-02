import fs from "fs";
import logger from "morgan";
import path from "path";
import vars from "../utils/vars";

const middleware = !vars.isProduction
	? logger("dev")
	: logger("combined", {
			stream: fs.createWriteStream(path.join(__dirname, "../../logs/", "access.log"), {
				flags: "a",
			}),
		});

export default middleware;
