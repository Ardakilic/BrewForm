/**
 * Health probe routes, mounted at `/` in `routes/index.ts` (not under `/api/v1`).
 *
 * - `GET /health`: liveness for uptime monitors; always `200 {"status":"ok"}`.
 * - `GET /ready`: readiness for traffic and rollout gates (image `HEALTHCHECK`,
 *   compose `service_healthy`, Coolify); `200` when ready, `503` otherwise.
 *
 * Both return bare JSON (no success envelope) with `Cache-Control: no-store`, are
 * skipped by the global rate limit (`skipGlobalRateLimit` in `main.ts`) and never
 * touch the `CacheProvider`.
 */
import { HealthOutputSchema, ReadinessOutputSchema } from '@brewform/shared/schemas';
import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import type { AppEnv } from '../../types/hono.ts';
import * as service from './service.ts';

/** Router for the `/health` and `/ready` probes. */
const health = new Hono<AppEnv>();

health.get(
  '/health',
  describeRoute({
    tags: ['Health'],
    summary: 'Liveness probe',
    description:
      'Performs no dependency check and always returns 200 `{"status":"ok"}` while the ' +
      'process serves requests. Use it for external uptime monitors; use `/ready` for ' +
      'traffic and rollout gates. Not rate limited, never cached (`Cache-Control: no-store`).',
    responses: {
      200: {
        description: 'The process is serving requests',
        content: { 'application/json': { schema: resolver(HealthOutputSchema) } },
      },
    },
  }),
  (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json(service.getLiveness());
  },
);

health.get(
  '/ready',
  describeRoute({
    tags: ['Health'],
    summary: 'Readiness probe',
    description:
      'Returns 200 with `status: "ready"` only when a database round-trip settles within ' +
      '2000 ms and the process is not shutting down, otherwise 503 with ' +
      '`status: "not_ready"` (`db` is `disconnected`, or `skipped` while shutting down). ' +
      'The body always carries the same keys: `cache` and `rateLimitStore` (`ok`, ' +
      '`degraded`, `memory`, `disabled`) and `storage` (`ok`, `ephemeral`, `degraded`, `s3`) ' +
      'are informational and never change the status code. Not rate limited, never cached ' +
      '(`Cache-Control: no-store`).',
    responses: {
      200: {
        description: 'Ready: the database answered and the process is not shutting down',
        content: { 'application/json': { schema: resolver(ReadinessOutputSchema) } },
      },
      503: {
        description: 'Not ready: the database is unreachable or the process is shutting down',
        content: { 'application/json': { schema: resolver(ReadinessOutputSchema) } },
      },
    },
  }),
  async (c) => {
    const { httpStatus, body } = await service.getReadiness();
    c.header('Cache-Control', 'no-store');
    return c.json(body, httpStatus);
  },
);

export default health;
