import fs from "fs";
import path from "path";
import IAttachment from "../../interfaces/Attachment.interface";
import { type StorageOptions } from "../../services/storage";
import vars from "../vars";

/**
 * Handles a file to upload by returning the file's information.
 *
 * @param {Express.Multer.File} file - The file to handle.
 * @param {string} base - The base URL of the file.
 * @param {StorageOptions["sizes"][0]} [size] - The size of the file.
 * @returns {Pick<IAttachment, "path" | "dir" | "name" | "extname" | "base">} The file's information.
 */
export const handleFileToUpload = (
	file: Express.Multer.File,
	base: string,
	size?: StorageOptions["sizes"][0]
): Pick<IAttachment, "path" | "dir" | "name" | "extname" | "base"> => {
	// Get the file name.
	const fileName = file.filename;
	// Split the file name into parts.
	const nameParser = fileName.split(".");
	// Get the file base.
	const fileBase = nameParser.slice(0, nameParser.length - 1).join(".");
	// Get the file extension.
	const fileExtension = nameParser.slice(nameParser.length - 1)?.join("");
	// Split the upload path into parts.
	const uploadPath = file.destination.split(path.sep);
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
 */
export const deleteFileFromDisk = (file?: string): NodeJS.ErrnoException | void => {
	// Check if the file exists
	if (!file) return;

	// Create the file path by joining the upload path and the file path.
	// The file path is extracted from the URL and is resolved relative to the upload path.
	const filePath = path.join(__dirname, `../../../`, new URL(file)?.pathname);

	// Check if the file exists
	if (fs.existsSync(filePath)) {
		// Delete the file
		fs.unlink(filePath, (err) => {
			if (err) throw err;
		});
	}
};
