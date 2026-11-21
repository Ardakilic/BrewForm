import { z } from 'zod';

/**
 * Liveness probe Output Schema — the bare JSON body of `GET /health`
 * (`apps/api/src/modules/health/index.ts`).
 *
 * `/health` performs no dependency check: while the process serves requests it
 * always answers `200` with exactly `{ "status": "ok" }`. It is the endpoint for
 * external uptime monitors. Not wrapped in the success envelope.
 */
export const HealthOutputSchema = z
  .object({
    status: z.literal('ok'),
  })
  .strict();

/** Inferred type of {@link HealthOutputSchema}. */
export type HealthOutput = z.infer<typeof HealthOutputSchema>;

/** Values of the `cache` and `rateLimitStore` readiness keys (cache-driver capability). */
const ComponentStatusSchema = z.enum(['ok', 'degraded', 'memory', 'disabled']);

/**
 * Readiness probe Output Schema — the bare JSON body of `GET /ready`, returned with
 * `200` when `status` is `ready` and `503` when it is `not_ready`
 * (`apps/api/src/modules/health/service.ts#getReadiness`).
 *
 * The key set is fixed (`.strict()`):
 * - `status`: `ready` only when the database ping settled within 2000 ms and the
 *   process is not shutting down;
 * - `db`: `connected`, `disconnected` (failed, timed out or unmigrated schema) or
 *   `skipped` (shutting down: the pool is not touched);
 * - `cache` / `rateLimitStore`: `ok`, `degraded`, `memory` or `disabled` — a degraded
 *   Valkey never makes the API unready;
 * - `storage`: `ok`, `ephemeral` (writable but not a mounted volume), `degraded` (not
 *   writable) or `s3` — informational only, never changes the status code;
 * - `shuttingDown`: `true` once SIGTERM/SIGINT was received.
 *
 * Not wrapped in the success envelope, so any orchestrator can parse it.
 */
export const ReadinessOutputSchema = z
  .object({
    status: z.enum(['ready', 'not_ready']),
    db: z.enum(['connected', 'disconnected', 'skipped']),
    cache: ComponentStatusSchema,
    rateLimitStore: ComponentStatusSchema,
    storage: z.enum(['ok', 'ephemeral', 'degraded', 's3']),
    shuttingDown: z.boolean(),
  })
  .strict();

/** Inferred type of {@link ReadinessOutputSchema}. */
export type ReadinessOutput = z.infer<typeof ReadinessOutputSchema>;
