import to from "await-to-js";
import concat from "concat-stream";
import crypto from "crypto";
import { Request } from "express";
import fs from "fs";
import Jimp from "jimp";
import _ from "lodash";
import { sync } from "mkdirp";
import path from "path";
import slug from "slug";
import streamifier from "streamifier";
import vars from "../utils/vars";

export interface StorageOptions {
	storage: "local";
	accept: ("image" | "application")[];
	sizes: ("lg" | "md" | "sm")[];
	uploadPath: string;
	uploadBasePath: string;
	quality: number;
	square: boolean;
	threshold: number;
	grayscale: boolean;
	responsive: boolean;
	fileHashName: boolean;
}

type Callback = (err: Error | null, result?: any) => void;

class StorageEngine {
	options: StorageOptions;
	ALLOWED_IMAGES_FORMATS: string[] = ["jpg", "jpeg", "png", "bmp", "tiff", "gif"];
	ALLOWED_APPLICATIONS_FORMATS: string[] = ["pdf", "xlsx", "xls", "docs", "doc", "docx"];
	ALLOWED_STORAGE_SYSTEMS: StorageOptions["storage"][] = ["local"];
	ALLOWED_OUTPUT_FORMATS: StorageOptions["accept"] = ["image", "application"];
	ALLOWED_IMAGE_SIZES: StorageOptions["sizes"] = ["lg", "md", "sm"];
	DEFAULT_OPTIONS: StorageOptions = {
		storage: "local",
		accept: this.ALLOWED_OUTPUT_FORMATS,
		sizes: this.ALLOWED_IMAGE_SIZES,
		uploadPath: path.resolve(__dirname, "../..", vars.storage.uploadPath),
		uploadBasePath: `/${vars.storage.uploadPath.split(path.sep)[vars.storage.uploadPath.split(path.sep).length - 1]}`,
		quality: 70,
		square: true,
		threshold: 500,
		grayscale: false,
		responsive: false,
		fileHashName: true,
	};
	constructor(opts: Partial<StorageOptions> = {}) {
		// check the options for correct values and use fallback value where necessary
		this.options = _.forIn(
			{
				...this.DEFAULT_OPTIONS,
				...(_.pick(opts, Object.keys(this.DEFAULT_OPTIONS)) || {}),
			},
			(value, key, object) => {
				switch (key) {
					case "square":
					case "grayscale":
					case "responsive":
					case "fileHashName":
						object[key] = _.isBoolean(value) ? value : this.DEFAULT_OPTIONS[key];
						break;
					case "storage":
						object[key] = (
							this.ALLOWED_STORAGE_SYSTEMS.includes(
								value as StorageOptions["storage"]
							)
								? value
								: this.DEFAULT_OPTIONS[key]
						) as StorageOptions["storage"];
						break;
					case "quality":
						value = _.isFinite(value) ? value : Number(value);
						object[key] = (
							value &&
							(value as StorageOptions["quality"]) >= 0 &&
							(value as StorageOptions["quality"]) <= 100
								? value
								: this.DEFAULT_OPTIONS[key]
						) as StorageOptions["quality"];
						break;
					case "threshold":
						value = _.isFinite(value) ? value : Number(value);
						object[key] = (
							value && (value as StorageOptions["quality"]) >= 0
								? value
								: this.DEFAULT_OPTIONS[key]
						) as StorageOptions["threshold"];
						break;
					case "sizes":
						value = (value as StorageOptions["sizes"]).map((val: string) =>
							String(val).toLowerCase()
						) as StorageOptions["sizes"];
						object[key] = (
							value?.some((item) => this.ALLOWED_IMAGE_SIZES.includes(item))
								? value
								: this.DEFAULT_OPTIONS[key]
						) as StorageOptions["sizes"];
						break;
					case "accept":
						value = (value as StorageOptions["accept"]).map((val: string) =>
							String(val).toLowerCase()
						) as StorageOptions["accept"];
						object[key] = (
							value?.some((item) => this.ALLOWED_OUTPUT_FORMATS.includes(item))
								? value
								: this.DEFAULT_OPTIONS[key]
						) as StorageOptions["accept"];
						break;
					default:
						break;
				}
				return object;
			}
		);

		// set the upload path
		if (
			this.options.storage === "local" &&
			this.options?.uploadPath &&
			!fs.existsSync(this.options.uploadPath)
		)
			sync(this.options.uploadPath);

		this._generateRandomFileName = this._generateRandomFileName.bind(this);
		this._createOutputStream = this._createOutputStream.bind(this);
		this._createReadStream = this._createReadStream.bind(this);
		this._processImageFiles = this._processImageFiles.bind(this);
		this._processApplicationFiles = this._processApplicationFiles.bind(this);
		this._createImageBatch = this._createImageBatch.bind(this);
		this._handleFile = this._handleFile.bind(this);
		this._removeFile = this._removeFile.bind(this);
	}

