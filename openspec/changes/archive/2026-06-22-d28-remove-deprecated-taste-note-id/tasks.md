## 1. Extend `paginated()` and `cursorPaginated()` with optional `{ headers }` argument

- [x] 1.1 Open `apps/api/src/utils/response/index.ts`. Update the
  `paginated()` function (currently lines 31-40) to accept an optional fourth
  argument `options?: { headers?: Record<string, string> }`. Apply the
  headers via `c.header(name, value)` before `c.json()`:

  ```ts
  /**
   * Return a success envelope with pagination metadata and optional response
   * headers. Shorthand for success() with pagination.
   *
   * @param c - Hono request context.
   * @param data - Items on the current page.
   * @param pagination - Offset pagination metadata.
   * @param options - Optional response headers (e.g., `Deprecation`).
   */
  export function paginated<T>(
    c: Context,
    data: T[],
    pagination: PaginationMeta,
    options?: { headers?: Record<string, string> },
  ) {
    if (options?.headers) {
      for (const [name, value] of Object.entries(options.headers)) {
        c.header(name, value);
      }
    }
    return c.json({
      success: true as const,
      data,
      meta: {
        requestId: c.get('requestId'),
        pagination,
      },
    }, 200);
  }
  ```

- [x] 1.2 Update `cursorPaginated()` (currently lines 52-61) with the same
  optional `options` argument and the same header-application loop:

  ```ts
  /**
   * Return a success envelope with cursor-pagination metadata and optional
   * response headers.
   *
   * Use this for cursor-based list endpoints. The response shape is
   * `{ success: true, data, meta: { requestId, cursor: { nextCursor, hasMore, total? } } }`.
   *
   * @param c - Hono request context.
   * @param data - Items on the current page.
   * @param cursorMeta - Cursor pagination metadata.
   * @param options - Optional response headers (e.g., `Deprecation`).
   */
  export function cursorPaginated<T>(
    c: Context,
    data: T[],
    cursorMeta: CursorPaginationMeta,
    options?: { headers?: Record<string, string> },
  ) {
    if (options?.headers) {
      for (const [name, value] of Object.entries(options.headers)) {
        c.header(name, value);
      }
    }
    return c.json({
      success: true as const,
      data,
      meta: {
        requestId: c.get('requestId'),
        cursor: cursorMeta,
      },
    }, 200);
  }
  ```

- [x] 1.3 Run `make check-api` — must pass with zero new errors. The change
  is purely additive; no existing call site needs to change.

## 2. Add `deprecations` detection and `warn` log to `listRecipes`

- [x] 2.1 Open `apps/api/src/modules/recipe/service.ts`. Locate the
  `listRecipes` function (lines 492-568). Add `requestId?: string` as a new
  optional sixth parameter:

  ```ts
  export async function listRecipes(
    filters: z.infer<typeof RecipeFilterSchema>,
    page: number,
    perPage: number,
    _requestingUserId: string | null = null,
    isAdmin: boolean = false,
    requestId?: string,
  ) {
  ```

- [x] 2.2 Inside `listRecipes`, after the `where` is assembled (line 504)
  and before the cursor/offset branching, add the deprecation detection:

  ```ts
  const deprecations: { tasteNoteId?: boolean } = {};
  if (!filters.tasteNoteIds && filters.tasteNoteId) {
    deprecations.tasteNoteId = true;
    logger.warn(
      { filter: 'tasteNoteId', userId: _requestingUserId, requestId },
      'Deprecated query parameter used',
    );
  }
  ```

- [x] 2.3 Update **every return statement** in `listRecipes` to spread the
  `deprecations` field when the flag is set. There are multiple return paths:
  - Line 528 (cursor fallback to offset when `sortBy !== 'createdAt'`):
    `return { ...result, ...(deprecations.tasteNoteId ? { deprecations } : {}) };`
  - Line 559 (cursor success path): same spread
  - Line 567 (offset path): same spread

  Use a local helper to avoid repeating the conditional spread:
  ```ts
  const withDeprecations = <T>(result: T): T & { deprecations?: { tasteNoteId?: boolean } } =>
    deprecations.tasteNoteId ? { ...result, deprecations } : result;
  ```
  Then `return withDeprecations(result);` on each path.

- [x] 2.4 Run `make check-api` — must pass. The `logger.warn` call uses the
  existing `logger` at `service.ts:63` (`createLogger('recipe-service')`).

