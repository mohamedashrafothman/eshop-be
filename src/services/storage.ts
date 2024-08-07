// import concat from "concat-stream";
import concat from "concat-stream";
import crypto from "crypto";
import fs from "fs";
import Jimp from "jimp";
import _ from "lodash";
import mkdirp from "mkdirp";
import path from "path";
import slug from "slug";
import streamifier from "streamifier";
import vars from "../utils/vars";

interface StorageOptions {
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

const ALLOWED_STORAGE_SYSTEMS: string[] = ["local"];
const ALLOWED_OUTPUT_FORMATS: string[] = ["image", "application"];
const ALLOWED_IMAGE_SIZES: string[] = ["lg", "md", "sm"];
const ALLOWED_IMAGES_FORMATS: string[] = ["jpg", "jpeg", "png", "bmp", "tiff", "gif"];
const ALLOWED_APPLICATIONS_FORMATS: string[] = ["pdf", "xlsx", "xls", "docs", "doc", "docx"];
const DEFAULT_OPTIONS: StorageOptions = {
	storage: "local",
	accept: ["image", "application"],
	sizes: ["lg", "md", "sm"],
	uploadPath: path.resolve(__dirname, "../", vars.storage.uploadPath),
	uploadBasePath: `/${vars.storage.uploadPath.split(path.sep)[vars.storage.uploadPath.split(path.sep).length - 1]}`,
	quality: 70,
	square: true,
	threshold: 500,
	grayscale: false,
	responsive: false,
	fileHashName: true,
};

const _generateRandomFileName = (mime: string): string => {
	// create pseudo random bytes
	const bytes = crypto.pseudoRandomBytes(32);
	// create the md5 hash of the random bytes
	const checksum = crypto.createHash("MD5").update(bytes).digest("hex");
	// return as filename the hash with the output extension
	return `${checksum}.${mime}`;
};

const _createOutputStream = (
	filepath: string,
	options: StorageOptions,
	cb: (err: Error | null, result: any) => void
) => {
	// create a writable stream from the filepath
	const output = fs.createWriteStream(filepath);
	// set callback fn as handler for the error event
	output.on("error", cb);
	// set handler for the finish event
	output.on("finish", () => {
		cb(null, {
			destination: options.uploadPath,
			baseUrl: options.uploadBasePath,
			filename: path.basename(filepath),
			storage: options.storage,
		});
	});
	// return the output stream
	return output;
};

const _createReadStream = (
	filepath: string,
	options: StorageOptions,
	cb: (err: Error | null, result: any) => void
) => {
	// create a readable stream from the filepath
	const output = fs.createReadStream(filepath);
	// set callback fn as handler for the error event
	output.on("error", cb);
	// set handler for the finish event
	output.on("finish", () => {
		cb(null, {
			destination: options.uploadPath,
			baseUrl: options.uploadBasePath,
			filename: path.basename(filepath),
			storage: options.storage,
		});
	});
	// return the output stream
	return output;
};

const _processImageFiles = (
	image: Jimp,
	originalFile: any,
	options: StorageOptions,
	cb: (err: Error | null, result?: any) => void
) => {
	const nameArray = originalFile.originalname.split(".");
	const mimeType = nameArray[nameArray.length - 1];

	if (!ALLOWED_IMAGES_FORMATS.includes(mimeType)) return cb(new Error("Unaccepted file format"));

	const originalFilename = `${slug(originalFile.originalname.split(".")[0])}.${mimeType}`;
	const filename = options.fileHashName ? _generateRandomFileName(mimeType) : originalFilename;

	// resolve the Jimp output mime type
	const mime: string = (Jimp as any)[`MIME_${mimeType.toUpperCase()}`] || Jimp.MIME_PNG;

	// create a clone of the Jimp image
	let clone = image.clone();

	// fetch the Jimp image dimensions
	const { width, height } = clone.bitmap;
	let squareSize = Math.min(width, height);

	// auto scale the image dimensions to fit the threshold requirement
	if (options.threshold && squareSize > options.threshold)
		clone =
			squareSize === width
				? clone.resize(options.threshold, Jimp.AUTO)
				: clone.resize(Jimp.AUTO, options.threshold);

	// crop the image to a square if enabled
	if (options.square) {
		if (options.threshold) squareSize = Math.min(squareSize, options.threshold);
		// fetch the new image dimensions and crop
		clone = clone.crop(
			(clone.bitmap.width - squareSize) / 2,
			(clone.bitmap.height - squareSize) / 2,
			squareSize,
			squareSize
		);
	}

	// convert the image to grayscale if enabled
	if (options.grayscale) clone = clone.grayscale();

	// set the image output quality
	clone = clone.quality(options.quality);

	const createImageBatch = (
		sizes: string[],
		clone: Jimp
	): { stream: NodeJS.WritableStream; image: Jimp }[] =>
		_.map(sizes, (size) => {
			const outputStream = _createOutputStream(
				path.join(
					options.uploadPath,
					`${filename.split(".")[0]}_${size}.${filename.split(".")[1]}`
				),
				options,
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

	// map through  the responsive sizes and push them to the batch
	const batch = [
		...((options.responsive
			? createImageBatch(options.sizes, clone)
			: [
					{
						stream: _createOutputStream(
							path.join(options.uploadPath, filename),
							options,
							cb
						),
						image: clone,
					},
				]) || []),
	];

	// create a read stream from the buffer and pipe it to the output stream
	_.each(batch, (current) =>
		current.image.getBuffer(mime, (_err, buffer) =>
			options.storage === "local"
				? streamifier.createReadStream(buffer).pipe(current.stream)
				: false
		)
	);
};

const _processApplicationFiles = (
	file: Buffer,
	originalFile: any,
	options: StorageOptions,
	cb: (err: Error | null, result?: any) => void
) => {
	const nameArray = originalFile.originalname.split(".");
	const mimeType = nameArray[nameArray.length - 1];

	if (!ALLOWED_APPLICATIONS_FORMATS.includes(mimeType))
		return cb(new Error("Unaccepted file format"));

	const originalFilename = `${slug(originalFile.originalname.split(".")[0])}.${mimeType}`;
	const filename = options.fileHashName ? _generateRandomFileName(mimeType) : originalFilename;

	const batch = [
		{ stream: _createOutputStream(path.join(options.uploadPath, filename), options, cb), file },
	];

	// create a read stream from the buffer and pipe it to the output stream
	_.each(batch, (current) =>
		options.storage === "local"
			? streamifier.createReadStream(current.file).pipe(current.stream)
			: false
	);
};

export const validateStorageOptions = (opts?: Partial<StorageOptions>): StorageOptions => {
	const options = { ...(_.pick(opts, _.keys(DEFAULT_OPTIONS)) || {}) };
	const validatedOptions = _.reduce<Partial<StorageOptions>, StorageOptions>(
		options,
		(collection: StorageOptions, value: any, key: string): StorageOptions => {
			switch (key) {
				case "square":
				case "grayscale":
				case "responsive":
				case "fileHashName":
					collection[key] = _.isBoolean(value) ? value : DEFAULT_OPTIONS[key];
					break;
				case "uploadPath":
					value = String(value).toLowerCase();
					collection[key] = _.isEqual(DEFAULT_OPTIONS[key], value)
						? value
						: DEFAULT_OPTIONS[key];
					break;
				case "uploadBasePath":
					value = String(value).toLowerCase();
					collection[key] = _.isEqual(DEFAULT_OPTIONS[key], value)
						? value
						: DEFAULT_OPTIONS[key];
					break;
				case "storage":
					value = String(value).toLowerCase();
					collection[key] = _.includes(ALLOWED_STORAGE_SYSTEMS, value)
						? value
						: DEFAULT_OPTIONS[key];
					break;
				case "quality":
					value = _.isFinite(value) ? value : Number(value);
					collection[key] =
						value && value >= 0 && value <= 100 ? value : DEFAULT_OPTIONS[key];
					break;
				case "threshold":
					value = _.isFinite(value) ? value : Number(value);
					collection[key] = value && value >= 0 ? value : DEFAULT_OPTIONS[key];
					break;
				case "sizes":
					value = value.map((val: string) => String(val).toLowerCase());
					collection[key] = _.includes(ALLOWED_IMAGE_SIZES, value)
						? value
						: DEFAULT_OPTIONS[key];
					break;
				case "accept":
					value = value.map((val: string) => String(val).toLowerCase());
					collection[key] = _.includes(ALLOWED_OUTPUT_FORMATS, value)
						? value
						: DEFAULT_OPTIONS[key];
					break;
				default:
					break;
			}
			return collection;
		},
		_.cloneDeep(DEFAULT_OPTIONS) as StorageOptions
	);

	if (_.includes(validatedOptions.accept, "image") && validatedOptions.responsive) {
		validatedOptions.uploadPath = path.join(validatedOptions.uploadPath, "responsive");
		validatedOptions.uploadBasePath = path.join(validatedOptions.uploadBasePath, "responsive");
	}

	if (validatedOptions.storage === "local" && !fs.existsSync(validatedOptions.uploadPath))
		mkdirp.sync(validatedOptions.uploadPath);

	return validatedOptions;
};

export const handleFile = (
	req: any,
	file: any,
	options: StorageOptions,
	cb: (err: Error | null, result?: any) => void
) => {
	// create a fileManipulate stream
	const fileManipulate = concat((fileData) => {
		if (!file.mimetype.startsWith("image") && !file.mimetype.startsWith("application"))
			return cb(new Error("Unaccepted file type."));

		// process the images files
		if (file.mimetype.startsWith("image"))
			return Jimp.read(fileData)
				.then((fileBuffer) => {
					// process the Jimp fileBuffer
					_processImageFiles(fileBuffer, file, options, cb);
				})
				.catch(cb);

		// process application files
		if (file.mimetype.startsWith("application"))
			return _processApplicationFiles(fileData, file, options, cb);
	});
	// write the uploaded file buffer to the fileManipulate stream
	file.stream.pipe(fileManipulate);
};

export const removeFile = (
	req: any,
	file: any,
	options: StorageOptions,
	cb: (err: Error | null, result?: any) => void
) => {
	const filename = file.originalname;
	const filePath = path.join(options.uploadPath, filename);
	let paths: string[] = [];

	// delete the file properties
	delete file.originalname;
	delete file.destination;
	delete file.baseUrl;
	delete file.storage;

	// create paths for responsive images
	if (options.responsive) {
		let pathsplit = path.parse(filePath);
		let matches = pathsplit.base.match(/([a-zA-Z0-9\s_\\.\-\(\):])+(.+)$/i);
		if (matches) {
			paths = _.map(
				["lg", "md", "sm"],
				(size) => `${path.format(pathsplit)}${path.sep}${matches[1]}_${size}.${matches[2]}`
			);
		}
	} else {
		paths = [filePath];
	}

	// delete the files from the filesystem
	_.each(paths, (unlinkPath) => fs.unlink(unlinkPath, cb));
};

export default { handleFile, removeFile, validateStorageOptions };
