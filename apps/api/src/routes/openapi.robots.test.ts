/**
 * OpenAPI documentation test for the `X-Robots-Tag` response header (capability
 * `recipe-visibility`, "Non-public pages and responses are never indexed"): the recipe detail,
 * versions and version-diff routes and the collection detail document the header on their 200
 * response, and the share route documents it on its 404 response.
 *
 * Built like the coverage test: env is set before the dynamic import of the router so the
 * config singleton enables the spec; generating the spec performs no DB or cache I/O.
 */
import { beforeAll, describe, expect, it } from 'vitest';

process.env.OPENAPI_ENABLED = 'true';
process.env.APP_ENV = 'test';
process.env.CACHE_DRIVER = 'memory';
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
}
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'a-very-long-secret-key-for-testing-12345';
}

/** The subset of an OpenAPI response this test reads. */
interface ResponseObject {
  headers?: Record<string, { schema?: { type?: string }; description?: string }>;
}

/** The subset of an OpenAPI operation this test reads. */
interface Operation {
  responses?: Record<string, ResponseObject>;
}

let paths: Record<string, Record<string, Operation>>;

beforeAll(async () => {
  const { default: routes } = await import('./index.ts');
  const res = await routes.request('/api/v1/openapi.json');
  expect(res.status).toBe(200);
  const spec = (await res.json()) as { paths?: Record<string, Record<string, Operation>> };
  paths = spec.paths ?? {};
});

/** Find the GET operation whose path matches `pattern` (path parameter names vary). */
function getOperation(pattern: RegExp): Operation {
  const key = Object.keys(paths).find((path) => pattern.test(path));
  expect(key, `a path matching ${pattern}`).toBeDefined();
  return paths[key as string].get ?? {};
}

describe('OpenAPI: X-Robots-Tag response header (recipe-visibility)', () => {
  const documented = [
    {
      label: 'GET /api/v1/recipes/:slugOrId',
      pattern: /^\/api\/v1\/recipes\/\{slugOrId\}$/,
      status: '200',
    },
    {
      label: 'GET /api/v1/recipes/:slug/versions',
      pattern: /^\/api\/v1\/recipes\/\{slug\}\/versions$/,
      status: '200',
    },
    {
      label: 'GET /api/v1/recipes/:slug/versions/diff',
      pattern: /^\/api\/v1\/recipes\/\{slug\}\/versions\/diff$/,
      status: '200',
    },
    {
      label: 'GET /api/v1/collections/:id',
      pattern: /^\/api\/v1\/collections\/\{id\}$/,
      status: '200',
    },
    { label: 'GET /share/:slug', pattern: /\/share\/\{slug\}$/, status: '404' },
  ];

  it.each(documented)('$label documents the header on $status', ({ pattern, status }) => {
    const header = getOperation(pattern).responses?.[status]?.headers?.['X-Robots-Tag'];
    expect(header).toEqual({
      schema: { type: 'string' },
      description: 'noindex, nofollow for non-public items',
    });
  });
});
