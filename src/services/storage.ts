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
				...(_.pick(opts, _.keys(this.DEFAULT_OPTIONS)) || {}),
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
							_.includes(this.ALLOWED_STORAGE_SYSTEMS, value)
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
							value?.some((item) => _.includes(this.ALLOWED_IMAGE_SIZES, item))
								? value
								: this.DEFAULT_OPTIONS[key]
						) as StorageOptions["sizes"];
						break;
					case "accept":
						value = (value as StorageOptions["accept"]).map((val: string) =>
							String(val).toLowerCase()
						) as StorageOptions["accept"];
						object[key] = (
							value?.some((item) => _.includes(this.ALLOWED_OUTPUT_FORMATS, item))
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

	_createOutputStream(filepath: string, cb: (err: Error | null, result: any) => void) {
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

	_createReadStream(filepath: string, cb: (err: Error | null, result: any) => void) {
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
		cb: (err: Error | null, result?: any) => void
	): { stream: NodeJS.WritableStream; image: Jimp }[] {
		return _.map(sizes, (size) => {
			const outputStream = this._createOutputStream(
				path.join(
					this.options.uploadPath,
					`${filename.split(".")[0]}_${size}.${filename.split(".")[1]}`
				),
				cb
			);
			let imageClone: Jimp = clone.clone();

			switch (size) {
				case "sm":
					imageClone = imageClone.scale(0.3);
					break;
				case "md":
					imageClone = imageClone.scale(0.7);
					break;
				default:
					break;
			}

			return { stream: outputStream, image: imageClone };
		});
	}

	_processImageFiles(
		image: Jimp,
		originalFile: any,
		cb: (err: Error | null, result?: any) => void
	) {
		// create a reference for this to use in local functions
		const that = this;
		let batch = [];
		// the responsive sizes
		const { sizes, threshold } = this.options;
		const nameArray = originalFile.originalname.split(".");
		const mimeType = nameArray[nameArray.length - 1];

		if (!that.ALLOWED_IMAGES_FORMATS.includes(mimeType)) {
			return cb(new Error("Unaccepted images file format"));
		}

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
		if (threshold && square > threshold) {
			clone =
				square === width
					? clone.resize(threshold, Jimp.AUTO)
					: clone.resize(Jimp.AUTO, threshold);
		}
		// crop the image to a square if enabled
		if (this.options.square) {
			if (threshold) {
				square = Math.min(square, threshold);
			}
			// fetch the new image dimensions and crop
			clone = clone.crop(
				(clone.bitmap.width - square) / 2,
				(clone.bitmap.height - square) / 2,
				square,
				square
			);
		}
		// convert the image to grayscale if enabled
		if (this.options.grayscale) {
			clone = clone.grayscale();
		}
		// set the image output quality
		clone = clone.quality(this.options.quality);

		batch = [
			...((this.options.responsive
				? this._createImageBatch(this.options.sizes, clone, filename, cb)
				: [
						{
							stream: this._createOutputStream(
								path.join(this.options.uploadPath, filename),
								cb
							),
							image: clone,
						},
					]) || []),
		];

		// create a read stream from the buffer and pipe it to the output stream
		_.each(batch, (current) =>
			current.image.getBuffer(mime, (_err, buffer) =>
				this.options.storage === "local"
					? streamifier.createReadStream(buffer).pipe(current.stream)
					: false
			)
		);
	}

	_processApplicationFiles(
		file: Buffer,
		originalFile: any,
		cb: (err: Error | null, result?: any) => void
	) {
		// create a reference for this to use in local functions
		const that = this;
		// create a reference for this to use in local functions
		const batch = [];
		const nameArray = originalFile.originalname.split(".");
		const mimeType = nameArray[nameArray.length - 1];

		if (!that.ALLOWED_APPLICATIONS_FORMATS.includes(mimeType)) {
			return cb(new Error("Unaccepted application file format"));
		}

		const originalFilename = `${slug(originalFile.originalname.split(".")[0])}.${mimeType}`;
		const filename = this.options.fileHashName
			? this._generateRandomFileName(mimeType)
			: originalFilename;

		batch.push({
			stream: that._createOutputStream(path.join(that.options.uploadPath, filename), cb),
			file,
		});

		// process the batch sequence
		_.each(batch, (current) => {
			if (that.options.storage === "local") {
				// create a read stream from the buffer and pipe it to the output stream
				streamifier.createReadStream(current.file).pipe(current.stream);
			}
		});
	}

	_handleFile(_req: Request, file: any, cb: (err: Error | null, result?: any) => void) {
		// create a reference for this to use in local functions
		const that = this;
		// create a writable stream using concat-stream that will
		// concatenate all the buffers written to it and pass the
		// complete buffer to a callback fn
		const fileManipulate = concat((fileData) => {
			if (file.mimetype.startsWith("image")) {
				// read the fileBuffer buffer with Jimp
				// it returns a promise
				Jimp.read(fileData)
					.then((fileBuffer) => {
						// process the Jimp fileBuffer
						that._processImageFiles(fileBuffer, file, cb);
					})
					.catch(cb);
			} else if (file.mimetype.startsWith("application")) {
				that._processApplicationFiles(fileData, file, cb);
			} else {
				return cb(new Error("Unaccepted file type."));
			}
		});
		// write the uploaded file buffer to the fileManipulate stream
		file.stream.pipe(fileManipulate);
	}

	_removeFile(_req: Request, file: any, cb: (err: Error | null, result?: any) => void) {
		const filename = file.originalname;
		const filePath = path.join(this.options.uploadPath, filename);
		let paths: string[] = [];

		// delete the file properties
		delete file.originalname;
		delete file.destination;
		delete file.baseUrl;
		delete file.storage;

		// create paths for responsive images
		if (this.options.responsive) {
			let pathsplit = path.parse(filePath);
			let matches = pathsplit.base.match(/([a-zA-Z0-9\s_\\.\-\(\):])+(.+)$/i);
			if (matches) {
				paths = _.map(
					["lg", "md", "sm"],
					(size) =>
						`${path.format(pathsplit)}${path.sep}${matches[1]}_${size}.${matches[2]}`
				);
			}
		} else {
			paths = [filePath];
		}

		// delete the files from the filesystem
		_.each(paths, (unlinkPath) => fs.unlink(unlinkPath, cb));
	}
}

export default StorageEngine;
