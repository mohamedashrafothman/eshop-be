import mongooseToSwagger from "mongoose-to-swagger";
import path from "path";
import swaggerJsdoc, * as swaggerJSDoc from "swagger-jsdoc";
import { SwaggerTheme, SwaggerThemeNameEnum } from "swagger-themes";
import vars from "../utils/vars";
import { models } from "./mongoose";

// Mongoose models to Swagger schemas
const schemas = Object.fromEntries(
	Object.entries(models).map(([name, model]) => [name, mongooseToSwagger(model)])
);

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
					scheme: vars.auth.strategies.jwt.tokenType,
					bearerFormat: vars.tokenTypes.jwt,
				},
			},
			schemas,
		},
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
