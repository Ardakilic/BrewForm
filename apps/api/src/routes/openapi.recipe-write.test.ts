/**
 * OpenAPI documentation test for `PATCH /api/v1/recipes/{id}` (recipe-write: "Recipe PATCH
 * route is gated, mapped and documented").
 *
 * `openapi.coverage.test.ts` only enforces documentation for its in-scope base paths, which
 * exclude `/api/v1/recipes`, so this file pins the PATCH operation explicitly: tags, summary,
 * description, security, the `id` parameter, the JSON request body built from
 * `RecipeUpdateSchema`, the recipe-detail success envelope and every documented error status.
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

/** The subset of a JSON schema this test reads. */
interface JsonSchemaLike {
  properties?: Record<string, unknown>;
  $ref?: string;
}

/** The subset of an OpenAPI operation this test reads. */
interface Operation {
  tags?: string[];
  summary?: string;
  description?: string;
  security?: Array<Record<string, unknown>>;
  parameters?: Array<{ name?: string; in?: string; required?: boolean }>;
  requestBody?: { content?: Record<string, { schema?: JsonSchemaLike }> };
  responses?: Record<string, { content?: Record<string, { schema?: JsonSchemaLike }> }>;
}

/** The documented recipe path in OpenAPI template syntax. */
const RECIPE_PATH = '/api/v1/recipes/{id}';

let patch: Operation;

beforeAll(async () => {
  const { default: routes } = await import('./index.ts');
  const res = await routes.request('/api/v1/openapi.json');
  expect(res.status).toBe(200);
  const spec = (await res.json()) as { paths?: Record<string, Record<string, Operation>> };
  patch = spec.paths?.[RECIPE_PATH]?.patch ?? {};
});

describe(`OpenAPI: PATCH ${RECIPE_PATH}`, () => {
  it("is tagged 'Recipes' with a summary and a description of amend versus bump", () => {
    expect(patch.tags).toEqual(['Recipes']);
    expect(patch.summary?.length).toBeGreaterThan(0);
    expect(patch.description).toContain('bumpVersion');
    expect(patch.description).toContain('null');
  });

  it('requires bearerAuth', () => {
    expect(patch.security).toEqual(
      expect.arrayContaining([expect.objectContaining({ bearerAuth: [] })]),
    );
  });

  it('documents the required id path parameter', () => {
    expect(patch.parameters).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'id', in: 'path', required: true })]),
    );
  });

  it('documents the JSON request body from RecipeUpdateSchema', () => {
    const schema = patch.requestBody?.content?.['application/json']?.schema;
    expect(schema?.properties).toHaveProperty('bumpVersion');
    expect(schema?.properties).toHaveProperty('coffeeVarietyId');
    expect(schema?.properties).not.toHaveProperty('brewRatio');
  });

  it('documents a 200 recipe-detail envelope and the 400/401/403/404/409/422 errors', () => {
    const responses = patch.responses ?? {};
    expect(responses['200']?.content?.['application/json']?.schema).toBeDefined();
    for (const status of ['400', '401', '403', '404', '409', '422']) {
      expect(responses[status]?.content?.['application/json']?.schema).toBeDefined();
    }
  });
});
