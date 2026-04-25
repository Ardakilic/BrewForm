import { Hono } from 'hono';
import { config } from '../config/index.ts';

const openapi = new Hono();

openapi.get('/openapi.json', (c) => {
  if (!config.OPENAPI_ENABLED) {
    return c.json({ error: 'OpenAPI disabled' }, 404);
  }

  return c.json({
    openapi: '3.0.0',
    info: {
      title: 'BrewForm API',
      version: '1.0.0',
      description: 'Coffee brewing recipe sharing and discovery platform',
    },
    servers: [
      { url: 'http://localhost:8000', description: 'Development' },
    ],
    paths: {},
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  });
});

export default openapi;