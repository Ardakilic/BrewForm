/**
 * @module
 * Generates `docs/api-reference.md` from the OpenAPI document (ADR-021, doc-drift-check
 * capability). Builds the real route tree from `src/routes/index.ts` (which registers the
 * OpenAPI routes with `openApiDocumentation`), requests `/api/v1/openapi.json` in-process,
 * renders it with `renderApiReference` and writes the file under a "Generated — do not edit"
 * banner. Mounted routes that the spec does not describe are reported as a warning.
 *
 * Usage: `pnpm --filter @brewform/api run docs:api` (CI regenerates the file and fails on any
 * diff). Like `routes/openapi.coverage.test.ts`, it sets test-safe env BEFORE importing any
 * module that reads config: `postgres-js` connects lazily and the cache uses the in-memory
 * driver, so generating the spec performs no DB or cache I/O.
 */
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

process.env.OPENAPI_ENABLED = 'true';
process.env.APP_ENV = 'test';
process.env.CACHE_DRIVER = 'memory';
process.env.RATE_LIMIT_STORE = 'memory';
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
}
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'a-very-long-secret-key-for-generating-the-api-reference';
}

/** Output file, relative to this script (`apps/api/scripts/`). */
const OUTPUT = resolve(import.meta.dirname, '../../../docs/api-reference.md');

/** Banner inserted under the reference's title. */
const BANNER = [
  '> **Generated — do not edit.** Rendered from the OpenAPI document served at',
  '> `/api/v1/openapi.json` by `apps/api/scripts/generate-api-reference.ts`. After changing a',
  "> route's `describeRoute()` metadata, regenerate it with",
  '> `pnpm --filter @brewform/api run docs:api`; CI fails when this file is stale.',
  '> Cross-cutting conventions (base URL, envelopes, error codes, authentication, pagination,',
  '> rate limits, deprecations) live in [api.md](api.md). The interactive reference is the',
  '> Scalar UI at `/api/v1/docs` (when `OPENAPI_ENABLED=true`).',
].join('\n');

const { createLogger } = await import('../src/utils/logger/index.ts');
const { findUndocumentedRoutes, renderApiReference } = await import(
  '../src/utils/openapi/reference.ts'
);

/** Module logger for the generator (route paths and counts only). */
const log = createLogger('api-reference');

/**
 * Fetches the OpenAPI document from the real route tree, renders the Markdown reference with the
 * banner, writes it to `docs/api-reference.md` and warns about undocumented mounted routes.
 */
async function generate(): Promise<void> {
  log.debug({ output: OUTPUT }, 'generateApiReference started');
  const { default: routes } = await import('../src/routes/index.ts');
  const res = await routes.request('/api/v1/openapi.json');
  if (res.status !== 200) {
    throw new Error(`GET /api/v1/openapi.json returned ${res.status}`);
  }
  const spec = await res.json();

  const missing = findUndocumentedRoutes(routes.routes, spec);
  if (missing.length > 0) {
    log.warn(
      { count: missing.length, routes: missing },
      'mounted routes missing from the OpenAPI spec',
    );
  }

  const [title, ...rest] = renderApiReference(spec).split('\n');
  await writeFile(OUTPUT, [title, '', BANNER, ...rest].join('\n'));
  log.debug(
    { output: OUTPUT, paths: Object.keys(spec.paths ?? {}).length, undocumented: missing.length },
    'generateApiReference completed',
  );
}

try {
  await generate();
} catch (err) {
  log.error({ err }, 'generateApiReference failed');
  process.exitCode = 1;
}