	_generateRandomFileName(mime: string): string {
		// create pseudo random bytes
		const bytes = crypto.pseudoRandomBytes(32);
		// create the md5 hash of the random bytes
		const checksum = crypto.createHash("MD5").update(bytes).digest("hex");
		// return as filename the hash with the output extension
		return `${checksum}.${mime}`;
	}

	_createOutputStream(filepath: string, cb: Callback): NodeJS.WritableStream {
		// create a reference for this to use in local functions
		const that = this;
		// create a writable stream from the filepath
		const output = fs.createWriteStream(filepath);
		// set callback fn as handler for the error event
		output.on("error", cb);
		// set handler for the finish event
		output.on("finish", () => {
			cb(null, {
				destination: that.options.uploadPath,
				baseUrl: that.options.uploadBasePath,
				filename: path.basename(filepath),
				storage: that.options.storage,
			});
		});
		// return the output stream
		return output;
	}

	_createReadStream(filepath: string, cb: Callback): NodeJS.ReadableStream {
		// create a reference for this to use in local functions
		const that = this;
		// create a readable stream from the filepath
		const output = fs.createReadStream(filepath);
		// set callback fn as handler for the error event
		output.on("error", cb);
		// set handler for the finish event
		output.on("finish", () => {
			cb(null, {
				destination: that.options.uploadPath,
				baseUrl: that.options.uploadBasePath,
				filename: path.basename(filepath),
				storage: that.options.storage,
			});
		});
		// return the output stream
		return output;
	}

	_createImageBatch(
		sizes: string[],
		clone: Jimp,
		filename: string,
		cb: Callback
	): { stream: NodeJS.WritableStream; image: Jimp }[] {
		return sizes.map((size) => {
			// get the size multiplier
			const sizeMultiplier = size === "lg" ? 1 : size === "md" ? 0.7 : 0.3;
			// get the filename without extension
			const filenameWithNoExtension = filename.split(".")[0];
			// get the filename extension
			const filenameExtension = filename.split(".")[1];
			// create the filepath
			const filePath = path.join(
				this.options.uploadPath,
				`${filenameWithNoExtension}_${size}.${filenameExtension}`
			);
			// create a writable stream from the filepath
			const outputStream = this._createOutputStream(filePath, cb);
			// clone the image
			const imageClone = clone.clone().scale(sizeMultiplier);
			// return the output stream
			return { stream: outputStream, image: imageClone };
		});
	}

	async _processImageFiles(image: Jimp, originalFile: Express.Multer.File, cb: Callback) {
		// create a reference for this to use in local functions
		const that = this;

		// the responsive sizes
		const nameArray = originalFile.originalname.split(".");
		const mimeType = nameArray[nameArray.length - 1];

		// check if image is an accepted format
		if (!that.ALLOWED_IMAGES_FORMATS.includes(mimeType))
			return cb(new Error("Unaccepted images file format"));

		const originalFilename = `${slug(originalFile.originalname.split(".")[0])}.${mimeType}`;
		const filename = this.options.fileHashName
			? this._generateRandomFileName(mimeType)
			: originalFilename;
		// resolve the Jimp output mime type
		const mime = (Jimp as any)[`MIME_${mimeType.toUpperCase()}`] || Jimp.MIME_PNG;
		// create a clone of the Jimp image
		let clone = image.clone();
		// fetch the Jimp image dimensions
		const { width, height } = clone.bitmap;
		let square = Math.min(width, height);
		// auto scale the image dimensions to fit the threshold requirement
		if (this.options.threshold && square > this.options.threshold) {
			clone =
				square === width
					? clone.resize(this.options.threshold, Jimp.AUTO)
					: clone.resize(Jimp.AUTO, this.options.threshold);
		}
		// crop the image to a square if enabled
		if (this.options.square) {
			if (this.options.threshold) square = Math.min(square, this.options.threshold);
			// fetch the new image dimensions and crop
			clone = clone.crop(
				(clone.bitmap.width - square) / 2,
				(clone.bitmap.height - square) / 2,
				square,
				square
			);
		}
		// convert the image to grayscale if enabled
		if (this.options.grayscale) clone = clone.grayscale();
		// set the image output quality
		clone = clone.quality(this.options.quality);

		let batch = [];
		// create the image batch
		if (this.options.responsive) {
			batch = this._createImageBatch(this.options.sizes, clone, filename, cb);
		} else {
			batch.push({
				stream: this._createOutputStream(path.join(this.options.uploadPath, filename), cb),
				image: clone,
			});
		}

		// create a read stream from the buffer and pipe it to the output stream
		const [err] = await to(
			Promise.all(
				batch.map(
					(singleBatch) =>
						new Promise((resolve, reject) => {
							singleBatch.image.getBuffer(mime, (err, buffer) => {
								// if an error occurs, return it
								if (err) return reject(err);
								// Create a read stream from the buffer and pipe it to the output stream
								const stream = streamifier
									.createReadStream(buffer)
									.pipe(singleBatch.stream);
								stream.on("finish", (res) => resolve(res));
								stream.on("error", (err) => {
									cb(err);
									reject(err);
								});
							});
						})
				)
			)
		);
		// An error occurred in one of the image processing steps
		if (err) return cb(err);
	}

