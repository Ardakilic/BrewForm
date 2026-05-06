import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { db } from '@brewform/db';
import { sql } from 'drizzle-orm';

const health = new Hono();

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
    description: 'Returns 503 if the database connection is unavailable.',
    responses: {
      200: { description: 'Service ready and DB reachable' },
      503: { description: 'Service not ready' },
    },
  }),
  async (c) => {
    try {
      await db.execute(sql`SELECT 1`);
      return c.json({ status: 'ready', db: 'connected' });
    } catch {
      return c.json({ status: 'not_ready', db: 'disconnected' }, 503);
    }
  },
);

export default health;