## 3. Add `deprecations` detection and `warn` log to `listStarredRecipes`

- [x] 3.1 Open `apps/api/src/modules/recipe/service.ts`. Locate
  `listStarredRecipes` (lines 583-596). Add `requestId?: string` as a new
  optional fifth parameter:

  ```ts
  export async function listStarredRecipes(
    filters: z.infer<typeof RecipeFilterSchema>,
    page: number,
    perPage: number,
    userId: string,
    requestId?: string,
  ) {
  ```

- [x] 3.2 Inside `listStarredRecipes`, before the call to
  `model.findStarred`, add the deprecation detection (same logic as
  `listRecipes`):

  ```ts
  const deprecations: { tasteNoteId?: boolean } = {};
  if (!filters.tasteNoteIds && filters.tasteNoteId) {
    deprecations.tasteNoteId = true;
    logger.warn(
      { filter: 'tasteNoteId', userId, requestId },
      'Deprecated query parameter used',
    );
  }
  ```

- [x] 3.3 Update the return statement (currently `return result;` at line
  595) to spread the `deprecations` field:

  ```ts
  return {
    ...result,
    ...(deprecations.tasteNoteId ? { deprecations } : {}),
  };
  ```

- [x] 3.4 Run `make check-api` and
  `make test-specific filter=apps/api/src/modules/recipe` — every existing
  test must continue to pass; no new ones yet.

## 4. Update the `/recipes` controller to pass `requestId` and set the `Deprecation` header

- [x] 4.1 Open `apps/api/src/modules/recipe/index.ts`. Locate the `/recipes`
  handler (lines 73-107). Inside the handler, read `requestId` from the
  context and pass it to `listRecipes`:

  ```ts
  async (c) => {
    const filters = c.req.valid('query');
    const userId = c.get('userId') ?? null;
    const isAdmin = c.get('user')?.isAdmin ?? false;
    const requestId = c.get('requestId');
    try {
      const result = await service.listRecipes(
        filters,
        filters.page,
        filters.perPage,
        userId,
        isAdmin,
        requestId,
      );

      const depHeaders = result.deprecations?.tasteNoteId === true
        ? { headers: { Deprecation: 'true' } }
        : undefined;

      if ('hasMore' in result) {
        return cursorPaginated(
          c,
          result.recipes,
          {
            nextCursor: result.nextCursor,
            hasMore: result.hasMore,
            total: result.total,
          },
          depHeaders,
        );
      }

      return paginated(
        c,
        result.recipes,
        {
          page: filters.page,
          perPage: filters.perPage,
          total: result.total,
          totalPages: Math.ceil(result.total / filters.perPage),
        },
        depHeaders,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'VALIDATION_ERROR: INVALID_CURSOR') {
        return invalidCursor(c);
      }
      throw err;
    }
  },
  ```

  **Critical:** `depHeaders` is passed to **both** the `cursorPaginated` and
  `paginated` branches. Extending only `paginated` would silently drop the
  header in cursor mode.

- [x] 4.2 Run `make check-api` — must pass.

## 5. Update the `/recipes/starred` controller

- [x] 5.1 Locate the `/starred` handler (lines 124-134). Apply the same
  pattern — read `requestId`, pass to `listStarredRecipes`, check flag,
  pass headers to `paginated`:

  ```ts
  async (c) => {
    const userId = c.get('userId') as string;
    const filters = c.req.valid('query');
    const requestId = c.get('requestId');
    const result = await service.listStarredRecipes(
      filters,
      filters.page,
      filters.perPage,
      userId,
      requestId,
    );
    return paginated(
      c,
      result.recipes,
      {
        page: filters.page,
        perPage: filters.perPage,
        total: result.total,
        totalPages: Math.ceil(result.total / filters.perPage),
      },
      result.deprecations?.tasteNoteId === true
        ? { headers: { Deprecation: 'true' } }
        : undefined,
    );
  },
  ```

- [x] 5.2 Run `make check-api` — must pass.

## 6. Update `describeRoute` OpenAPI metadata on both routes

