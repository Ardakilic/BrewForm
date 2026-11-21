/**
 * Process lifecycle: the "shutting down" flag read by the readiness probe and the
 * graceful-shutdown handler `main.ts` registers for SIGTERM/SIGINT.
 *
 * Shutdown sequence: mark not ready → close HTTP server → database → email
 * transporter → cache → rate-limit store → exit. Marking first makes `GET /ready`
 * answer `503` (`shuttingDown: true`, `db: "skipped"`) on connections that are still
 * open while the server drains, so orchestrators stop routing new traffic before the
 * listener closes (production-operations capability).
 */
import type { Logger } from '@brewform/shared/logger';

/** `true` once shutdown has started; never reset outside tests. */
let shuttingDown = false;

/** Mark the process as shutting down; `GET /ready` returns `503` from now on. */
export function markShuttingDown(): void {
  shuttingDown = true;
}

/**
 * Whether shutdown has started.
 *
 * @returns `true` after {@link markShuttingDown} (or the shutdown handler) ran.
 */
export function isShuttingDown(): boolean {
  return shuttingDown;
}

/** Clear the shutting-down flag (test isolation only). */
export function resetLifecycleForTests(): void {
  shuttingDown = false;
}

/** The logger methods the shutdown handler uses. */
export type ShutdownLogger = Pick<Logger, 'info' | 'debug' | 'error'>;

/** The resources the shutdown handler closes, in order, plus its exit and log sinks. */
export interface ShutdownDeps {
  /** Stop accepting connections and wait for in-flight requests (`server.close`). */
  closeServer: () => Promise<void>;
  /** End the postgres-js pool. */
  closeDb: () => Promise<void>;
  /** Close the email transporter. */
  closeTransporter: () => void | Promise<void>;
  /** Close the active cache provider (when it exposes `close`). */
  closeCache: () => Promise<void>;
  /** Close the rate-limit store connection (its own Redis client when configured). */
  closeRateLimitStore: () => Promise<void>;
  /** Terminate the process (`process.exit`). */
  exit: (code: number) => void;
  /** The `main` logger. */
  log: ShutdownLogger;
}

/**
 * Build the SIGTERM/SIGINT handler.
 *
 * The first call marks the process as shutting down BEFORE `closeServer` runs, then
 * closes the HTTP server, database, email transporter, cache and rate-limit store in
 * that order, logging each step, and calls `exit(0)` after
 * `Graceful shutdown complete`. A later call (a second signal) logs at `debug` and
 * returns without closing anything. A rejecting step logs at `error` with `err` and
 * calls `exit(1)`; the remaining steps are skipped.
 *
 * @param deps - Resource closers, the exit function and the logger.
 * @returns The signal handler.
 */
export function createShutdownHandler(deps: ShutdownDeps): () => Promise<void> {
  const { log } = deps;
  let started = false;

  return async () => {
    if (started) {
      log.debug({ shuttingDown: true }, 'Shutdown already in progress; signal ignored');
      return;
    }
    started = true;
    markShuttingDown();
    log.info('Shutting down gracefully...');

    try {
      await deps.closeServer();
      log.info('HTTP server closed');

      await deps.closeDb();
      log.info('Database connection closed');

      await deps.closeTransporter();
      log.info('Email transporter closed');

      await deps.closeCache();
      log.info('Cache connection closed');

      await deps.closeRateLimitStore();
      log.info('Rate-limit store closed');
    } catch (err) {
      log.error({ err }, 'Graceful shutdown failed');
      deps.exit(1);
      return;
    }

    log.info('Graceful shutdown complete');
    deps.exit(0);
  };
}
