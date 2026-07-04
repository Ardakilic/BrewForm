# D28 — Remove Deprecated tasteNoteId (Singular) Query Parameter

> **Status (2026-07-04): ✅ Done** — `Deprecation` header at `index.ts:81/122/191/231`; `deprecations` flag at `service.ts:442`; test present.

## Severity

**Low** (no behaviour change; the field still works and continues to filter as before)

## Phase

**Phase 1 of 2: deprecation messaging only.** Phase 2 (field removal) is a follow-up plan (D29 or later).

This matches the pattern set by D27 (cursor pagination), which kept the legacy
`page` parameter working for backward compatibility and deferred its removal to
a separate plan rather than bundling the breakage into the same PR.

## Issue Description

The recipe filter schema at `packages/shared/src/schemas/recipe.ts:134-135`
exposes a singular `tasteNoteId` query parameter alongside the canonical plural
`tasteNoteIds` (comma-separated). The singular form is annotated as deprecated
in a code comment (`// Keep tasteNoteId for backward compatibility (deprecated)`)
but the deprecation lives only in the source — nothing about the runtime
behaviour signals to the caller that the parameter is on the way out.

D12 (recipe-filter-logic, merged and archived at
`openspec/changes/archive/2026-06-06-d12-recipe-filter-logic/`) extracted the
shared filter-building helper `buildRecipeFilters` into
`apps/api/src/modules/recipe/model.ts:83-179` and closed the parity gap between
`listRecipes` and `findStarred`. Both listing endpoints now honour the deprecated
singular parameter via the same `else if (filters.tasteNoteId)` branch inside
`buildRecipeFilters` at `model.ts:167-176`. The `RecipeFilterCriteria` interface
at `model.ts:67-77` already carries a JSDoc `@deprecated` tag on its `tasteNoteId`
field (line 73). However, the public Zod schema in `packages/shared` — the one
that drives OpenAPI generation and the TypeScript types seen by API consumers —
has only an inline `//` comment, not a `@deprecated` JSDoc tag or Zod `.meta()`
metadata. D12's `design.md` explicitly deferred the deprecation cycle:
_"No removal of the deprecated `tasteNoteId` — that's a separate API
deprecation cycle."_ D28 is that cycle.

D28 introduces the missing runtime signals: a standards-aligned HTTP response
header (`Deprecation: true` per RFC 8594) and a structured `warn` log line. Both
are emitted only when the deprecated singular parameter is the one actually
used (i.e., when `tasteNoteId` is set and `tasteNoteIds` is not). When both are
present the plural takes precedence (matching the `else if` branch in
`buildRecipeFilters`), so no signal is emitted in that case either.

The frontend has been audited and never sends the singular form — only
`tasteNoteIds` is used across `apps/web/src/components/recipe-list/useRecipeFilters.ts`,
`RecipeListView.tsx`, `RecipeCreatePage.tsx`, `RecipeEditPage.tsx`,
`TasteNotesPage.tsx`, and `TastingNotesSection.tsx`. (The singular `tasteNoteId`
that appears in `TastingNotesSection.tsx` and `radar-chart-data.ts` is a property
on the `TasteNote` domain object, not a filter query parameter.) Any usage of the
singular form as a filter parameter therefore comes from third-party API clients,
and the only way to find out how many such clients exist (and when removal becomes
safe) is to emit deprecation telemetry in production. D12 deferred this work;
D28 fills the gap.

## Impact

- Clients using the singular `tasteNoteId` parameter today get no feedback that
  it is deprecated — there is no header, no warning, nothing in the response
  envelope.
- Operations cannot estimate when removing the field is safe because no
  production signal exists to count or attribute callers.
- Documentation drifts away from runtime behaviour: `docs/api.md:234` says
  _"deprecated, use tasteNoteIds"_ but the API itself produces no observable
  indication of that status.
- The schema's deprecation comment at
  `packages/shared/src/schemas/recipe.ts:134` is invisible to consumers who
  rely on generated OpenAPI / TypeScript types because there is no `@deprecated`
  JSDoc tag and no Zod `.meta({ deprecated: true })` metadata attached to the
  field.