- [x] 6.1 In the `/recipes` `describeRoute` (lines 37-70), add
  `tasteNoteId` (with `deprecated: true`) and `tasteNoteIds` to the
  `parameters` array (currently lines 42-49, which only lists 6 params).
  Insert after the existing `includeTotal` entry:

  ```ts
  parameters: [
    { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
    { name: 'perPage', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
    { name: 'sortBy', in: 'query', required: false, schema: { type: 'string' } },
    { name: 'sortOrder', in: 'query', required: false, schema: { type: 'string' } },
    { name: 'cursor', in: 'query', required: false, schema: { type: 'string' } },
    { name: 'includeTotal', in: 'query', required: false, schema: { type: 'boolean' } },
    {
      name: 'tasteNoteId',
      in: 'query',
      required: false,
      deprecated: true,
      description: 'Deprecated. Use tasteNoteIds instead. See D28.',
      schema: { type: 'string', format: 'uuid' },
    },
    {
      name: 'tasteNoteIds',
      in: 'query',
      required: false,
      description: 'Comma-separated taste note UUIDs (AND logic, max 10)',
      schema: { type: 'string' },
    },
  ],
  ```

- [x] 6.2 In the `/recipes` `describeRoute` `200` response (lines 50-64),
  add a `headers` field declaring the `Deprecation` header:

  ```ts
  200: {
    description:
      'Paginated list of recipes. Returns `meta.cursor` when cursor pagination is active, or `meta.pagination` when offset pagination is active.',
    headers: {
      Deprecation: {
        schema: { type: 'string' },
        description:
          'Present (value "true") when the deprecated tasteNoteId parameter is used. See RFC 8594.',
      },
    },
    content: {
      'application/json': {
        schema: resolver(
          z.union([
            cursorEnvelope(FeedRecipeOutputSchema),
            paginatedEnvelope(FeedRecipeOutputSchema),
          ]),
        ),
      },
    },
  },
  ```

