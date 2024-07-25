#!/usr/bin/env node

import "../config/i18n";
import "../config/mongoose";
import "../config/pagination";
import "../config/passport";

import chalk from "chalk";
import http from "http";
import app from "../app";

// create HTTP server.
const server = http.createServer(app);

// listen on provided port, on all network interfaces.
server
	.listen(app.get("port"))
	.on("error", (error) => {
		throw error;
	})
	.on("listening", () => {
		console.log(
			`App is running at ${chalk.blue(app.get("url"))} in ${app
				.get("env")
				.trim()} mode.\n Press ${chalk.blue("CTRL-C")} to stop!\n`
		);
	});
