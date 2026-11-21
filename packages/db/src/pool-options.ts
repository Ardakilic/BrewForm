/**
 * Pool options for the shared postgres-js client (`packages/db/src/index.ts`).
 *
 * Kept free of side effects (no client is created here) so the parsing rules can be
 * unit-tested without a database.
 */

/** Default server-side statement timeout for every pool connection, in milliseconds. */
export const DEFAULT_STATEMENT_TIMEOUT_MS = 10_000;

/**
 * Parse `DB_STATEMENT_TIMEOUT_MS`.
 *
 * - unset or blank → {@link DEFAULT_STATEMENT_TIMEOUT_MS} (10000);
 * - a non-negative integer (surrounding whitespace ignored) → that value, where `0`
 *   disables the timeout;
 * - anything else (negative, fractional, non-numeric) → the default, so a typo can never
 *   silently remove the time budget.
 *
 * @param raw - The raw environment value.
 * @returns The timeout in milliseconds; `0` means "no timeout".
 */
export function parseStatementTimeoutMs(raw: string | undefined): number {
  const value = raw?.trim();
  if (!value || !/^\d+$/.test(value)) return DEFAULT_STATEMENT_TIMEOUT_MS;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : DEFAULT_STATEMENT_TIMEOUT_MS;
}

/** The postgres-js options the shared pool is created with. */
export interface SharedPoolOptions {
  /** Maximum number of pooled connections. */
  max: number;
  /** Seconds to wait for a new connection before failing. */
  connect_timeout: number;
  /** Seconds an idle connection stays open before it is closed. */
  idle_timeout: number;
  /** Startup parameters sent on every connection (`statement_timeout` in ms when enabled). */
  connection: { statement_timeout?: number };
}

/**
 * Build the shared pool options: `max: 10`, `connect_timeout: 10`, `idle_timeout: 20`,
 * and the `statement_timeout` startup parameter when `timeoutMs > 0` (none for `0`).
 *
 * @param timeoutMs - The statement timeout from {@link parseStatementTimeoutMs}.
 * @returns Options to pass to `postgres(url, options)`.
 */
export function sharedPoolOptions(timeoutMs: number): SharedPoolOptions {
  return {
    max: 10,
    connect_timeout: 10,
    idle_timeout: 20,
    connection: timeoutMs > 0 ? { statement_timeout: timeoutMs } : {},
  };
}