- [x] 6.3 In the `/starred` `describeRoute` (lines 112-121), add the same
  `tasteNoteId` (deprecated) and `tasteNoteIds` parameter entries and the
  same `Deprecation` header declaration on the `200` response. Also add a
  typed `200` response schema (currently it's just a description string):

  ```ts
  describeRoute({
    tags: ['Recipes'],
    summary: 'List starred (favourited) recipes',
    description: 'Paginated, filterable list of recipes the current user has starred.',
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
      { name: 'perPage', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
      { name: 'sortBy', in: 'query', required: false, schema: { type: 'string' } },
      { name: 'sortOrder', in: 'query', required: false, schema: { type: 'string' } },
      {
        name: 'tasteNoteId',
        in: 'query',
        required: false,
        deprecated: true,
        description: 'Deprecated. Use tasteNoteIds instead. See D28.',
        schema: { type: 'string', format: 'uuid' },
      },
      {
        name: 'tasteNoteIds',
        in: 'query',
        required: false,
        description: 'Comma-separated taste note UUIDs (AND logic, max 10)',
        schema: { type: 'string' },
      },
    ],
    responses: {
      200: {
        description: 'Paginated list of starred recipes',
        headers: {
          Deprecation: {
            schema: { type: 'string' },
            description:
              'Present (value "true") when the deprecated tasteNoteId parameter is used. See RFC 8594.',
          },
        },
        content: {
          'application/json': {
            schema: resolver(paginatedEnvelope(FeedRecipeOutputSchema)),
          },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  ```

  Note: The `/starred` route currently has a thin `200` response (just a
  description). D28 upgrades it to a typed response with the
  `paginatedEnvelope(FeedRecipeOutputSchema)` schema and an `ErrorEnvelopeSchema`
  for `401` (it already declares `security` but the `401` response is
  untyped — AGENTS.md mandates `resolver(ErrorEnvelopeSchema)` for every
  documented error on auth-guarded routes).

- [x] 6.4 Run `make check-api` — must pass. Run
  `make test-specific filter=apps/api/src/routes/openapi.coverage.test.ts`
  — the coverage test should continue to pass (it does not inspect response
  headers, and `/api/v1/recipes` is not in `IN_SCOPE_BASE_PATHS`).

## 7. Add `@deprecated` JSDoc tag and `.meta({ deprecated: true })` to the schema field

- [x] 7.1 Open `packages/shared/src/schemas/recipe.ts` and locate lines
  134-135:

  ```ts
  // Keep tasteNoteId for backward compatibility (deprecated)
  tasteNoteId: z.uuid().optional(),
  ```

  Replace with:

  ```ts
  /**
   * Deprecated single-taste-note UUID filter. Use the plural `tasteNoteIds`
   * (comma-separated, AND logic, max 10) instead. The API still applies this
   * filter when set, but every response emits an RFC 8594 `Deprecation: true`
   * header and a `warn` log line. Tracked by OpenSpec change
   * `d28-remove-deprecated-taste-note-id`; the field itself will be removed
   * in a follow-up change (D29 or later) once production telemetry confirms
   * no significant callers remain.
   *
   * @deprecated Use `tasteNoteIds` instead. See D28.
   */
  tasteNoteId: z.uuid().optional().meta({ deprecated: true }),
  ```

  Notes:
  - The `@deprecated` tag is the part visible to the TypeScript language
    server (editor strikethrough).
  - The `.meta({ deprecated: true })` is read by `zod-openapi` v5 (pulled in
    by `hono-openapi`) during OpenAPI generation, making the deprecation
    visible in the generated OpenAPI spec.
  - The codebase uses Zod v4.4.3; `.meta()` is available on all Zod schemas.

- [x] 7.2 Run `make check` — must pass across all workspaces (the schema
  is consumed by both API and web).

## 8. Update `docs/api.md`

- [x] 8.1 Open `docs/api.md` and locate line 234:

  ```
  | `tasteNoteId`  | —             | Single taste note UUID (deprecated, use tasteNoteIds)  |
  ```

  Replace with:

  ```
  | `tasteNoteId`  | —             | Single taste note UUID (**deprecated**, use `tasteNoteIds`). Responses include a `Deprecation: true` header (RFC 8594). Will be removed in a future release — see [`openspec/changes/d28-remove-deprecated-taste-note-id/`](../openspec/changes/d28-remove-deprecated-taste-note-id/proposal.md). |
  ```

  Notes:
  - The link is relative from `docs/api.md` to the OpenSpec change folder.
  - Keep the column widths approximately as the rest of the table; if the
    table renderer enforces an alignment, allow the row to wrap or extend
    the column width consistently.

## 9. Add `recipe-filter-deprecation.test.ts`

- [x] 9.1 Create
  `apps/api/src/modules/recipe/recipe-filter-deprecation.test.ts` with
  the standard header (matching the convention from
  `apps/api/src/modules/recipe/service.preservation.test.ts`):

  ```ts
  // deno-lint-ignore-file no-explicit-any require-await

  /**
   * Tests for the D28 deprecation signal on the recipe filter.
   *
   * Asserts that:
   *  - `tasteNoteId` (singular) only → `deprecations.tasteNoteId === true`
   *  - `tasteNoteIds` (plural) only → no flag
   *  - Both set (plural wins per the existing `else if`) → no flag
   *  - Neither set → no flag
   *
   * Also exercises the controller boundary via Hono's `app.request(...)` to
   * assert the `Deprecation: true` header is present on the response (both
   * offset and cursor modes).
   */

  import { describe, it } from 'jsr:@std/testing/bdd';
  import { expect } from 'jsr:@std/expect';
  ```

- [x] 9.2 Add the four service-level cases for `listRecipes`. Use the mock
  pattern from `service.preservation.test.ts` (hand-rolled Drizzle-like
  stubs + mock `model.findMany` that captures the WHERE clause). Since
  `listRecipes` calls `model.buildListRecipesWhere` (which calls
  `buildRecipeFilters`), and the real `buildRecipeFilters` imports from
  `@brewform/db`, the test must either:
  - Use a real DB (integration test pattern with
    `import '../../test-setup.ts';` and `sanitizeResources: false,
    sanitizeOps: false`), OR
  - Stub the service's internal `model` import (not feasible in Deno without
    injection), OR
  - Call the real `service.listRecipes` against a real test DB.

  **Recommended approach:** Use the integration-test pattern (real DB via
  Docker, `make test-specific` runs inside Docker with `postgres` up).
  Import `test-setup.ts`, create a test user and test recipe with taste
  notes, then call `service.listRecipes` with various filter combinations
  and assert on `result.deprecations?.tasteNoteId`.

  ```ts
  import '../../test-setup.ts';
  import { describe, it } from 'jsr:@std/testing/bdd';
  import { expect } from 'jsr:@std/expect';
  import * as service from './service.ts';
  import { db } from '@brewform/db';
  // ... test helpers for creating users/recipes/taste notes ...

  describe('listRecipes deprecation flag (D28)', () => {
    it('sets deprecations.tasteNoteId when only the singular form is used', async () => {
      const result = await service.listRecipes(
        { tasteNoteId: 'some-uuid', page: 1, perPage: 20, sortBy: 'createdAt', sortOrder: 'desc' } as any,
        1, 20, null, false, 'test-request-id',
      );
      expect(result.deprecations?.tasteNoteId).toBe(true);
    });

    it('does not set deprecations when only the plural form is used', async () => {
      const result = await service.listRecipes(
        { tasteNoteIds: 'a,b', page: 1, perPage: 20, sortBy: 'createdAt', sortOrder: 'desc' } as any,
        1, 20, null, false, 'test-request-id',
      );
      expect(result.deprecations?.tasteNoteId).toBeFalsy();
    });

    it('does not set deprecations when both forms are provided (plural wins)', async () => {
      const result = await service.listRecipes(
        { tasteNoteIds: 'a,b', tasteNoteId: 'c', page: 1, perPage: 20, sortBy: 'createdAt', sortOrder: 'desc' } as any,
        1, 20, null, false, 'test-request-id',
      );
      expect(result.deprecations?.tasteNoteId).toBeFalsy();
    });

    it('does not set deprecations when neither form is provided', async () => {
      const result = await service.listRecipes(
        { page: 1, perPage: 20, sortBy: 'createdAt', sortOrder: 'desc' } as any,
        1, 20, null, false, 'test-request-id',
      );
      expect(result.deprecations?.tasteNoteId).toBeFalsy();
    });
  });
  ```

  Note: The test calls the **real** `service.listRecipes` (not an inline
  copy), so it exercises the real deprecation detection. The `filters`
  argument is cast `as any` to avoid constructing a full
  `RecipeFilterSchema`-valid object in each test — the service accepts
  `z.infer<typeof RecipeFilterSchema>` but the deprecation check
  (`!filters.tasteNoteIds && filters.tasteNoteId`) runs before any DB
  query, so even if the DB returns empty results the flag is still set.

