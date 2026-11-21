/**
 * Health service: the liveness and readiness probe logic (production-operations
 * capability, "API exposes separate liveness and readiness probes").
 *
 * - Liveness (`GET /health`) checks nothing and always reports `ok`.
 * - Readiness (`GET /ready`) is `ready` (HTTP 200) only when one database ping settles
 *   within {@link READINESS_DB_TIMEOUT_MS} and the process is not shutting down;
 *   otherwise `not_ready` (HTTP 503). Cache, rate-limit store and storage health are
 *   reported but never change the status code.
 * - Concurrent probes share one in-flight ping, so a hung database holds at most one
 *   pool connection. The shared ping is released only when it settles.
 * - No probe logs at `info` or above on its own: entry/exit are `debug`; one `warn`
 *   marks a change to not ready and one `info` the recovery.
 *
 * Never touches the `CacheProvider` (only reads its health) and imports no
 * `drizzle-orm` (the ping lives in `./model.ts`).
 */
import type { Logger } from '@brewform/shared/logger';
import type { HealthOutput, ReadinessOutput } from '@brewform/shared/schemas';
import { config } from '../../config/index.ts';
import { getCacheStatus } from '../../utils/cache/singleton.ts';
import { toLoggableError } from '../../utils/errors.ts';
import { isShuttingDown } from '../../utils/lifecycle.ts';
import { createLogger } from '../../utils/logger/index.ts';
import { getRateLimitStoreStatus } from '../../utils/rate-limit/registry.ts';
import { checkStorageHealth } from '../../utils/storage/index.ts';
import { pingDatabase } from './model.ts';

/** Module logger. */
const log = createLogger('health');

/** A database ping that has not settled after this many milliseconds counts as `disconnected`. */
export const READINESS_DB_TIMEOUT_MS = 2000;

/** Everything {@link getReadiness} reads; tests inject stubs. */
export interface HealthDeps {
  /** One database round-trip (`pingDatabase`). */
  ping: () => Promise<unknown>;
  /** Cache health (`getCacheStatus`). */
  getCacheStatus: () => ReadinessOutput['cache'];
  /** Rate-limit store health (`getRateLimitStoreStatus`). */
  getRateLimitStoreStatus: () => ReadinessOutput['rateLimitStore'];
  /** Storage health (`checkStorageHealth` with the app config). */
  checkStorageHealth: () => Promise<ReadinessOutput['storage']>;
  /** The lifecycle flag (`isShuttingDown`). */
  isShuttingDown: () => boolean;
  /** Logger for entry/exit and transition logs. */
  log: Pick<Logger, 'debug' | 'info' | 'warn'>;
}

/** The production dependencies of {@link getReadiness}. */
export const defaultHealthDeps: HealthDeps = {
  ping: pingDatabase,
  getCacheStatus,
  getRateLimitStoreStatus,
  checkStorageHealth: () => checkStorageHealth(config),
  isShuttingDown,
  log,
};

/** The readiness result: the HTTP status to send and the bare JSON body. */
export interface ReadinessResult {
  /** `200` when `body.status` is `ready`, otherwise `503`. */
  httpStatus: 200 | 503;
  /** The `/ready` body (`ReadinessOutputSchema`). */
  body: ReadinessOutput;
}

/** The ping every concurrent probe awaits (`true` = connected); `null` when none is pending. */
let inFlightPing: Promise<boolean> | null = null;

/** The status of the previous readiness result (`undefined` before the first probe). */
let lastStatus: ReadinessOutput['status'] | undefined;

/**
 * Return the pending ping, or start one. The returned promise never rejects: a
 * failed ping resolves to `false` (logged at `debug`).
 *
 * @param deps - Supplies `ping` and `log`.
 * @returns `true` when the database answered.
 */
function sharedPing(deps: HealthDeps): Promise<boolean> {
  if (inFlightPing) return inFlightPing;
  const pending = (async () => {
    try {
      await deps.ping();
      return true;
    } catch (err) {
      deps.log.debug({ err: toLoggableError(err) }, 'readiness database ping failed');
      return false;
    }
  })();
  inFlightPing = pending;
  void pending.finally(() => {
    if (inFlightPing === pending) inFlightPing = null;
  });
  return pending;
}

/**
 * Await the shared ping for at most {@link READINESS_DB_TIMEOUT_MS}.
 *
 * @param deps - Supplies `ping` and `log`.
 * @returns `connected`, or `disconnected` on failure or timeout.
 */
async function pingWithTimeout(deps: HealthDeps): Promise<'connected' | 'disconnected'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), READINESS_DB_TIMEOUT_MS);
  });
  try {
    return (await Promise.race([sharedPing(deps), timeout])) ? 'connected' : 'disconnected';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Log a readiness transition: one `warn` with `{ db, shuttingDown }` when the status
 * becomes `not_ready` (including a first probe that is not ready), one `info` when it
 * returns to `ready`, nothing when it is unchanged.
 *
 * @param body - The new readiness body.
 * @param logger - The logger to write to.
 */
function logTransition(body: ReadinessOutput, logger: HealthDeps['log']): void {
  const previous = lastStatus;
  lastStatus = body.status;
  if (previous === body.status) return;
  if (body.status === 'not_ready') {
    logger.warn({ db: body.db, shuttingDown: body.shuttingDown }, 'API is not ready');
  } else if (previous === 'not_ready') {
    logger.info({ db: body.db }, 'API is ready again');
  }
}

/**
 * Liveness: the process is serving requests. Performs no dependency check.
 *
 * @returns Always `{ status: 'ok' }`.
 */
export function getLiveness(): HealthOutput {
  log.debug({}, 'getLiveness started');
  const body: HealthOutput = { status: 'ok' };
  log.debug({}, 'getLiveness completed');
  return body;
}

/**
 * Readiness: `ready` only when the database ping settles within
 * {@link READINESS_DB_TIMEOUT_MS} and the process is not shutting down. While
 * shutting down the database is not touched (`db: 'skipped'`).
 *
 * @param deps - Injected probes (defaults to {@link defaultHealthDeps}).
 * @returns The HTTP status (200/503) and the fixed-key body.
 */
export async function getReadiness(deps: HealthDeps = defaultHealthDeps): Promise<ReadinessResult> {
  deps.log.debug({}, 'getReadiness started');

  const shuttingDown = deps.isShuttingDown();
  const [db, storage] = await Promise.all([
    shuttingDown ? Promise.resolve('skipped' as const) : pingWithTimeout(deps),
    deps.checkStorageHealth(),
  ]);
  const status = !shuttingDown && db === 'connected' ? 'ready' : 'not_ready';
  const body: ReadinessOutput = {
    status,
    db,
    cache: deps.getCacheStatus(),
    rateLimitStore: deps.getRateLimitStoreStatus(),
    storage,
    shuttingDown,
  };

  logTransition(body, deps.log);
  deps.log.debug({ status, db, shuttingDown }, 'getReadiness completed');
  return { httpStatus: status === 'ready' ? 200 : 503, body };
}

/** Forget the shared ping and the last status (test isolation only). */
export function resetReadinessStateForTests(): void {
  inFlightPing = null;
  lastStatus = undefined;
}
