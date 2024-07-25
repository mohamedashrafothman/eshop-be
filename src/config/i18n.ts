import i18n from "i18n";
import path from "path";

i18n.configure({
	locales: ["en", "ar"],
	defaultLocale: "en",
	cookie: "locale",
	queryParameter: "locale",
	retryInDefaultLocale: true, // will return translation from defaultLocale in case current locale doesn't provide it
	directory: path.join(path.dirname(__dirname), "/locales"),
	api: {
		__: "t", // now req.__ becomes req.t
		__n: "tn", // and req.__n can be called as req.tn
	},
	register: global,
	objectNotation: true,
});
