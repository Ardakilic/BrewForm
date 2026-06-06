# D28 — Remove Deprecated tasteNoteId (Singular) Query Parameter

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

The backend honours the singular form via an `else if` branch in
`apps/api/src/modules/recipe/service.ts:544-551` (inside `listRecipes`). Until
D12 (separate change, in progress) lands, the same branch is **missing** from
`apps/api/src/modules/recipe/model.ts:findStarred` — that endpoint silently
drops the singular form. D12 closes that parity gap; with D12 merged, both
listing endpoints honour the deprecated parameter identically. D12's
`design.md:90` explicitly notes: _"No removal of the deprecated `tasteNoteId` —
that's a separate API deprecation cycle."_ This plan is that cycle.

D28 introduces the two missing runtime signals: a standards-aligned HTTP
response header (`Deprecation: true` per RFC 8594) and a structured `warn` log
line. Both are emitted only when the deprecated singular parameter is the one
actually used (i.e., when `tasteNoteId` is set and `tasteNoteIds` is not). When
both are present the plural takes precedence (matching the `else if` branch),
so no signal is emitted in that case either.

The frontend has been audited and never sends the singular form — only
`tasteNoteIds` is used across `apps/web/src/components/recipe-list/useRecipeFilters.ts`,
`RecipeListView.tsx`, `RecipeCreatePage.tsx`, `RecipeEditPage.tsx`,
`TasteNotesPage.tsx`, and `TastingNotesSection.tsx`. Any usage of the singular
form therefore comes from third-party API clients, and the only way to find out
how many such clients exist (and when removal becomes safe) is to emit
deprecation telemetry in production. None of D01-D11 plans this work; D12
defers it; D28 fills the gap.

## Impact

- Clients using the singular `tasteNoteId` parameter today get no feedback that
  it is deprecated — there is no header, no warning, nothing in the response
  envelope.
- Operations cannot estimate when removing the field is safe because no
  production signal exists to count or attribute callers.
- Documentation drifts away from runtime behaviour:
  `docs/api.md:234` says _"deprecated, use tasteNoteIds"_ but the API itself
  produces no observable indication of that status.
- The schema's deprecation comment at
  `packages/shared/src/schemas/recipe.ts:134` is invisible to consumers who
  rely on generated OpenAPI / TypeScript types because there is no `@deprecated`
  JSDoc tag attached to the field.

## Affected Files

| File                                                       | Lines    | Change type                                                |
| ---------------------------------------------------------- | -------- | ---------------------------------------------------------- |
| `apps/api/src/modules/recipe/service.ts`                   | 544-551  | Set `deprecations.tasteNoteId = true`; emit `warn` log     |
| `apps/api/src/modules/recipe/model.ts` (`findStarred`)     | ~539-735 | Same flag + log (after D12 lands and the branch exists)    |
| `apps/api/src/modules/recipe/index.ts`                     | 42-55    | `/recipes` controller reads flag, sets `Deprecation` header |
| `apps/api/src/modules/recipe/index.ts`                     | 72-82    | `/recipes/starred` controller reads flag, sets header      |
| `apps/api/src/utils/response/index.ts`                     | 30-40    | Extend `paginated()` to accept optional response headers   |
| `packages/shared/src/schemas/recipe.ts`                    | 134-135  | Add `@deprecated` JSDoc tag referencing D28                |
| `docs/api.md`                                              | 234      | Add "Will be removed in a future release" note + OpenSpec link |
| `apps/api/src/modules/recipe/recipe-filter-deprecation.test.ts` | new   | New test file covering the four deprecation cases          |

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

1. Extend the `listRecipes` and `findStarred` return types with an optional
   `deprecations` discriminator (`{ tasteNoteId?: boolean }`). The flag is set
   to `true` inside the existing `else if (filters.tasteNoteId)` branch.
2. Emit the `warn` log line at the same point in the service / model so the
   log fires once per request that uses the deprecated parameter — never on
   the plural path, never when both are set.
3. Extend `paginated()` in `apps/api/src/utils/response/index.ts` to accept an
   optional `headers?: Record<string, string>` argument so the controller can
   declare the `Deprecation` header in one place without leaking response
   plumbing into the service layer.
4. In both controllers (`apps/api/src/modules/recipe/index.ts:42-55` for the
   public list and lines 72-82 for the starred list), check
   `result.deprecations?.tasteNoteId === true` and pass `{ headers:
   { Deprecation: 'true' } }` to `paginated()`. The service / model layer
   stays HTTP-agnostic.
5. Annotate `packages/shared/src/schemas/recipe.ts:134-135` with a JSDoc
   `@deprecated` tag so downstream OpenAPI / generated type consumers see the
   deprecation in their toolchain.
6. Update `docs/api.md:234` to add a "Will be removed in a future release"
   note and link to `openspec/changes/d28-remove-deprecated-taste-note-id/`.

## Proposed Code Sketches

### 1. New return-type shape

```ts
// apps/api/src/modules/recipe/service.ts
export interface ListRecipesResult {
  recipes: Recipe[];
  total: number;
  /**
   * Per-request deprecation flags. Populated by the service when the request
   * exercised a deprecated input. Controllers translate these into response
   * headers (e.g., RFC 8594 `Deprecation`). HTTP layer never reaches here.
   */
  deprecations?: {
    /** True when the request used `tasteNoteId` (singular) and not `tasteNoteIds` (plural). */
    tasteNoteId?: boolean;
  };
}

export async function listRecipes(/* ... */): Promise<ListRecipesResult> {
  // ... existing filter assembly ...
  const deprecations: ListRecipesResult['deprecations'] = {};
  if (!filters.tasteNoteIds && filters.tasteNoteId) {
    deprecations.tasteNoteId = true;
    log.warn(
      { filter: 'tasteNoteId', userId: _requestingUserId, requestId },
      'Deprecated query parameter used',
    );
  }
  // ... existing call to model.findMany ...
  return { recipes: result.recipes, total: result.total, ...(deprecations.tasteNoteId ? { deprecations } : {}) };
}
```

