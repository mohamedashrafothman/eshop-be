import path from "path";
import swaggerJsdoc, * as swaggerJSDoc from "swagger-jsdoc";
import vars from "../utils/vars";

const swaggerOptions: swaggerJSDoc.OAS3Options = {
	definition: {
		openapi: "3.0.0",
		info: {
			title: `${vars.app.name}'s API Documentation`,
			version: "",
			description: "REST API documentation for the backend",
		},
		servers: [{ url: vars.app.url, description: "" }],
	},
	apis: [
		path.join(__dirname, "../../api-schemas/*.ts"),
		path.join(__dirname, "../../routes/api/**/*.ts"),
		path.join(__dirname, "../../controllers/**/*.ts"),
	],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

export default swaggerSpec;
