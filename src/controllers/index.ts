import { Request, Response } from "express";
import i18n from "i18n";

const IndexController = {
	changeLocale: (req: Request, res: Response) => {
		i18n.setLocale(res, req.params.locale, true);
		res.cookie("locale", req.params.locale);
		res.redirect("back");
	},
};

export default IndexController;
