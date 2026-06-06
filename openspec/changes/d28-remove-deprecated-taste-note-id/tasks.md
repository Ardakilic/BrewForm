## 1. Add `deprecations` field to `listRecipes` and `findStarred` return shapes

- [ ] 1.1 Open `apps/api/src/modules/recipe/service.ts` and locate the
  `listRecipes` function (lines 478-601). Add (or update) the explicit
  return type to include the new optional `deprecations` discriminator:

  ```ts
  export interface ListRecipesResult {
    recipes: Awaited<ReturnType<typeof model.findMany>>['recipes'];
    total: number;
    /**
     * Per-request deprecation flags. Populated by the service when the
     * request exercised a deprecated input. Controllers translate these
     * into response headers (e.g., RFC 8594 `Deprecation`). The HTTP layer
     * never reaches into the service to make this decision.
     */
    deprecations?: {
      /**
       * True when the request used the deprecated singular `tasteNoteId`
       * (and not the plural `tasteNoteIds`). See D28.
       */
      tasteNoteId?: boolean;
    };
  }

  export async function listRecipes(
    filters: /* existing type */,
    page: number,
    perPage: number,
    _requestingUserId: string | null,
    isAdmin: boolean,
  ): Promise<ListRecipesResult> {
    // ... existing body ...
  }
  ```

- [ ] 1.2 Open `apps/api/src/modules/recipe/model.ts` and locate
  `findStarred` (after D12 lands, around lines 539-735). Add the same
  optional `deprecations` field to its return shape. Either reuse the
  `ListRecipesResult`-style interface from service (export and import) or
  declare a local `FindStarredResult` interface — whichever matches D12's
  final structure. Note: D28 depends on D12; if D12 is still in flight,
  rebase D28 on top of it before this task.

- [ ] 1.3 Run `make check-api` — must pass with zero new errors.

## 2. Detect the deprecated parameter and emit the `warn` log

- [ ] 2.1 In `apps/api/src/modules/recipe/service.ts:listRecipes`, locate
  the existing `else if (filters.tasteNoteId)` branch at lines 544-551.
  Immediately after the branch's `conditions.push(...)` block (still
  inside the branch), add:

  ```ts
  // Inside listRecipes, after the deprecated-singular conditions.push:
  } else if (filters.tasteNoteId) {
    // Backward compatibility: single taste note filter
    conditions.push(
      inArray(
        recipes.currentVersionId,
        db.select({ id: recipeTasteNotes.recipeVersionId }).from(recipeTasteNotes).where(
          eq(recipeTasteNotes.tasteNoteId, filters.tasteNoteId),
        ),
      ),
    );
    deprecations.tasteNoteId = true;
    log.warn(
      { filter: 'tasteNoteId', userId: _requestingUserId, requestId },
      'Deprecated query parameter used',
    );
  }
  ```

  Declare `const deprecations: NonNullable<ListRecipesResult['deprecations']> = {};`
  near the top of `listRecipes` (alongside the existing `conditions` /
  `where` locals). Obtain `requestId` via the existing logger context if
  available, otherwise via the request's `c.get('requestId')` plumbed
  through — service-layer logging in this module already takes
  `_requestingUserId` as an argument, so add `requestId?: string` as an
  optional argument or read it from the existing log context already on
  `log`.

- [ ] 2.2 In the same function, change the return statement to include the
  `deprecations` field only when at least one flag is set:

  ```ts
  return {
    recipes: result.recipes,
    total: result.total,
    ...(deprecations.tasteNoteId ? { deprecations } : {}),
  };
  ```

- [ ] 2.3 Mirror tasks 2.1 and 2.2 inside
  `apps/api/src/modules/recipe/model.ts:findStarred` (after D12 has landed
  and the `else if (filters.tasteNoteId)` branch exists there). The
  detection logic, the log shape, and the return-shape augmentation are
  identical.

- [ ] 2.4 Run `make check-api` and
  `make test-specific filter=apps/api/src/modules/recipe` — every existing
  test must continue to pass; no new ones yet.

## 3. Extend `paginated()` to accept optional response headers