- The `/recipes` route's `describeRoute` at `index.ts:42-49` does not document
  `tasteNoteId` (or `tasteNoteIds`) as a query parameter in its `parameters`
  array — the deprecated parameter is invisible in the generated OpenAPI spec.

## Affected Files

| File | Lines (current) | Change type |
| --- | --- | --- |
| `apps/api/src/utils/response/index.ts` | 31-40, 52-61 | Extend `paginated()` and `cursorPaginated()` to accept optional `{ headers }` arg |
| `apps/api/src/modules/recipe/model.ts` | 155-176 | Add `deprecations` field to `buildRecipeFilters` return or add a sibling detection function |
| `apps/api/src/modules/recipe/model.ts` | 853-903 | Update `findStarred` return shape to carry `deprecations` |
| `apps/api/src/modules/recipe/model.ts` | 855-866 | Replace inline anonymous filter type with `RecipeFilterCriteria` (+ `sortBy`/`sortOrder`) |
| `apps/api/src/modules/recipe/service.ts` | 492-568 | Add `deprecations` to `listRecipes` return; emit `warn` log; accept `requestId` param |
| `apps/api/src/modules/recipe/service.ts` | 583-596 | Propagate `deprecations` through `listStarredRecipes`; accept `requestId` param |
| `apps/api/src/modules/recipe/index.ts` | 73-107 | `/recipes` controller: pass `requestId`, check flag, set `Deprecation` header on both cursor and offset branches |
| `apps/api/src/modules/recipe/index.ts` | 124-134 | `/starred` controller: pass `requestId`, check flag, set `Deprecation` header |
| `apps/api/src/modules/recipe/index.ts` | 37-70 | `/recipes` `describeRoute`: add `tasteNoteId`/`tasteNoteIds` to `parameters` with `deprecated: true` on singular |
| `apps/api/src/modules/recipe/index.ts` | 112-121 | `/starred` `describeRoute`: add `tasteNoteId`/`tasteNoteIds` to `parameters` with `deprecated: true` on singular |
| `packages/shared/src/schemas/recipe.ts` | 134-135 | Add JSDoc `@deprecated` tag + `.meta({ deprecated: true })` for OpenAPI |
| `docs/api.md` | 234 | Add "Will be removed in a future release" note + OpenSpec link |
| `apps/api/src/modules/recipe/recipe-filter-deprecation.test.ts` | new | New test file covering deprecation detection + header emission |
| `apps/api/src/utils/response/response.test.ts` | 51-60 | Add test for `paginated` / `cursorPaginated` with `headers` option |

## Fix Approach

Emit two complementary deprecation signals whenever the singular `tasteNoteId`
is the parameter that actually drove the query (i.e., it is present **and**
`tasteNoteIds` is absent):

