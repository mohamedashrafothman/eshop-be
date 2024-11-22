import {
	AggregatePaginateModel,
	Document,
	Model,
	model,
	PaginateModel,
	Schema,
	Types,
} from "mongoose";
import { SoftDeleteInterface, SoftDeleteModel } from "mongoose-delete";
import isHexColor from "validator/lib/isHexColor";
import isInt from "validator/lib/isInt";
import IProduct from "../interfaces/Product.interface";
import vars from "../utils/vars";
import { IAttachmentDocument } from "./Attachment";
import { IBrandDocument } from "./Brand";
import { ICategoryDocument } from "./Category";
import { IReviewDocument } from "./Review";
import { IUserDocument } from "./User";

// adding schema methods here
export interface IProductDocument
	extends SoftDeleteInterface,
		Omit<IProduct, "images" | "thumbnail" | "brand" | "category" | "user" | "reviews">,
		Document<string> {
	createdAt: Date;
	updatedAt: Date;
	slug: string;
	images?: (Types.ObjectId | IAttachmentDocument)[];
	thumbnail: Types.ObjectId | IAttachmentDocument;
	brand: Types.ObjectId | IBrandDocument;
	category: Types.ObjectId | ICategoryDocument;
	user: Types.ObjectId | IUserDocument;
	reviews: (Types.ObjectId | IReviewDocument)[];
}

// adding statics methods here
export type IProductModel = Model<IProductDocument>;

// schema definition
const ProductSchema: Schema<IProductDocument, object, IProductDocument> = new Schema(
	{
		name: {
			type: String,
			trim: true,
			index: true,
			maxlength: [100, "Name can't be greater than 100 characters!"],
			required: [true, "Name is required!"],
		},
		slug: { type: String, slug: "name", unique: true, index: true, slugPaddingSize: 6 },
		description: {
			type: String,
			trim: true,
			index: true,
			maxlength: [1000, "Description can't be greater than 1000 characters!"],
			required: [true, "Description is required!"],
		},
		quantity: {
			type: Number,
			min: [0, "Quantity can't be less than 0!"],
			default: 1,
			validator: [
				(value: IProduct["quantity"]) => isInt(String(value)),
				"Quantity must be an integer number!",
			],
		},
		price: {
			normal: {
				type: Number,
				index: 0,
				default: 0,
				min: [0, "Normal price can't be less than 0!"],
				required: [true, "Normal price is required!"],
			},
			sale: {
				type: Number,
				default: null,
				min: [0, "Sale price can't be less than 0!"],
				validate: [
					function (this: IProductDocument, value: IProduct["price"]["sale"]) {
						return value === null || value === undefined || value < this.price.normal;
					},
					"Sale price must be less than normal price!",
				],
			},
			discount: {
				type: Number,
				default: 0,
				min: [0, "Discount price can't be less than 0!"],
			},
			percentage: {
				type: Number,
				default: 0,
				min: [0, "Percentage price can't be less than 0!"],
				max: [100, "Price percentage can't be greater than 5!"],
			},
		},
		colors: [
			{
				_id: false,
				name: { type: String, index: true, required: [true, "Color name is required!"] },
				value: {
					type: String,
					index: true,
					required: [true, "Color value is required!"],
					validate: [isHexColor, "Invalid color value!"],
				},
			},
		],
		sizes: [
			{
				type: String,
				enum: vars.products.sizes,
				index: true,
				required: [true, "Size is required!"],
			},
		],
		images: [
			{
				type: Schema.Types.ObjectId,
				ref: "Attachment",
				default: [],
				autopopulate: { select: "path alt" },
				maxlength: [
					vars.products.imagesMaxLength,
					`Maximum ${vars.products.imagesMaxLength} images allowed!`,
				],
			},
		],
		thumbnail: {
			type: Schema.Types.ObjectId,
			ref: "Attachment",
			required: [true, "Thumbnail is required!"],
			autopopulate: { select: "path alt" },
		},
		brand: {
			type: Schema.Types.ObjectId,
			ref: "Brand",
			index: true,
			required: [true, "Brand is required!"],
			autopopulate: { maxDepth: 1, select: "name slug description" },
		},
		category: {
			type: Schema.Types.ObjectId,
			ref: "Category",
			index: true,
			required: [true, "Category is required!"],
			autopopulate: { maxDepth: 1, select: "name slug description" },
		},
		user: {
			type: Schema.Types.ObjectId,
			ref: "User",
			required: [true, "User is required!"],
		},
		reviews: [
			{
				type: Schema.Types.ObjectId,
				ref: "Review",
				default: [],
				autopopulate: { maxDepth: 1, select: "rating comment user" },
			},
		],
		averageRating: {
			type: Number,
			default: 0,
			min: [0, "Average rating can't be less than 0!"],
			max: [5, "Average rating can't be greater than 5!"],
			index: true,
		},
		reviewCount: { type: Number, default: 0, index: true },
	},
	{ toJSON: { versionKey: false, virtual: true }, timestamps: true }
);

ProductSchema.pre("save", async function (next) {
	// Check if prices or reviews isn't modified.
	if (
		!this.isModified("price.sale") &&
		!this.isModified("price.normal") &&
		!this.isModified("reviews")
	)
		return next();

	// Populate reviews to get average rating
	await this.populate({ path: "reviews" });

	// Extract normal price from document price object.
	const { sale = 0, normal = 0 } = this.price;

	// Check if the sale price is less than normal price.
	const isSaleLessThanNormal = sale && normal && sale < normal;

	// Calculate average rating and review count
	const reviews = this.reviews as IReviewDocument[];
	const reviewsLength = reviews.length || 0;
	const reviewsTotalRating = reviews.reduce((acc, review) => acc + review.rating, 0);

	// Replace price percentage with new calculated value.
	this.price.discount = (isSaleLessThanNormal && normal - sale) || 0;
	this.price.percentage =
		(isSaleLessThanNormal && Math.round((this.price.discount / normal) * 100)) || 0;

	// Replace reviews ratings and count with new calculated value.
	this.reviewCount = reviewsLength;
	this.averageRating = reviewsTotalRating / reviewsLength || 0;

	next();
});

// modal definition
const ProductModal = model<
	IProductDocument,
	PaginateModel<IProductDocument> &
		AggregatePaginateModel<IProductDocument> &
		SoftDeleteModel<IProductDocument> &
		IProductModel
>("Product", ProductSchema);

export default ProductModal;
