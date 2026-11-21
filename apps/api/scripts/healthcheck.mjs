/**
 * BrewForm API container health-check probe (copied to `/app/healthcheck.mjs` in the image).
 *
 * Usage: `node /app/healthcheck.mjs [path]` — `path` defaults to `/ready` and must match
 * `^/[A-Za-z0-9/_-]*$` (a local path only: no scheme, host, query or dots).
 *
 * It requests `http://127.0.0.1:<APP_PORT, default 8000><path>` with Node's built-in
 * `fetch` and a 4-second timeout, exits 0 only on HTTP 200, and otherwise writes ONE
 * stderr line (the status code or the error name; never headers or body) and exits 1.
 * Plain JavaScript with Node built-ins only, so it starts in milliseconds and depends on
 * neither TypeScript loading, the app config nor the database client.
 *
 * Callers (all run the same command, `node /app/healthcheck.mjs /ready`):
 *   1. the API image `HEALTHCHECK` in `Dockerfile`;
 *   2. the compose `api` service healthcheck in `compose.production.yml`;
 *   3. the Coolify API health check (type `CMD`; the image has no curl or wget).
 *
 * `/ready` is the readiness probe (database reachable, not shutting down); `/health` is
 * the liveness endpoint for external uptime monitors.
 */

/** Allowed path argument: a local absolute path without dots, query or fragment. */
const PATH_PATTERN = /^\/[A-Za-z0-9/_-]*$/;

/** Request timeout in milliseconds (below the image HEALTHCHECK `--timeout=5s`). */
const TIMEOUT_MS = 4000;

const path = process.argv[2] ?? '/ready';

if (!PATH_PATTERN.test(path)) {
  console.error('healthcheck: invalid path argument (expected a local path such as /ready)');
  process.exit(1);
}

try {
  const res = await fetch(`http://127.0.0.1:${process.env.APP_PORT || 8000}${path}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 200) process.exit(0);
  console.error(`healthcheck: ${path} returned HTTP ${res.status}`);
  process.exit(1);
} catch (err) {
  const name = err instanceof Error ? err.name : 'Error';
  const code = err instanceof Error && err.cause && err.cause.code ? ` (${err.cause.code})` : '';
  console.error(`healthcheck: ${path} failed: ${name}${code}`);
  process.exit(1);
}
