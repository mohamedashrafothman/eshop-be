import chalk from "chalk";
import mongoose from "mongoose";
import mongooseAggregatePagination from "mongoose-aggregate-paginate-v2";
import mongooseAutopopulate from "mongoose-autopopulate";
import MongooseDelete from "mongoose-delete";
import mongoosePagination from "mongoose-paginate-v2";
import slug from "mongoose-slug-updater";
import vars from "../utils/vars";

mongoose.Promise = global.Promise;
mongoose.connect(vars.db.url, {});
mongoose.plugin(MongooseDelete, {
	deletedAt: true,
	deletedBy: true,
	overrideMethods: ["findOne", "findOneAndUpdate", "update", "updateOne", "updateMany", "aggregate"],
});
mongoose.plugin(mongoosePagination);
mongoose.plugin(mongooseAggregatePagination);
mongoose.plugin(slug);
mongoose.plugin(mongooseAutopopulate);
mongoose.set("debug", !vars.isProduction);
mongoose.connection
	.once("open", () => console.log(chalk.blue("✅  Connected to the database")))
	.on("error", (error) => {
		console.error(error);
		console.log(`⛔️  ${chalk.red("MongoDB connection error")}.\n Please make sure MongoDB server is running.`);
		process.exit();
	});
