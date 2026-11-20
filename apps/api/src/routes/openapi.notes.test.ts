/**
 * OpenAPI documentation test for the private notes endpoints.
 *
 * `openapi.coverage.test.ts` only enforces documentation for its in-scope base
 * paths (`IN_SCOPE_BASE_PATHS`), which exclude `/api/v1/recipes`, so this file
 * pins `/api/v1/recipes/{id}/notes` explicitly: GET, PUT and DELETE are fully
 * documented and tagged, and there is NO `post` operation (the legacy IDOR
 * endpoint is removed).
 *
 * Built like the coverage test: env is set before the dynamic import of the
 * router so the config singleton enables the spec; generating the spec performs
 * no DB or cache I/O.
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

/** The subset of an OpenAPI operation this test reads. */
interface Operation {
  tags?: string[];
  summary?: string;
  description?: string;
  security?: Array<Record<string, unknown>>;
  parameters?: Array<{ name?: string; in?: string; required?: boolean }>;
  requestBody?: { content?: Record<string, { schema?: unknown }> };
  responses?: Record<string, { content?: Record<string, { schema?: unknown }> }>;
}

/** The documented notes path in OpenAPI template syntax. */
const NOTES_PATH = '/api/v1/recipes/{id}/notes';

let pathItem: Record<string, Operation>;

beforeAll(async () => {
  const { default: routes } = await import('./index.ts');
  const res = await routes.request('/api/v1/openapi.json');
  expect(res.status).toBe(200);
  const spec = (await res.json()) as { paths?: Record<string, Record<string, Operation>> };
  pathItem = spec.paths?.[NOTES_PATH] ?? {};
});

describe(`OpenAPI: ${NOTES_PATH}`, () => {
  it('documents get, put and delete', () => {
    expect(Object.keys(pathItem)).toEqual(expect.arrayContaining(['get', 'put', 'delete']));
  });

  it('has no post operation (the legacy notes POST is removed)', () => {
    expect(pathItem).not.toHaveProperty('post');
  });

  for (const method of ['get', 'put', 'delete'] as const) {
    describe(method.toUpperCase(), () => {
      it("is tagged 'Recipes' with a summary and a description", () => {
        const op = pathItem[method];
        expect(op.tags).toEqual(['Recipes']);
        expect(op.summary?.length).toBeGreaterThan(0);
        expect(op.description?.length).toBeGreaterThan(0);
      });

      it('requires bearerAuth', () => {
        expect(pathItem[method].security).toEqual(
          expect.arrayContaining([expect.objectContaining({ bearerAuth: [] })]),
        );
      });

      it('documents the required id path parameter', () => {
        expect(pathItem[method].parameters).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: 'id', in: 'path', required: true }),
          ]),
        );
      });

      it('documents 200 (with a JSON schema), 401 and 404 responses', () => {
        const responses = pathItem[method].responses ?? {};
        expect(responses['200']?.content?.['application/json']?.schema).toBeDefined();
        expect(responses).toHaveProperty('401');
        expect(responses).toHaveProperty('404');
      });
    });
  }

  it('PUT documents a JSON request body and a 400 response', () => {
    const op = pathItem.put;
    expect(op.requestBody?.content?.['application/json']?.schema).toBeDefined();
    expect(op.responses).toHaveProperty('400');
  });
});
