import mongooseToSwagger from "mongoose-to-swagger";
import path from "path";
import swaggerJsdoc, * as swaggerJSDoc from "swagger-jsdoc";
import { SwaggerTheme, SwaggerThemeNameEnum } from "swagger-themes";
import { capitalize } from "../utils/helpers";
import { normalizeSwaggerTypes } from "../utils/helpers/swagger";
import vars from "../utils/vars";
import { models } from "./mongoose";

const excludedModels = [
	"Attachments",
	"Sessions",
	"Logs",
	"Cart Items",
	"Emails",
	"OrderItems",
	"Tokens",
];
// Mongoose models to Swagger schemas
const schemas = Object.fromEntries(
	Object.entries(models)
		.filter(([_name, model]) => !excludedModels.includes(model.collection.name))
		.map(([_name, model]) => [
			capitalize(model.collection.name),
			normalizeSwaggerTypes(mongooseToSwagger(model)),
		])
);

// Mongoose models to Swagger tags
const tags = Object.entries(models)
	.filter(([_name, model]) => !excludedModels.includes(model.collection.name))
	.map(([_name, model]) => ({
		name: capitalize(model.collection.name),
		description: `Operations related to ${capitalize(model.collection.name).toLowerCase()}`,
	}));

// Swagger Options
const swaggerOptions: swaggerJSDoc.OAS3Options = {
	definition: {
		openapi: "3.0.1",
		info: {
			title: `${vars.app.name}'s API Documentation`,
			version: "",
			description:
				"REST API documentation.\n\n[Download OpenAPI JSON](/api-docs/swagger.json)",
			contact: {
				name: "Mohamed Ashraf Othman",
				email: "mohamedashrafothman@gmail.com",
			},
		},
		servers: [{ url: `${vars.app.url}/api`, description: "" }],
		components: {
			securitySchemes: {
				bearerAuth: {
					type: vars.app.protocol,
					scheme: vars.auth.strategies.jwt.tokenType.toLowerCase(),
					bearerFormat: vars.tokenTypes.jwt,
				},
			},
			schemas,
		},
		tags,
		security: [{ bearerAuth: [] }],
	},
	apis: [
		path.join(__dirname, "../api-schemas/*.ts"),
		path.join(__dirname, "../routes/api/**/*.ts"),
		path.join(__dirname, "../controllers/**/*.ts"),
	],
};

// Swagger Setup
const swaggerSetupOptions = {
	explorer: true,
	customCss: new SwaggerTheme().getBuffer(SwaggerThemeNameEnum.CLASSIC),
	swaggerOptions: { url: "/api-docs/swagger.json" },
};

// Swagger
const swaggerSpec = swaggerJsdoc(swaggerOptions);

export { swaggerSetupOptions };
export default swaggerSpec;