- [ ] 3.1 Open `apps/api/src/utils/response/index.ts` and update the
  `paginated()` signature to accept an optional `{ headers }` argument.
  Replace the existing definition (lines 30-40) with:

  ```ts
  /** Return a success envelope with pagination metadata and optional response headers. */
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

  Notes:
  - The change is purely additive — every existing
    `paginated(c, data, pagination)` call site works unchanged because the
    new fourth argument is optional.
  - `c.header(name, value)` is the Hono idiom for setting a single response
    header before `c.json()` is called.

- [ ] 3.2 Run `make check-api` — must pass; no other files change yet.

## 4. Update both recipe controllers to set the `Deprecation` header

- [ ] 4.1 Open `apps/api/src/modules/recipe/index.ts` and locate the
  `/recipes` handler at lines 42-55. Update the `return paginated(...)`
  call to pass the optional `{ headers }` argument when the service
  reports the flag:

  ```ts
  const result = await service.listRecipes(
    filters,
    filters.page,
    filters.perPage,
    userId,
    isAdmin,
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
  ```

- [ ] 4.2 Locate the `/recipes/starred` handler at lines 72-82. Apply the
  same change:

  ```ts
  const result = await service.listStarredRecipes(filters, filters.page, filters.perPage, userId);
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
  ```

- [ ] 4.3 If `service.listStarredRecipes` does not currently surface the
  `deprecations` field (because D12 left it implicit), update its return
  shape to propagate the field straight through from `model.findStarred`.

- [ ] 4.4 Run `make check-api` and `make test-api` — must pass.

## 5. Add `@deprecated` JSDoc tag to the schema field

- [ ] 5.1 Open `packages/shared/src/schemas/recipe.ts` and locate lines
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
  tasteNoteId: z.uuid().optional(),
  ```

  Notes:
  - The `@deprecated` tag is the part visible to generated TypeScript and
    OpenAPI consumers.
  - The surrounding prose stays in place so anyone reading the schema file
    has the full context without leaving the source.

- [ ] 5.2 Run `make check` — must pass across all workspaces (the schema
  is consumed by both API and web).

## 6. Update `docs/api.md`

- [ ] 6.1 Open `docs/api.md` and locate line 234:

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

## 7. Add `recipe-filter-deprecation.test.ts`

- [ ] 7.1 Create
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
   * Optionally exercises the controller boundary via Hono's test client to
   * assert the `Deprecation: true` header is present on the response.
   */

  import { describe, it } from 'jsr:@std/testing/bdd';
  import { expect } from 'jsr:@std/expect';
  ```

- [ ] 7.2 Add the four service-level cases. Each constructs the filter,
  invokes `listRecipes` (with a stubbed `model.findMany` returning an
  empty page so the test runs without DB), and asserts the
  `deprecations.tasteNoteId` field on the result. Use the existing mock
  pattern from `service.preservation.test.ts:22-44` for the Drizzle
  surface.

  ```ts
  describe('listRecipes deprecation flag (D28)', () => {
    it('sets deprecations.tasteNoteId when only the singular form is used', async () => {
      const result = await callListRecipes({ tasteNoteId: 'some-uuid' });
      expect(result.deprecations?.tasteNoteId).toBe(true);
    });

    it('does not set deprecations when only the plural form is used', async () => {
      const result = await callListRecipes({ tasteNoteIds: 'a,b' });
      expect(result.deprecations?.tasteNoteId).toBeFalsy();
    });

    it('does not set deprecations when both forms are provided (plural wins)', async () => {
      const result = await callListRecipes({ tasteNoteIds: 'a,b', tasteNoteId: 'c' });
      expect(result.deprecations?.tasteNoteId).toBeFalsy();
    });

    it('does not set deprecations when neither form is provided', async () => {
      const result = await callListRecipes({});
      expect(result.deprecations?.tasteNoteId).toBeFalsy();
    });
  });
  ```

  `callListRecipes(partialFilters)` is a small helper in the same file
  that fills in the schema's defaults (`page: 1`, `perPage: 20`, etc.) and
  invokes `service.listRecipes` with a stubbed model.

- [ ] 7.3 Mirror the same four cases for the starred endpoint via
  `service.listStarredRecipes` (or directly against `model.findStarred`,
  whichever D12 made the public surface). Group into a second `describe`
  block:

  ```ts
  describe('findStarred deprecation flag (D28)', () => {
    it('sets deprecations.tasteNoteId when only the singular form is used', async () => { /* ... */ });
    it('does not set deprecations when only the plural form is used', async () => { /* ... */ });
    it('does not set deprecations when both forms are provided', async () => { /* ... */ });
    it('does not set deprecations when neither form is provided', async () => { /* ... */ });
  });
  ```

- [ ] 7.4 (Optional) Add a controller-level smoke test using Hono's test
  client:

  ```ts
  describe('Deprecation response header (D28)', () => {
    it('sets Deprecation: true on /api/v1/recipes when tasteNoteId is used', async () => {
      const res = await app.request('/api/v1/recipes?tasteNoteId=' + SOME_UUID);
      expect(res.headers.get('Deprecation')).toBe('true');
    });

    it('does not set Deprecation header on /api/v1/recipes when tasteNoteIds is used', async () => {
      const res = await app.request('/api/v1/recipes?tasteNoteIds=' + SOME_UUID);
      expect(res.headers.get('Deprecation')).toBeNull();
    });
  });
  ```

  This block can be skipped if wiring a full controller fixture would
  duplicate too much existing test infrastructure — the four service-level
  cases above are the contract.

- [ ] 7.5 Run
  `make test-specific filter=apps/api/src/modules/recipe/recipe-filter-deprecation.test.ts`
  — every new test must pass.

## 8. Final verification

- [ ] 8.1 Run `make check-api` — zero type errors across all workspaces.
- [ ] 8.2 Run `make lint` — zero warnings on
  `apps/api/src/modules/recipe/service.ts`,
  `apps/api/src/modules/recipe/model.ts`,
  `apps/api/src/modules/recipe/index.ts`,
  `apps/api/src/utils/response/index.ts`,
  `apps/api/src/modules/recipe/recipe-filter-deprecation.test.ts`,
  `packages/shared/src/schemas/recipe.ts`.
- [ ] 8.3 Run `make test-api` — every test in
  `apps/api/src/modules/recipe/*.test.ts` passes, including the new
  deprecation test file. No existing tests regress.
- [ ] 8.4 Manual smoke (optional): with the API running, hit
  `GET /api/v1/recipes?tasteNoteId=<any-uuid>` and confirm the response
  carries `Deprecation: true`. Hit
  `GET /api/v1/recipes?tasteNoteIds=<any-uuid>` and confirm it does not.
- [ ] 8.5 Confirm the phase-2 deprecation removal is left as a separate
  change. Do NOT remove the `tasteNoteId` field, the service / model
  branch, or the docs row in this PR.
