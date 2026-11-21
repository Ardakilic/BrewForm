/**
 * OpenAPI documentation test for the recipe list and starred endpoints (advanced-search:
 * "Search term bounds and pattern sanitization", "Top-rated sort orders by average rating"
 * and "Database query time budget for search").
 *
 * `openapi.coverage.test.ts` excludes `/api/v1/recipes`, so this file pins the `search`
 * bound (`maxLength` 200) and description, the `sortBy=rating` semantics, and the 400 and
 * 503 (`QUERY_TIMEOUT`) error responses of `GET /api/v1/recipes` and
 * `GET /api/v1/recipes/starred`.
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

/** The subset of an OpenAPI parameter this test reads. */
interface Parameter {
  name?: string;
  in?: string;
  description?: string;
  schema?: { type?: string; maxLength?: number; enum?: string[] };
}

/** The subset of an OpenAPI operation this test reads. */
interface Operation {
  parameters?: Parameter[];
  responses?: Record<string, { description?: string; content?: Record<string, unknown> }>;
}

let operations: Record<string, Operation>;

beforeAll(async () => {
  const { default: routes } = await import('./index.ts');
  const res = await routes.request('/api/v1/openapi.json');
  expect(res.status).toBe(200);
  const spec = (await res.json()) as { paths?: Record<string, Record<string, Operation>> };
  operations = {
    'GET /api/v1/recipes': spec.paths?.['/api/v1/recipes']?.get ?? {},
    'GET /api/v1/recipes/starred': spec.paths?.['/api/v1/recipes/starred']?.get ?? {},
  };
});

describe.each(['GET /api/v1/recipes', 'GET /api/v1/recipes/starred'])('OpenAPI: %s', (key) => {
  /** The named query parameter of this operation. */
  function param(name: string): Parameter | undefined {
    return operations[key].parameters?.find((p) => p.name === name && p.in === 'query');
  }

  it('bounds search at 200 characters and describes relevance ordering', () => {
    const search = param('search');
    expect(search?.schema).toEqual({ type: 'string', maxLength: 200 });
    expect(search?.description).toContain(
      'Case-insensitive substring match on title, coffee name and personal notes; results ordered by relevance (title 3, coffee name 2, notes 1), then sortBy',
    );
  });

  it('describes sortBy=rating as average rating with unrated last', () => {
    const sortBy = param('sortBy');
    expect(sortBy?.schema?.enum).toEqual(['createdAt', 'likeCount', 'rating']);
    expect(sortBy?.description).toContain('average rating, unrated last');
  });

  it('documents 400 validation and 503 QUERY_TIMEOUT error envelopes', () => {
    const responses = operations[key].responses ?? {};
    expect(responses['400']?.content).toHaveProperty('application/json');
    expect(responses['503']?.content).toHaveProperty('application/json');
    expect(responses['503']?.description).toContain('QUERY_TIMEOUT');
  });
});
