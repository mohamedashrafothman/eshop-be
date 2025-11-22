import swaggerUi from "swagger-ui-express";
import swaggerSpec, { swaggerSetupOptions } from "../config/swagger";

const middleware = [swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerSetupOptions)];

export default middleware;