1. **HTTP response header** — `Deprecation: true` per [RFC 8594](https://www.rfc-editor.org/rfc/rfc8594).
   No `Sunset` date is set in Phase 1 (a sunset date implies a removal
   commitment; that decision belongs to Phase 2 / D29+).
2. **Structured `warn` log line** — JSON-shaped pino entry with the bare
   minimum traceable context (`filter`, `userId`, `requestId`) so operations
   can count and attribute usage without logging any PII or payload data.

The signal is purely additive: clients that do not inspect response headers
are unaffected, and the query continues to filter exactly as before.

## Technical Approach

### Detection site — service layer, not `buildRecipeFilters`

D12 moved the `else if (filters.tasteNoteId)` branch into
`buildRecipeFilters` (`model.ts:167-176`). That function is a pure
data-access helper that returns `SQL[]` and has no logger — adding a `warn`
log there would violate the layering (model.ts lines 2-4 declare it a pure
Drizzle layer). Instead, the deprecation detection lives in the **service**
layer (`listRecipes` and `listStarredRecipes`), where:

- The `logger` is already instantiated (`createLogger('recipe-service')` at
  `service.ts:63`).
- The precedence check (`!filters.tasteNoteIds && filters.tasteNoteId`) is a
  single boolean expression — trivially expressible at the call site without
  duplicating the `else if` branch's SQL logic.
- The result is surfaced to the controller via an optional `deprecations`
  field on the return shape.

### Return shape — union-aware

`listRecipes` currently returns a **union** of two shapes:
- Offset mode: `{ recipes, total }` (from `model.findMany`)
- Cursor mode: `{ recipes, hasMore, nextCursor, total? }` (from `model.findCursor`)

The `deprecations` field is added as an optional property on **both** branches.
No explicit `ListRecipesResult` interface is introduced (the current code has
no explicit return type annotation; adding one is out of scope for D28).
Instead, the service spreads `deprecations` into both return statements.

### `requestId` plumbing

`requestId` is available on the Hono context (`c.get('requestId')`) but the
service layer has no access to it. D28 adds an optional `requestId?: string`
parameter to both `listRecipes` and `listStarredRecipes`, passed from the
controller. The `warn` log shape is `{ filter: 'tasteNoteId', userId, requestId }`.

### `paginated()` and `cursorPaginated()` extension

Both response helpers are extended with an optional 4th argument:
`options?: { headers?: Record<string, string> }`. The headers are applied via
`c.header(name, value)` before `c.json()`. This is purely additive — all
existing call sites work unchanged.

The `/recipes` controller has a **two-branch return** (cursor mode at
`index.ts:87` via `cursorPaginated`, offset mode at `index.ts:94` via
`paginated`). Both branches must check the `deprecations` flag and pass the
`Deprecation` header — otherwise the header is silently dropped in cursor
mode.

### OpenAPI metadata

AGENTS.md mandates: _"Every new route (or change to a route's request/response
shape) MUST include OpenAPI metadata."_ Adding a `Deprecation` response header
changes the response shape. The `describeRoute` on both routes must:

1. Add `tasteNoteId` and `tasteNoteIds` to the `parameters` array (currently
   undocumented). The `tasteNoteId` parameter entry includes
   `deprecated: true`.
2. Declare the `Deprecation` header on the `200` response via
   `headers: { Deprecation: { schema: { type: 'string' } } }`.

### Schema annotation — Zod `.meta()` + JSDoc

The codebase uses **Zod v4** (`zod@4.4.3`). Zod v4's `.meta()` method stores
metadata in the `globalRegistry`, which `zod-openapi` v5 (pulled in by
`hono-openapi`) reads during OpenAPI generation. Adding
`.meta({ deprecated: true })` to the `tasteNoteId` field makes the
deprecation visible in generated OpenAPI types. A JSDoc `@deprecated` tag is
also added for TypeScript consumers (editor strikethrough).

## Proposed Code Sketches

### 1. Service-layer detection + log

```ts
// apps/api/src/modules/recipe/service.ts — inside listRecipes
export async function listRecipes(
  filters: z.infer<typeof RecipeFilterSchema>,
  page: number,
  perPage: number,
  _requestingUserId: string | null = null,
  isAdmin: boolean = false,
  requestId?: string,
) {
  // ... existing body up to the where/filter assembly ...

  const deprecations: { tasteNoteId?: boolean } = {};
  if (!filters.tasteNoteIds && filters.tasteNoteId) {
    deprecations.tasteNoteId = true;
    logger.warn(
      { filter: 'tasteNoteId', userId: _requestingUserId, requestId },
      'Deprecated query parameter used',
    );
  }

  // ... existing cursor/offset branching ...

  // On each return path, spread deprecations:
  if (filters.cursor && sortBy === 'createdAt') {
    // ... cursor path ...
    return { ...result, ...(deprecations.tasteNoteId ? { deprecations } : {}) };
  }
  // ... offset path ...
  return { ...result, ...(deprecations.tasteNoteId ? { deprecations } : {}) };
}
```

The same pattern applies to `listStarredRecipes`, which propagates
`model.findStarred`'s result. The `deprecations` field is computed in the
service (not in `model.findStarred`) so the model layer stays side-effect-free.

### 2. Extended `paginated()` and `cursorPaginated()` helpers

```ts
// apps/api/src/utils/response/index.ts
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
    meta: { requestId: c.get('requestId'), pagination },
  }, 200);
}

/** Return a success envelope with cursor-pagination metadata and optional response headers. */
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
    meta: { requestId: c.get('requestId'), cursor: cursorMeta },
  }, 200);
}
```

