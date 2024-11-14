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
	order?: object;
	date?: string;
	status?: string;
} & Omit<IEmail, "to" | "createdAt" | "updateAt">;

type EmailTransporterParamsType = {
	to: IUserDocument["email"];
	html: string;
	text: string;
} & Omit<EmailParamsType, "to">;

/**
 * Generates an HTML string for an email by rendering a pug template.
 * @param {object} [params] - An object containing parameters to pass to the
 * template. The object should contain a "filename" property whose value is the
 * name of the pug template to render.
 * @property {string} [filename] - The name of the pug template to render.
 * @returns {string} - The rendered HTML string.
 */
const _HTMLGenerator = ({ filename = "", ...options }: EmailParamsType) =>
	juice(
		pug.renderFile(`${process.cwd()}/views/emails/${filename}.pug`, {
			filename,
			...options,
		})
	);

/**
 * @function _transporter
 * @description Send an email using nodemailer.
 * @param {EmailTransporterParamsType} data - Email data to be sent.
 * @returns {Promise<void>} - Promise that resolves when the email is sent.
 * @throws {Error} - If there is an error sending the email.
 */
const _transporter = (data: EmailTransporterParamsType) =>
	nodemailer
		.createTransport({
			host: String(vars.email.host),
			port: Number(vars.email.port),
			secure: false, // true for 465, false for other ports
			auth: { user: String(vars.email.user), pass: String(vars.email.pass) },
			tls: { rejectUnauthorized: false },
			debug: false,
		})
		.sendMail(data);

/**
 * Sends an email using the provided data.
 * @param {EmailParamsType} data - The email parameters including recipient, subject, and content.
 * @returns {Promise<[Error, null] | [null, { html: string; text: string; from: string; to: string; subject: string }]>}
 *   A promise that resolves to an array where the first element is an Error (if any occurred during sending)
 *   or null, and the second element is an object containing email details such as HTML content, text content,
 *   sender, recipient, and subject if the email was sent successfully.
 */
const send = async (
	data: EmailParamsType
): Promise<
	| [Error, null]
	| [null, { html: string; text: string; from: string; to: string; subject: string }]
> => {
	const html = _HTMLGenerator(data);
	const text = convert(html);
	const options = { ...data, to: data.to?.email, html, text };

	const [error] = await to(_transporter(options));
	if (error) return [error, null];
	return [null, { html, text, from: data.from, to: data.to?.email, subject: data.subject }];
};

export { send };

export default { send };
