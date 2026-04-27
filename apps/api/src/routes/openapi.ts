/**
 * OpenAPI spec generation.
 *
 * Wires `hono-openapi`'s `openAPIRouteHandler` to expose the auto-generated
 * OpenAPI 3.x specification at `/openapi.json`. The spec is derived from
 * `describeRoute()` decorations applied to the individual route modules
 * (auth, recipe, admin, etc.).
 *
 * Gated by `OPENAPI_ENABLED` — when disabled, the endpoint returns 404 to
 * avoid leaking the API surface in production.
 */
import type { Hono } from 'hono';
import { openAPIRouteHandler } from 'hono-openapi';
import { config } from '../config/index.ts';
import type { AppEnv } from '../types/hono.ts';

/**
 * Registers GET /openapi.json on the supplied Hono instance. Must be called
 * AFTER all sub-routers have been mounted so the spec can introspect them.
 */
export function registerOpenApi(app: Hono<AppEnv>): void {
  const handler = openAPIRouteHandler(app, {
    documentation: {
      info: {
        title: 'BrewForm API',
        version: '1.0.0',
        description: 'Coffee brewing recipe sharing and discovery platform',
      },
      servers: [
        { url: 'http://localhost:8000', description: 'Development' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      tags: [
        { name: 'Auth', description: 'Registration, login, password reset, token refresh' },
        { name: 'Recipes', description: 'Recipe CRUD, fork, like/favourite/feature toggles' },
        { name: 'Users', description: 'Public user profiles and the authenticated user' },
        { name: 'Admin', description: 'Privileged admin operations (requires admin role)' },
        { name: 'Health', description: 'Liveness and readiness probes' },
      ],
    },
    excludeStaticFile: true,
    excludeMethods: ['OPTIONS', 'HEAD'],
  });

  app.get('/openapi.json', async (c, next) => {
    if (!config.OPENAPI_ENABLED) {
      return c.json({ error: 'OpenAPI disabled' }, 404);
    }
    return await handler(c, next);
  });
}
