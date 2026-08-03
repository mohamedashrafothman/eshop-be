export enum PermissionType {
	// User Management
	CREATE_USER = "create:user",
	READ_USER = "read:user",
	READ_USERS = "read:users",
	UPDATE_USER = "update:user",
	DELETE_USER = "delete:user",
	RESTORE_USER = "restore:user",

	// Brand Management
	CREATE_BRAND = "create:brand",
	READ_BRAND = "read:brand",
	READ_BRANDS = "read:brands",
	UPDATE_BRAND = "update:brand",
	DELETE_BRAND = "delete:brand",
	RESTORE_BRAND = "restore:brand",

	// Category Management
	CREATE_CATEGORY = "create:category",
	READ_CATEGORY = "read:category",
	READ_CATEGORIES = "read:categories",
	UPDATE_CATEGORY = "update:category",
	DELETE_CATEGORY = "delete:category",
	RESTORE_CATEGORY = "restore:category",

	// Product Management
	CREATE_PRODUCT = "create:product",
	READ_PRODUCT = "read:product",
	READ_PRODUCTS = "read:products",
	UPDATE_PRODUCT = "update:product",
	DELETE_PRODUCT = "delete:product",
	RESTORE_PRODUCT = "restore:product",

	// Order Management
	CREATE_ORDER = "create:order",
	READ_ORDER = "read:order",
	READ_ORDERS = "read:orders",
	UPDATE_ORDER = "update:order",
	DELETE_ORDER = "delete:order",
	RESTORE_ORDER = "restore:order",

	// Review Management
	CREATE_REVIEW = "create:review",
	READ_REVIEW = "read:review",
	READ_REVIEWS = "read:reviews",
	UPDATE_REVIEW = "update:review",
	DELETE_REVIEW = "delete:review",
	RESTORE_REVIEW = "restore:review",

	// Coupon Management
	CREATE_COUPON = "create:coupon",
	READ_COUPON = "read:coupon",
	READ_COUPONS = "read:coupons",
	UPDATE_COUPON = "update:coupon",
	DELETE_COUPON = "delete:coupon",
	RESTORE_COUPON = "restore:coupon",

	// Address Management
	CREATE_ADDRESS = "create:address",
	READ_ADDRESS = "read:address",
	READ_ADDRESSES = "read:addresses",
	UPDATE_ADDRESS = "update:address",
	DELETE_ADDRESS = "delete:address",
	RESTORE_ADDRESS = "restore:address",

	// Wishlist Management
	CREATE_WISHLIST = "create:wishlist",
	READ_WISHLIST = "read:wishlist",
	READ_WISHLISTS = "read:wishlists",
	UPDATE_WISHLIST = "update:wishlist",
	DELETE_WISHLIST = "delete:wishlist",

	// Cart Management
	READ_CART = "read:cart",

	// Permission Management
	READ_PERMISSIONS = "read:permissions",

	// Role Management
	READ_ROLE = "read:role",
	READ_ROLES = "read:roles",
	CREATE_ROLE = "create:role",
	UPDATE_ROLE = "update:role",
	DELETE_ROLE = "delete:role",
	RESTORE_ROLE = "restore:role",

	// Settings & System Management (Countries, Cities, States, Taxes, Zones, Shipping/Payment Methods, Policies)
	MANAGE_SETTINGS = "manage:settings",

	// Wildcard / God mode
	MANAGE_ALL = "manage:all",
}

export default PermissionType;