- [x] 9.3 Mirror the same four cases for `listStarredRecipes`:

  ```ts
  describe('listStarredRecipes deprecation flag (D28)', () => {
    it('sets deprecations.tasteNoteId when only the singular form is used', async () => {
      const result = await service.listStarredRecipes(
        { tasteNoteId: 'some-uuid', page: 1, perPage: 20, sortBy: 'createdAt', sortOrder: 'desc' } as any,
        1, 20, 'test-user-id', 'test-request-id',
      );
      expect(result.deprecations?.tasteNoteId).toBe(true);
    });
    // ... same three more cases ...
  });
  ```

- [x] 9.4 Add a controller-level integration test using Hono's
  `app.request(...)` (following the pattern from
  `apps/api/src/modules/recipe/index_test.ts` — no `hono/testing` import;
  use a stub middleware that sets `requestId` / `userId` on context):

  ```ts
  import { Hono } from 'hono';
  import type { AppEnv } from '../../types/hono.ts';
  import recipeRouter from './index.ts';

  function createTestApp() {
    const app = new Hono<AppEnv>();
    app.use('*', async (c, next) => {
      c.set('requestId', crypto.randomUUID());
      c.set('userId', null); // anonymous for /recipes (optionalAuth)
      await next();
    });
    app.route('/api/v1/recipes', recipeRouter);
    return app;
  }

  describe('Deprecation response header (D28)', () => {
    it('sets Deprecation: true on /api/v1/recipes when tasteNoteId is used', async () => {
      const app = createTestApp();
      const res = await app.request('/api/v1/recipes?tasteNoteId=00000000-0000-0000-0000-000000000001');
      expect(res.status).toBe(200);
      expect(res.headers.get('Deprecation')).toBe('true');
    });

    it('does not set Deprecation header when tasteNoteIds is used', async () => {
      const app = createTestApp();
      const res = await app.request('/api/v1/recipes?tasteNoteIds=00000000-0000-0000-0000-000000000001');
      expect(res.status).toBe(200);
      expect(res.headers.get('Deprecation')).toBeNull();
    });

    it('sets Deprecation: true in cursor mode when tasteNoteId is used', async () => {
      const app = createTestApp();
      const res = await app.request(
        '/api/v1/recipes?tasteNoteId=00000000-0000-0000-0000-000000000001&cursor=invalid&sortBy=createdAt',
      );
      // Even if the cursor is invalid (400), the header should not be set
      // in the error path. Use a valid scenario or assert on 200 path only.
      // Adjust based on whether the invalid-cursor error path should
      // include the header (it should NOT — the deprecation detection
      // happens before the cursor is decoded, but the error response goes
      // through `invalidCursor(c)` which does not pass headers).
      expect(res.headers.get('Deprecation')).toBeNull(); // error path, no header
    });
  });
  ```

  Note: The cursor-mode test is tricky because an invalid cursor returns
  a 400 error (via `invalidCursor(c)`) which does not pass the `depHeaders`.
  The `deprecations` flag is computed in the service **before** the cursor
  is decoded, but the error response short-circuits the `paginated`/
  `cursorPaginated` call. The test should use a valid cursor scenario or
  assert that the 400 error path does NOT include the header (which is the
  correct behaviour — the error response is not the deprecated query's
  "success" response). Adjust the assertion based on what makes sense.

