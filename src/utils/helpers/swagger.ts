export const normalizeSwaggerTypes = (schema: { [x: string]: any; type: string; ref: any }) => {
	if (!schema || typeof schema !== "object") return schema;

	if (schema.type === "SchemaObjectId") {
		return {
			type: "string",
			format: "objectId",
			...(schema.ref ? { ref: schema.ref } : {}),
		};
	}

	if (schema.type === "array" && schema.items) {
		schema.items = normalizeSwaggerTypes(schema.items);
	}

	for (const key in schema) {
		const value = schema[key];

		if (typeof value === "object") {
			schema[key] = normalizeSwaggerTypes(value);
		}
	}

	return schema;
};
