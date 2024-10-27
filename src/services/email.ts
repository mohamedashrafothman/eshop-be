import to from "await-to-js";
import { convert } from "html-to-text";
import juice from "juice";
import nodemailer from "nodemailer";
import pug from "pug";
import IEmail from "../interfaces/Email.interface";
import { type IUserDocument } from "../models/User";
import vars from "../utils/vars";

type EmailParamsType = {
	to: IUserDocument;
	filename: string;
	actionUrl?: string;
	siteName?: string;
} & Omit<IEmail, "to" | "createdAt" | "updateAt">;

type EmailTransporterParamsType = {
	to: IUserDocument["email"];
	html: string;
	text: string;
} & Omit<EmailParamsType, "to">;

const _HTMLGenerator = ({ filename = "", ...options }: EmailParamsType) =>
	juice(
		pug.renderFile(`${process.cwd()}/views/emails/${filename}.pug`, {
			filename,
			...options,
		})
	);

const _transporter = (data: EmailTransporterParamsType) =>
	nodemailer
		.createTransport({
			host: String(vars.email.host),
			port: Number(vars.email.port),
			secure: false, // true for 465, false for other ports
			auth: {
				user: String(vars.email.user),
				pass: String(vars.email.pass),
			},
			tls: { rejectUnauthorized: false },
		})
		.sendMail(data);

/**
 * @function send
 * @description Sends an email using nodemailer
 * @param {EmailParamsType} data - email data
 * @returns {Promise<[Error, EmailTransporterParamsType]>} an array with the error as the first
 * element and the email transporter options as the second element
 */
const send = async (data: EmailParamsType) => {
	const html = _HTMLGenerator(data);
	const text = convert(html);
	const options = {
		...data,
		to: data?.to?.email,
		html,
		text,
	};

	return await to(_transporter(options));
};

export { send };

export default { send };
