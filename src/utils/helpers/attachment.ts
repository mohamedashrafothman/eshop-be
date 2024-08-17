import path from "path";
import IAttachment from "../../interfaces/Attachment.interface";
import { type StorageOptions } from "../../services/storage";
import vars from "../vars";

export const handleFileToUpload = (
	file: Express.Multer.File,
	base: string,
	size?: StorageOptions["sizes"][0]
): Pick<IAttachment, "path" | "dir" | "name" | "extname" | "base"> => {
	const fileName = file.filename;
	const nameParser = fileName.split(".");
	const fileBase = nameParser.slice(0, nameParser.length - 1).join(".");
	const fileExtension = nameParser.slice(nameParser.length - 1)?.join("");
	const uploadPath = file.destination.split(path.sep);
	const urlPath = (size?: StorageOptions["sizes"][0]) =>
		path
			.join(
				`${uploadPath.slice(1, uploadPath.length).join(path.sep)}`,
				size
					? `${fileName.split("_").slice(0, fileName.split("_").length - 1)}_${size}.${fileExtension}`
					: fileName
			)
			.replace(/[\\\/]+/g, path.sep)
			.replace(/^[\/]+/g, "");

	const dir = path
		.join(`${uploadPath.slice(1, uploadPath.length).join(path.sep)}`)
		.replace(/[\\\/]+/g, path.sep)
		.replace(/^[\/]+/g, "");

	return {
		path: `${!vars.isProduction ? `${base}/` : ""}${urlPath(size)}`,
		dir: `${!vars.isProduction ? `${base}/` : ""}${dir}`,
		name: fileName,
		extname: fileExtension,
		base: fileBase,
	};
};
