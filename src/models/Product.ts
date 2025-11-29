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
			description:
				"The name of the product, used for display and search, limited to 100 characters.",
		},
		slug: {
			type: String,
			slug: "name",
			unique: true,
			index: true,
			slugPaddingSize: 6,
			description:
				"A URL-friendly version of the product name, automatically generated for routing and SEO.",
		},
		description: {
			type: String,
			trim: true,
			index: true,
			maxlength: [1000, "Description can't be greater than 1000 characters!"],
			required: [true, "Description is required!"],
			description:
				"Detailed description of the product, used for display, indexing, and search, limited to 1000 characters.",
		},
		quantity: {
			type: Number,
			min: [0, "Quantity can't be less than 0!"],
			default: 1,
			validator: [
				(value: IProduct["quantity"]) => isInt(String(value)),
				"Quantity must be an integer number!",
			],
			description:
				"The total available stock quantity for the product, must be a non-negative integer.",
		},
		price: {
			normal: {
				type: Number,
				index: 0,
				default: 0,
				min: [0, "Normal price can't be less than 0!"],
				required: [true, "Normal price is required!"],
				description:
					"The regular price of the product, used as the base for sale calculations.",
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
				description:
					"The discounted sale price of the product, must be less than normal price or null if not on sale.",
			},
			discount: {
				type: Number,
				default: 0,
				min: [0, "Discount price can't be less than 0!"],
				description: "The monetary amount of discount applied to the product price.",
			},
			percentage: {
				type: Number,
				default: 0,
				min: [0, "Percentage price can't be less than 0!"],
				max: [100, "Price percentage can't be greater than 100!"],
				description:
					"The percentage discount applied to the normal price, constrained between 0 and 100.",
			},
		},
		colors: [
			{
				_id: false,
				name: {
					type: String,
					index: true,
					required: [true, "Color name is required!"],
					description: "The human-readable name of a color option for the product.",
				},
				value: {
					type: String,
					index: true,
					required: [true, "Color value is required!"],
					validate: [isHexColor, "Invalid color value!"],
					description: "The hexadecimal or CSS value representing the color option.",
				},
			},
		],
		sizes: [
			{
				type: String,
				enum: vars.products.sizes,
				index: true,
				required: [true, "Size is required!"],
				description:
					"Available size options for the product, constrained to predefined values.",
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
				description:
					"Array of product images referenced by attachments, autopopulated for display; limited to max images length.",
			},
		],
		thumbnail: {
			type: Schema.Types.ObjectId,
			ref: "Attachment",
			required: [true, "Thumbnail is required!"],
			autopopulate: { select: "path alt" },
			description:
				"The main thumbnail image for the product, required and autopopulated for display.",
		},
		brand: {
			type: Schema.Types.ObjectId,
			ref: "Brand",
			index: true,
			required: [true, "Brand is required!"],
			autopopulate: {
				select: "name slug description logo",
				populate: { path: "logo", select: "path alt" },
				maxDepth: 1,
			},
			description:
				"Reference to the brand of the product, autopopulated for display and relational purposes.",
		},
		category: {
			type: Schema.Types.ObjectId,
			ref: "Category",
			index: true,
			required: [true, "Category is required!"],
			autopopulate: { maxDepth: 1, select: "name slug description" },
			description:
				"Reference to the category the product belongs to, autopopulated for display and filtering.",
		},
		user: {
			type: Schema.Types.ObjectId,
			ref: "User",
			required: [true, "User is required!"],
			description: "Reference to the user who created or owns this product.",
		},
		reviews: [
			{
				type: Schema.Types.ObjectId,
				ref: "Review",
				default: [],
				autopopulate: { maxDepth: 1, select: "rating comment user" },
				description:
					"Array of references to product reviews, autopopulated with rating, comment, and user info.",
			},
		],
		averageRating: {
			type: Number,
			default: 0,
			min: [0, "Average rating can't be less than 0!"],
			max: [5, "Average rating can't be greater than 5!"],
			index: true,
			description:
				"The average rating of the product based on all reviews, constrained between 0 and 5.",
		},
		reviewCount: {
			type: Number,
			default: 0,
			index: true,
			description: "Total number of reviews submitted for this product.",
		},
		isFeatured: {
			type: Boolean,
			default: false,
			index: true,
			description: "Indicates whether the product is featured on the storefront.",
		},
	},
	{ toJSON: { versionKey: false, virtual: true }, timestamps: true, collection: "Products" }
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