The same shape is added to `findStarred` in `apps/api/src/modules/recipe/model.ts`
after D12 lands and the `else if (filters.tasteNoteId)` branch exists there.

### 2. Extended `paginated()` helper

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
    meta: {
      requestId: c.get('requestId'),
      pagination,
    },
  }, 200);
}
```

This is purely additive — all existing call sites continue to work unchanged.

### 3. Structured `warn` log call

```ts
// inside listRecipes / findStarred
log.warn(
  { filter: 'tasteNoteId', userId, requestId },
  'Deprecated query parameter used',
);
```

The shape matches the AGENTS.md logging rules: structured object with
traceable IDs, no payload data, no PII, `warn` level (recoverable, request
still succeeds).

## Refactored Usage

```ts
// apps/api/src/modules/recipe/index.ts (lines 42-55, /recipes)
const result = await service.listRecipes(
  filters,
  filters.page,
  filters.perPage,
  userId,
  isAdmin,
);
return paginated(c, result.recipes, {
  page: filters.page,
  perPage: filters.perPage,
  total: result.total,
  totalPages: Math.ceil(result.total / filters.perPage),
}, result.deprecations?.tasteNoteId ? { headers: { Deprecation: 'true' } } : undefined);
```

```ts
// apps/api/src/modules/recipe/index.ts (lines 72-82, /recipes/starred)
const result = await service.listStarredRecipes(filters, filters.page, filters.perPage, userId);
return paginated(c, result.recipes, {
  page: filters.page,
  perPage: filters.perPage,
  total: result.total,
  totalPages: Math.ceil(result.total / filters.perPage),
}, result.deprecations?.tasteNoteId ? { headers: { Deprecation: 'true' } } : undefined);
```

## Implementation Steps

1. Extend `paginated()` in `apps/api/src/utils/response/index.ts` to accept the
   optional `{ headers }` argument and apply it via `c.header()` before
   `c.json()`. Run `make check-api`.
2. Add the `ListRecipesResult` / `ListStarredRecipesResult` typed return
   shapes (including the `deprecations` discriminator) and update the service
   / model return statements.
3. Inside `service.ts:listRecipes` (around lines 544-551) set
   `deprecations.tasteNoteId = true` when `tasteNoteIds` is absent **and**
   `tasteNoteId` is present, and emit the `warn` log line.
4. After D12 lands, mirror the same flag + log in
   `apps/api/src/modules/recipe/model.ts:findStarred`. If D12 has not landed
   yet, either rebase D28 on top of D12 or sequence D28's `findStarred` edit
   into the D12 branch.
5. Update both controllers in `apps/api/src/modules/recipe/index.ts` (lines
   42-55 and 72-82) to pass the optional `headers` argument to `paginated()`
   when the service reports the flag.
6. Add the `@deprecated` JSDoc tag in
   `packages/shared/src/schemas/recipe.ts:134-135` and update
   `docs/api.md:234`.
7. Create `apps/api/src/modules/recipe/recipe-filter-deprecation.test.ts`
   covering the four cases (singular only → flag set; plural only → no flag;
   both → no flag; neither → no flag). Optionally add an end-to-end
   controller-level test asserting the `Deprecation` header.

## Testing Strategy

- **Unit (service / model)** — assert `result.deprecations?.tasteNoteId` is
  `true` when only `tasteNoteId` is provided, and `undefined` (or absent) in
  the other three cases.
- **Unit (controller helper)** — assert that `paginated(c, data, meta, {
  headers: { Deprecation: 'true' } })` calls `c.header('Deprecation', 'true')`
  exactly once before responding.
- **Integration (Hono test client, optional)** — `GET /api/v1/recipes?tasteNoteId=<uuid>`
  returns a 200 response with the `Deprecation: true` header set.
  `GET /api/v1/recipes?tasteNoteIds=<uuid>` does NOT include the header.
- **Log assertion** — capture the test logger and assert exactly one `warn`
  entry with `{ filter: 'tasteNoteId' }` per deprecated request.
- **Regression** — existing tests in `apps/api/src/modules/recipe/*.test.ts`
  continue to pass; no existing behaviour changes.

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

- **D12 (recipe-filter-logic)** — must land first so that
  `apps/api/src/modules/recipe/model.ts:findStarred` actually applies the
  singular `tasteNoteId` filter. Before D12, emitting the deprecation header
  on `/recipes/starred` would be misleading because the parameter is silently
  dropped there. With D12 merged, both endpoints honour the parameter
  identically and both can emit the deprecation signal identically.

## Out of Scope

- **Phase 2: field removal.** Removing the singular `tasteNoteId` from the
  schema, the service branch, the model branch, and the docs is a separate
  plan (D29 or later) that triggers only after production telemetry confirms
  no significant callers remain.
- **Other deprecations.** The `Deprecation` header pattern established here
  may be reused by future plans, but D28 only addresses `tasteNoteId`. Other
  deprecated fields (if any) get their own plans.
- **Third-party client outreach.** D28 emits the signal; deciding which API
  consumers to notify (and how) is an operations / product concern, not a
  code change.

## Validation Notes

_(none — all line numbers and behaviours referenced above were verified
against `main` at plan-authoring time)_