- [x] 9.5 Run
  `make test-specific filter=apps/api/src/modules/recipe/recipe-filter-deprecation.test.ts`
  — every new test must pass.

## 10. Extend `response.test.ts` with header-option tests

- [x] 10.1 Open `apps/api/src/utils/response/response.test.ts`. Add tests
  asserting that `paginated()` and `cursorPaginated()` with the `{ headers }`
  option correctly set the header on the response. Use the existing test
  pattern in this file (construct a mock `Context` or a minimal Hono app):

  ```ts
  describe('paginated with headers option (D28)', () => {
    it('sets response headers when options.headers is provided', () => {
      // Use a minimal Hono app or mock context
      const app = new Hono();
      app.get('/test', (c) =>
        paginated(c, [], { page: 1, perPage: 20, total: 0, totalPages: 0 }, {
          headers: { Deprecation: 'true' },
        }),
      );
      const res = await app.request('/test');
      expect(res.headers.get('Deprecation')).toBe('true');
    });

    it('does not set headers when options is not provided', () => {
      const app = new Hono();
      app.get('/test', (c) =>
        paginated(c, [], { page: 1, perPage: 20, total: 0, totalPages: 0 }),
      );
      const res = await app.request('/test');
      expect(res.headers.get('Deprecation')).toBeNull();
    });
  });

  describe('cursorPaginated with headers option (D28)', () => {
    it('sets response headers when options.headers is provided', () => {
      const app = new Hono();
      app.get('/test', (c) =>
        cursorPaginated(c, [], { nextCursor: null, hasMore: false }, {
          headers: { Deprecation: 'true' },
        }),
      );
      const res = await app.request('/test');
      expect(res.headers.get('Deprecation')).toBe('true');
    });
  });
  ```

  Note: The existing `response.test.ts` tests (lines 51-60) use a minimal
  Hono app pattern. Follow the same approach. The `CursorPaginationMeta`
  type requires `nextCursor` and `hasMore`; `total` is optional.

- [x] 10.2 Run
  `make test-specific filter=apps/api/src/utils/response/response.test.ts`
  — must pass.

## 11. Final verification

- [x] 11.1 Run `make check-api` — zero type errors across all workspaces.
- [x] 11.2 Run `make lint` — zero warnings on:
  - `apps/api/src/utils/response/index.ts`
  - `apps/api/src/modules/recipe/service.ts`
  - `apps/api/src/modules/recipe/index.ts`
  - `apps/api/src/modules/recipe/recipe-filter-deprecation.test.ts`
  - `apps/api/src/utils/response/response.test.ts`
  - `packages/shared/src/schemas/recipe.ts`
- [x] 11.3 Run `make test-api` — every test in
  `apps/api/src/modules/recipe/*.test.ts` and
  `apps/api/src/utils/response/response.test.ts` passes, including the new
  deprecation test file. No existing tests regress.
- [x] 11.4 Run
  `make test-specific filter=apps/api/src/routes/openapi.coverage.test.ts`
  — the OpenAPI coverage test continues to pass.
- [x] 11.5 Manual smoke (optional): with the API running, hit
  `GET /api/v1/recipes?tasteNoteId=<any-uuid>` and confirm the response
  carries `Deprecation: true`. Hit
  `GET /api/v1/recipes?tasteNoteIds=<any-uuid>` and confirm it does not.
  Hit `GET /api/v1/recipes/openapi.json` and confirm the `tasteNoteId`
  parameter is listed with `deprecated: true`.
- [x] 11.6 Confirm the Phase 2 deprecation removal is left as a separate
  change. Do NOT remove the `tasteNoteId` field, the `buildRecipeFilters`
  branch, or the docs row in this PR.