### 3. Controller — `/recipes` (both cursor and offset branches)

```ts
// apps/api/src/modules/recipe/index.ts — handler at lines 73-107
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
      return cursorPaginated(c, result.recipes, {
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
        total: result.total,
      }, depHeaders);
    }

    return paginated(c, result.recipes, {
      page: filters.page,
      perPage: filters.perPage,
      total: result.total,
      totalPages: Math.ceil(result.total / filters.perPage),
    }, depHeaders);
  } catch (err) {
    // ... existing error handling ...
  }
},
```

### 4. Controller — `/recipes/starred`

```ts
// apps/api/src/modules/recipe/index.ts — handler at lines 124-134
async (c) => {
  const userId = c.get('userId') as string;
  const filters = c.req.valid('query');
  const requestId = c.get('requestId');
  const result = await service.listStarredRecipes(filters, filters.page, filters.perPage, userId, requestId);
  return paginated(c, result.recipes, {
    page: filters.page,
    perPage: filters.perPage,
    total: result.total,
    totalPages: Math.ceil(result.total / filters.perPage),
  }, result.deprecations?.tasteNoteId === true
    ? { headers: { Deprecation: 'true' } }
    : undefined);
},
```

### 5. Schema annotation

```ts
// packages/shared/src/schemas/recipe.ts — lines 134-135
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

### 6. OpenAPI `describeRoute` — add deprecated parameter

```ts
// apps/api/src/modules/recipe/index.ts — /recipes describeRoute parameters
parameters: [
  // ... existing 6 params ...
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

## Implementation Steps

1. Extend `paginated()` and `cursorPaginated()` in
   `apps/api/src/utils/response/index.ts` with optional `{ headers }` arg.
   Run `make check-api`.
2. Add the `deprecations` detection + `warn` log to `service.listRecipes`
   (lines 492-568). Add `requestId?: string` parameter. Spread `deprecations`
   into both cursor and offset return paths.
3. Add the same to `service.listStarredRecipes` (lines 583-596). Add
   `requestId?: string` parameter. Compute `deprecations` and spread into
   return.
4. Update both controllers in `apps/api/src/modules/recipe/index.ts`:
   - `/recipes` (lines 73-107): pass `requestId`, check `deprecations` flag,
     pass `{ headers: { Deprecation: 'true' } }` to **both** `cursorPaginated`
     and `paginated` branches.
   - `/starred` (lines 124-134): pass `requestId`, check flag, pass headers to
     `paginated`.
5. Update both `describeRoute` blocks to add `tasteNoteId` (with
   `deprecated: true`) and `tasteNoteIds` to the `parameters` array. Add
   `Deprecation` header declaration to the `200` response.
6. Annotate `packages/shared/src/schemas/recipe.ts:134-135` with JSDoc
   `@deprecated` tag and `.meta({ deprecated: true })`.
7. Update `docs/api.md:234` to add "Will be removed in a future release" note
   and link to the OpenSpec change folder.
8. Create `apps/api/src/modules/recipe/recipe-filter-deprecation.test.ts`
   covering the four deprecation cases for both endpoints, plus a
   controller-level test asserting the `Deprecation` header.
9. Add a test for `paginated()` / `cursorPaginated()` with the `headers`
   option in `apps/api/src/utils/response/response.test.ts`.
10. Final verification: `make check-api`, `make lint`, `make test-api`.

## Testing Strategy

- **Unit (service)** — assert `result.deprecations?.tasteNoteId` is `true`
  when only `tasteNoteId` is provided, and `undefined`/absent in the other
  three cases (plural only, both, neither). Test both `listRecipes` and
  `listStarredRecipes`.
- **Unit (response helpers)** — assert that
  `paginated(c, data, meta, { headers: { Deprecation: 'true' } })` and
  `cursorPaginated(c, data, meta, { headers: { Deprecation: 'true' } })`
  call `c.header('Deprecation', 'true')` before responding.
- **Integration (Hono test client)** — `GET /api/v1/recipes?tasteNoteId=<uuid>`
  returns 200 with the `Deprecation: true` header set.
  `GET /api/v1/recipes?tasteNoteIds=<uuid>` does NOT include the header.
  Same for `/recipes/starred` (with auth).
- **Cursor mode** — `GET /api/v1/recipes?tasteNoteId=<uuid>&cursor=<...>&sortBy=createdAt`
  returns 200 with `Deprecation: true` (exercises the `cursorPaginated`
  branch).
- **Log assertion** — the `warn` log is emitted (silenced in tests via
  `LOG_LEVEL=silent` but the `deprecations` flag on the return shape is the
  contract the test asserts on).
- **Regression** — existing tests in
  `apps/api/src/modules/recipe/*.test.ts` continue to pass; no existing
  behaviour changes.

## Risk Assessment

Low. The change is purely additive at the wire format level — a new response
header that conforming clients ignore unless they specifically look for it,
plus a service-internal log line. No filter logic, no SQL, no schema change.
The only risk vector is log volume: if a misbehaving client polls with the
singular parameter at high frequency the `warn` line could become noisy. This
is acceptable for Phase 1 — high volume is itself the signal that prompts
Phase 2 (field removal). Should it become a problem operationally before
Phase 2 ships, the log line can be rate-limited or downgraded without
touching the header behaviour.

## Dependencies

- **D12 (recipe-filter-logic)** — **MERGED and archived.** The
  `buildRecipeFilters` helper exists at `model.ts:83-179`, the `else if`
  branch for singular `tasteNoteId` is at `model.ts:167-176`, and both
  listing endpoints honour the parameter identically. D28 builds on this
  stable foundation.

## Out of Scope

- **Phase 2: field removal.** Removing the singular `tasteNoteId` from the
  schema, the `buildRecipeFilters` branch, the docs, and any remaining
  consumers is a separate plan (D29 or later) that triggers only after
  production telemetry confirms no significant callers remain.
- **Other deprecations.** The `Deprecation` header pattern established here
  may be reused by future plans, but D28 only addresses `tasteNoteId`. Other
  deprecated fields (if any) get their own plans.
- **Third-party client outreach.** D28 emits the signal; deciding which API
  consumers to notify (and how) is an operations / product concern, not a
  code change.
- **`findStarred` filter type cleanup.** The inline anonymous filter type at
  `model.ts:855-866` is a pre-existing drift from `RecipeFilterCriteria`. D28
  may optionally replace it with `RecipeFilterCriteria & { sortBy?: string;
  sortOrder?: string }` but this is not required for the deprecation signal.

## Validation Notes

All line numbers, function signatures, and code references in this revised
plan were verified against `main` on 2026-06-22. Key facts:

- D12 is merged (commit `08930b3`, archived at
  `openspec/changes/archive/2026-06-06-d12-recipe-filter-logic/`).
- `buildRecipeFilters` is at `model.ts:83-179`; the `else if` branch for
  singular `tasteNoteId` is at `model.ts:167-176`.
- `listRecipes` is at `service.ts:492-568`; returns a union of offset and
  cursor shapes.
- `listStarredRecipes` is at `service.ts:583-596`; thin wrapper around
  `model.findStarred`.
- `/recipes` controller handler is at `index.ts:73-107` (two-branch return:
  cursor at line 87, offset at line 94).
- `/starred` controller handler is at `index.ts:124-134`.
- `paginated()` is at `response/index.ts:31-40`; `cursorPaginated()` at
  `response/index.ts:52-61`. Neither accepts a `headers` argument.
- `RecipeFilterCriteria` at `model.ts:67-77` already has `@deprecated` JSDoc
  on `tasteNoteId` (line 73).
- `RecipeFilterSchema` at `packages/shared/src/schemas/recipe.ts:117-153`;
  the singular `tasteNoteId` field is at lines 134-135 with only an inline
  comment.
- Zod v4.4.3 is in use; `.meta()` is available for OpenAPI metadata.
- The `/recipes` `describeRoute` at `index.ts:42-49` does not document
  `tasteNoteId` or `tasteNoteIds` in its `parameters` array.
- `requestId` is set via `requestIdMiddleware` (`hono/request-id`) and
  available as `c.get('requestId')` in controllers.
- No `feat/d28` branch exists; D28 has not been started.