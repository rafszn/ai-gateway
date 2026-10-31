import swaggerJSDoc from "swagger-jsdoc";
import cfg from "../global/environment.config.js";

export const swaggerOptions: swaggerJSDoc.Options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "API",
      version: "1.0.0",
      description: "API documentation",
    },
    servers: [
      {
        url: `http://localhost:${cfg.PORT}/v1`,
        description: "Local development server",
      },
    ],
    tags: [
      {
        name: "Auth",
        description: "Authentication",
      },
      {
        name: "Responses",
        description: "OpenAI compatible model responses",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "API key",
        },
        apiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "api-key",
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ["src/core/Modules/**/*.ts", "dist/core/Modules/**/*.js"],
};

export const swaggerSpec = swaggerJSDoc(swaggerOptions);
