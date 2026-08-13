/**
 * OpenAPI spec generation.
 *
 * Wires `hono-openapi`'s `openAPIRouteHandler` to expose the auto-generated
 * OpenAPI 3.x specification at `/api/v1/openapi.json` (per §6.9). A minimal
 * Scalar-style HTML viewer is served at `/api/v1/docs`. Both endpoints are
 * derived from `describeRoute()` decorations on the individual route modules
 * (auth, recipe, admin, etc.).
 *
 * Gated by `OPENAPI_ENABLED` — when disabled, both endpoints return 404 to
 * avoid leaking the API surface in production.
 */
import type { Hono } from 'hono';
import { openAPIRouteHandler } from 'hono-openapi';
import { config } from '../config/index.ts';
import type { AppEnv } from '../types/hono.ts';

const DOCS_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>BrewForm API — Reference</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <script
      id="api-reference"
      data-url="/api/v1/openapi.json"
    ></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;

/**
 * Registers GET /api/v1/openapi.json and GET /api/v1/docs on the supplied
 * Hono instance. Must be called AFTER all sub-routers have been mounted so
 * the spec can introspect them.
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
        { name: 'Beans', description: 'Coffee bean inventory owned by users' },
        { name: 'Badges', description: 'Achievement badges and per-user awards' },
        {
          name: 'Brew Logs',
          description: 'Personal brew journal entries and brew stats',
        },
        {
          name: 'Coffee Varieties',
          description: 'Coffee cultivar reference data and recipes using a variety',
        },
        {
          name: 'Collections',
          description: 'User-owned named collections of recipes',
        },
        { name: 'Comments', description: 'Recipe comment threads and replies' },
        { name: 'Contact', description: 'Contact-form message submission' },
        { name: 'Equipment', description: 'Brewing equipment catalogue and deletion requests' },
        { name: 'Follow', description: 'Follow/unfollow, follower/following lists, and feed' },
        {
          name: 'Notifications',
          description: 'In-app notification feed and read-state management',
        },
        { name: 'Photos', description: 'Recipe photo upload and listing' },
        { name: 'Preferences', description: 'Per-user application and notification preferences' },
        { name: 'QR Codes', description: 'Recipe QR-code image generation' },
        { name: 'Reports', description: 'Content moderation reports' },
        { name: 'Setups', description: 'Saved brewing-equipment setups' },
        { name: 'Taste Notes', description: 'Taste-note hierarchy, search, and admin management' },
        { name: 'Vendors', description: 'Coffee vendor/roaster directory' },
        { name: 'Share', description: 'Server-rendered share/OG preview pages' },
        { name: 'Sitemap', description: 'XML sitemap for crawlers' },
      ],
    },
    // The sitemap route is mounted at `/api/v1/sitemap.xml`; its path ends in a
    // file extension, so static-file exclusion would drop it from the spec.
    // hono-openapi only documents routes carrying `describeRoute()` metadata, so
    // disabling this does NOT surface the un-annotated `/api/v1/openapi.json` or
    // `/api/v1/docs` meta endpoints. (Requirement 9.2)
    excludeStaticFile: false,
    excludeMethods: ['OPTIONS', 'HEAD'],
  });

  app.get('/api/v1/openapi.json', async (c, next) => {
    if (!config.OPENAPI_ENABLED) {
      return c.json({ error: 'OpenAPI disabled' }, 404);
    }
    return await handler(c, next);
  });

  app.get('/api/v1/docs', (c) => {
    if (!config.OPENAPI_ENABLED) {
      return c.json({ error: 'OpenAPI disabled' }, 404);
    }
    return c.html(DOCS_HTML);
  });
}
