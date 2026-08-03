import Permission, { IPermissionDocument } from "../../models/Permission";
import Role from "../../models/Role";
import vars from "../vars";
import PermissionType from "./permissions";

export const seedRolesAndPermissions = async (): Promise<void> => {
	try {
		console.log("🌱  Seeding roles and permissions...");

		// 1. Seed all permissions defined in the PermissionType enum
		const seededPermissions: IPermissionDocument[] = [];
		for (const key of Object.keys(PermissionType) as Array<keyof typeof PermissionType>) {
			const permissionName = PermissionType[key];

			// Human-friendly description based on key
			const description = `Allows user to ${permissionName.replace(":", " ")}`;

			let perm = await Permission.findOne({ name: permissionName });
			if (!perm) {
				perm = await Permission.create({ name: permissionName, description });
				console.log(`🔑 Created Permission: ${permissionName}`);
			}
			seededPermissions.push(perm);
		}

		// Helper to find a permission ID by its string name
		const getPermissionId = (name: string): string | null => {
			const found = seededPermissions.find((p) => p.name === name);
			return found ? String(found._id) : null;
		};

		// 2. Define standard Roles and their Permission mapping
		const rolesToSeed = [
			{
				name: vars.auth.roles.superAdmin, // "SUPER_ADMIN"
				description: "Super Administrator with full application access",
				permissions: seededPermissions.map((p) => String(p._id)), // All permissions
			},
			{
				name: vars.auth.roles.admin, // "ADMIN"
				description: "Administrator with content management and operations access",
				// All permissions except god-mode MANAGE_ALL and MANAGE_SETTINGS
				permissions: seededPermissions
					.filter(
						(p) =>
							p.name !== PermissionType.MANAGE_ALL &&
							p.name !== PermissionType.MANAGE_SETTINGS
					)
					.map((p) => String(p._id)),
			},
			{
				name: vars.auth.roles.user, // "USER"
				description: "Standard customer account with checkout and profile access",
				// Custom limited permissions for customer activity
				permissions: [
					PermissionType.READ_PRODUCT,
					PermissionType.READ_CATEGORY,
					PermissionType.READ_BRAND,
					PermissionType.CREATE_ORDER,
					PermissionType.READ_ORDER,
					PermissionType.READ_ORDERS,
					PermissionType.CREATE_REVIEW,
					PermissionType.READ_REVIEW,
					PermissionType.UPDATE_REVIEW,
					PermissionType.DELETE_REVIEW,
					PermissionType.CREATE_ADDRESS,
					PermissionType.READ_ADDRESSES,
					PermissionType.READ_ADDRESS,
					PermissionType.UPDATE_ADDRESS,
					PermissionType.DELETE_ADDRESS,
					PermissionType.READ_CART,
					PermissionType.CREATE_WISHLIST,
					PermissionType.READ_WISHLIST,
					PermissionType.DELETE_WISHLIST,
				]
					.map((name) => getPermissionId(name))
					.filter((id): id is string => id !== null),
			},
		];

		// Save/Seed Roles
		for (const roleData of rolesToSeed) {
			const existingRole = await Role.findOne({ name: roleData.name });
			if (!existingRole) {
				await Role.create(roleData);
				console.log(`👥 Created Role: ${roleData.name}`);
			} else {
				// Update permissions list on existing role to ensure new permissions propagate
				existingRole.permissions = roleData.permissions as any;
				await existingRole.save();
			}
		}

		console.log("🌱  Roles and permissions seeding completed successfully!");
	} catch (error) {
		console.error("⛔️  Error seeding roles and permissions:", error);
	}
};

export default seedRolesAndPermissions;
