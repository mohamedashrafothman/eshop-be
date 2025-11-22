import path from "path";
import swaggerJsdoc, * as swaggerJSDoc from "swagger-jsdoc";
import { SwaggerTheme, SwaggerThemeNameEnum } from "swagger-themes";
import vars from "../utils/vars";

const swaggerOptions: swaggerJSDoc.OAS3Options = {
	definition: {
		openapi: "3.0.0",
		info: {
			title: `${vars.app.name}'s API Documentation`,
			version: "",
			description:
				"REST API documentation.\n\n[Download OpenAPI JSON](/api-docs/swagger.json)",
		},
		servers: [{ url: vars.app.url, description: "" }],
		components: {
			securitySchemes: {
				bearerAuth: {
					type: vars.app.protocol,
					scheme: vars.auth.strategies.jwt.tokenType,
					bearerFormat: vars.tokenTypes.jwt,
				},
			},
		},
		security: [{ bearerAuth: [] }],
	},
	apis: [
		path.join(__dirname, "../api-schemas/*.ts"),
		path.join(__dirname, "../routes/api/**/*.ts"),
		path.join(__dirname, "../controllers/**/*.ts"),
	],
};

const swaggerSetupOptions = {
	explorer: true,
	customCss: new SwaggerTheme().getBuffer(SwaggerThemeNameEnum.NEWSPAPER),
	swaggerOptions: { url: "/api-docs/swagger.json" },
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

export { swaggerSetupOptions };
export default swaggerSpec;