	_processApplicationFiles(file: Buffer, originalFile: Express.Multer.File, cb: Callback) {
		// create a reference for this to use in local functions
		const that = this;
		// create a reference for this to use in local functions
		const batch = [];
		const nameArray = originalFile.originalname.split(".");
		const mimeType = nameArray[nameArray.length - 1];

		if (!that.ALLOWED_APPLICATIONS_FORMATS.includes(mimeType))
			return cb(new Error("Unaccepted application file format"));

		const originalFilename = `${slug(originalFile.originalname.split(".")[0])}.${mimeType}`;
		const filename = this.options.fileHashName
			? this._generateRandomFileName(mimeType)
			: originalFilename;

		batch.push({
			stream: that._createOutputStream(path.join(that.options.uploadPath, filename), cb),
			file,
		});

		// process the batch sequence
		batch.forEach((singleBatch) => {
			// if storage is not local, return false
			if (this.options.storage !== "local") return false;
			// Create a read stream from the buffer and pipe it to the output stream
			streamifier.createReadStream(singleBatch.file).pipe(singleBatch.stream);
		});
	}

	_handleFile(_req: Request, file: Express.Multer.File, cb: Callback) {
		// create a reference for this to use in local functions
		const that = this;

		// check if any file were uploaded
		if (!file) return cb(new Error("No files uploaded!"));

		// check if the file is an image or application
		if (!file.mimetype.startsWith("image") && !file.mimetype.startsWith("application"))
			return cb(new Error(`Unaccepted file type: ${file.mimetype} in ${file.originalname}`));

		// create a writable stream using concat-stream that will
		// concatenate all the buffers written to it and pass the
		// complete buffer to a callback fn
		const fileManipulate = concat(async (fileData) => {
			// application files
			if (file.mimetype.startsWith("application"))
				that._processApplicationFiles(fileData, file, cb);

			// image files
			if (file.mimetype.startsWith("image")) {
				// read the fileBuffer buffer with Jimp
				// it returns a promise
				const [error, fileBuffer] = await to(Jimp.read(fileData));
				if (error) return cb(error);
				that._processImageFiles(fileBuffer, file, cb);
			}
		});

		// write the uploaded file buffer to the fileManipulate stream
		file.stream.pipe(fileManipulate);
	}

	_removeFile(_req: Request, file: any, cb: Callback) {
		const { originalname: filename } = file;
		const filePath = path.join(this.options.uploadPath, filename);
		let paths: string[] = [];

		// delete the file properties
		delete file.originalname;
		delete file.destination;
		delete file.baseUrl;
		delete file.storage;

		// create paths for responsive images
		if (this.options.responsive) {
			let pathSplit = path.parse(filePath);
			let matches = pathSplit.base.match(/([a-zA-Z0-9\s_\\.\-\(\):])+(.+)$/i);
			if (matches) {
				paths = ["lg", "md", "sm"].map(
					(size) =>
						`${path.format(pathSplit)}${path.sep}${matches[1]}_${size}.${matches[2]}`
				);
			}
		} else {
			paths = [filePath];
		}

		// delete the files from the filesystem
		paths.forEach((unlinkPath) => fs.unlink(unlinkPath, cb));
	}
}

export default StorageEngine;
