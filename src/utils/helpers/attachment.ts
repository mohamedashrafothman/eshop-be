import fs from "fs";
import path from "path";
import IAttachment from "../../interfaces/Attachment.interface";
import { type StorageOptions } from "../../services/storage";
import vars from "../vars";

/**
 * Handles a file to upload by returning the file's information.
 *
 * @param {Express.Multer.File} file - The file to handle.
 * @param {String} base - The base URL of the file.
 * @param {StorageOptions["sizes"][0]} [size] - The size of the file.
 * @returns {Pick<IAttachment, "path" | "dir" | "name" | "extname" | "base">} The file's information.
 */
export const handleFileToUpload = (
	file: Express.Multer.File,
	base: string,
	size?: StorageOptions["sizes"][0]
): Pick<IAttachment, "path" | "dir" | "name" | "extname" | "base"> => {
	// Get the file name.
	const fileName = file.filename || "";
	// Split the file name into parts.
	const nameParser = fileName.split(".");
	// Get the file base.
	const fileBase = nameParser.slice(0, nameParser.length - 1).join(".");
	// Get the file extension.
	const fileExtension = nameParser.slice(nameParser.length - 1)?.join("");
	// Split the upload path into parts.
	const uploadPath = (file?.destination || "")?.split(path.sep);
	// Create a function to generate the URL path.
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
	// Create the directory path.
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

/**
 * Deletes a file from the file system.
 *
 * @param {string} [file] - The file path to delete.
 * @returns {Promise<void>}
 */
export const deleteFileFromDisk = (file?: string): Promise<void> => {
	return new Promise((resolve, reject) => {
		if (!file) return resolve();

		const filePath = path.join(__dirname, "../../../", new URL(file).pathname);

		fs.access(filePath, fs.constants.F_OK, (accessErr) => {
			if (accessErr) return resolve(); // File doesn't exist, resolve silently

			fs.unlink(filePath, (unlinkErr) => {
				if (unlinkErr) return reject(unlinkErr);
				resolve();
			});
		});
	});
};
