import chalk from "chalk";
import fs from "fs";
import mongoose from "mongoose";
import mongooseAggregatePagination from "mongoose-aggregate-paginate-v2";
import mongooseAutopopulate from "mongoose-autopopulate";
import MongooseDelete from "mongoose-delete";
import mongoosePagination from "mongoose-paginate-v2";
import slug from "mongoose-slug-updater";
import path from "path";
import vars from "../utils/vars";

// Connection
mongoose.Promise = global.Promise;
mongoose.connect(vars.db.url, {});

// Plugins
mongoose.plugin(mongoosePagination);
mongoose.plugin(mongooseAggregatePagination);
mongoose.plugin(slug);
mongoose.plugin(mongooseAutopopulate);
mongoose.plugin(MongooseDelete, {
	deletedAt: true,
	deletedBy: true,
	overrideMethods: ["findOne", "findOneAndUpdate", "update", "updateOne", "updateMany"],
});

// Events
mongoose.set("debug", !vars.isProduction);
mongoose.connection
	.once("open", () => console.log(chalk.blue("✅  Connected to the database")))
	.on("error", (error) => {
		console.error(error);
		console.log(
			`⛔️  ${chalk.red("MongoDB connection error")}.\n Please make sure MongoDB server is running.`
		);
		process.exit(1);
	});

// Auto-load Models
const modelsPath = path.join(__dirname, "../models");
fs.readdirSync(modelsPath)
	.filter((file) => file.endsWith(".ts") || file.endsWith(".js"))
	.forEach((file) => {
		require(path.join(modelsPath, file));
	});

export const models = mongoose.models;
export default mongoose;
