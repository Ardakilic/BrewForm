import { db } from '@brewform/db';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { getCacheStatus } from '../utils/cache/singleton.ts';
import { getRateLimitStoreStatus } from '../utils/rate-limit/registry.ts';

/** Hono router for the `/health` and `/ready` probes, mounted at `/` in `routes/index.ts`. */
const health = new Hono();

/** Allowed values of the `cache` and `rateLimitStore` readiness fields. */
const COMPONENT_STATUS = ['ok', 'degraded', 'memory', 'disabled'];

/**
 * OpenAPI schema of the `/ready` body (plain JSON, not the success envelope).
 *
 * @param status - The `status` value of this response.
 * @param dbState - The `db` value of this response.
 */
function readySchema(status: string, dbState: string) {
  return {
    type: 'object' as const,
    required: ['status', 'db', 'cache', 'rateLimitStore'],
    properties: {
      status: { type: 'string' as const, enum: [status] },
      db: { type: 'string' as const, enum: [dbState] },
      cache: { type: 'string' as const, enum: COMPONENT_STATUS },
      rateLimitStore: { type: 'string' as const, enum: COMPONENT_STATUS },
    },
  };
}

health.get(
  '/health',
  describeRoute({
    tags: ['Health'],
    summary: 'Liveness probe',
    responses: { 200: { description: 'Service is up' } },
  }),
  (c) => c.json({ status: 'ok' }),
);

health.get(
  '/ready',
  describeRoute({
    tags: ['Health'],
    summary: 'Readiness probe',
    description:
      'Returns 503 if the database connection is unavailable; the status code depends on the ' +
      'database only. The body also reports `cache` and `rateLimitStore` health (`ok`, ' +
      '`degraded`, `memory` or `disabled`): an optional Valkey outage shows as `degraded` but ' +
      'never makes the API unready.',
    responses: {
      200: {
        description: 'Service ready and DB reachable (cache and rate-limit store health included)',
        content: { 'application/json': { schema: readySchema('ready', 'connected') } },
      },
      503: {
        description: 'Service not ready (database unreachable)',
        content: { 'application/json': { schema: readySchema('not_ready', 'disconnected') } },
      },
    },
  }),
  async (c) => {
    const components = { cache: getCacheStatus(), rateLimitStore: getRateLimitStoreStatus() };
    try {
      await db.execute(sql`SELECT 1`);
      return c.json({ status: 'ready', db: 'connected', ...components });
    } catch {
      return c.json({ status: 'not_ready', db: 'disconnected', ...components }, 503);
    }
  },
);

export default health;
