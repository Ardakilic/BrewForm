## Why

The recipe filter schema at `packages/shared/src/schemas/recipe.ts:134-135`
exposes a singular `tasteNoteId` query parameter alongside the canonical plural
`tasteNoteIds`. The singular form has been annotated as deprecated in a code
comment since the plural was introduced, but the deprecation lives only in the
source — the API gives no runtime signal to callers that the parameter is on
its way out.

D12 (recipe-filter-logic, merged and archived) extracted the shared
`buildRecipeFilters` helper into `apps/api/src/modules/recipe/model.ts:83-179`
and closed the parity gap between the `/recipes` and `/recipes/starred`
endpoints. Both now honour the singular `tasteNoteId` via the same
`else if (filters.tasteNoteId)` branch inside `buildRecipeFilters`
(`model.ts:167-176`). D12 explicitly deferred the deprecation cycle itself:
_"No removal of the deprecated `tasteNoteId` — that's a separate API
deprecation cycle."_ This change is that cycle.

None of the earlier plans (D01–D11) address the deprecation work either. With
D12 merged, the next required step is the deprecation signal: clients need a
standards-aligned indicator so they can migrate before removal, and operations
needs telemetry so they can decide when removal is safe. Today there is
neither.

D28 is **Phase 1 of a two-phase deprecation cycle.** Phase 1 (this change)
emits the signal. Phase 2 (a follow-up plan, D29 or later) removes the field
once production telemetry confirms no significant callers remain. The
field-removal step is explicitly out of scope here, matching the precedent set
by D27 (cursor pagination), which kept the legacy `page` parameter working
and deferred its removal to a separate plan rather than bundling the breakage.

## What Changes

- Add an optional `deprecations?: { tasteNoteId?: boolean }` field to the
  return shapes of `apps/api/src/modules/recipe/service.ts:listRecipes` and
  `apps/api/src/modules/recipe/service.ts:listStarredRecipes`. The flag is set
  to `true` only when `tasteNoteId` is provided **and** `tasteNoteIds` is
  absent — matching the existing `else if` precedence in `buildRecipeFilters`
  so the plural form continues to take priority silently. The detection
  lives in the service layer (not in `buildRecipeFilters`, which is a pure
  `SQL[]`-returning helper with no logger).
- Emit a structured `warn` log line at the same point:
  `logger.warn({ filter: 'tasteNoteId', userId, requestId }, 'Deprecated
  query parameter used')`. No payload, no PII, traceable IDs only — per
  AGENTS.md logging rules. `requestId` is plumbed through from the controller
  via a new optional parameter on both service functions (the service layer
  has no Hono context access today).
- Extend both `paginated()` and `cursorPaginated()` in
  `apps/api/src/utils/response/index.ts` to accept an optional
  `{ headers?: Record<string, string> }` argument so the controller layer can
  set arbitrary response headers without leaking HTTP plumbing into the
  service layer. This is purely additive — all existing call sites work
  unchanged. **Both** helpers must be extended because the `/recipes`
  controller has a two-branch return (cursor mode via `cursorPaginated` at
  `index.ts:87`, offset mode via `paginated` at `index.ts:94`); extending
  only `paginated` would silently drop the header in cursor mode.
- Update both recipe controllers in `apps/api/src/modules/recipe/index.ts`:
  - `/recipes` handler (lines 73-107): pass `requestId` to the service,
    check `result.deprecations?.tasteNoteId === true`, and pass
    `{ headers: { Deprecation: 'true' } }` to **both** the `cursorPaginated`
    and `paginated` branches.
  - `/starred` handler (lines 124-134): same pattern, `paginated` only.
  - The `Deprecation: true` header follows [RFC 8594](https://www.rfc-editor.org/rfc/rfc8594).
    No `Sunset` date is set in Phase 1 — that decision belongs to Phase 2.
- Update the `describeRoute` metadata on both routes (per AGENTS.md's
  mandatory OpenAPI rule) to:
  1. Add `tasteNoteId` (with `deprecated: true`) and `tasteNoteIds` to the
     `parameters` array — currently neither is documented in the OpenAPI spec.
  2. Declare the `Deprecation` response header on the `200` response.
- Add a JSDoc `@deprecated` tag and a Zod `.meta({ deprecated: true })` call
  to the `tasteNoteId` field in `packages/shared/src/schemas/recipe.ts:134-135`.
  The codebase uses Zod v4 (`zod@4.4.3`), whose `.meta()` method stores metadata
  in the `globalRegistry` that `zod-openapi` v5 (pulled in by `hono-openapi`)
  reads during OpenAPI generation — making the deprecation visible in
  generated OpenAPI types. The JSDoc tag provides TypeScript editor strikethrough.
  Note: `RecipeFilterCriteria` in `model.ts:73` already has a `@deprecated`
  JSDoc tag — D28 brings the public Zod schema to the same level.
- Update the documentation row for `tasteNoteId` in `docs/api.md:234` to add
  a "Will be removed in a future release" note and link to the OpenSpec
  change folder for D28.
- Add a new test file
  `apps/api/src/modules/recipe/recipe-filter-deprecation.test.ts` covering
  the four deprecation cases (singular only → flag set; plural only → no
  flag; both → no flag; neither → no flag) for both `listRecipes` and
  `listStarredRecipes`, plus a controller-level test asserting the
  `Deprecation: true` header is present on the response when the singular
  parameter is used (both offset and cursor modes).
- Add a test for the `paginated()` / `cursorPaginated()` `headers` option in
  `apps/api/src/utils/response/response.test.ts`.

No filter semantics change. No SQL changes. No schema field added or removed.
No breaking change for any client — the new header is additive and clients
that do not inspect it see no difference.

## Capabilities

### Modified Capabilities

- `recipe-filter`: D12 introduced this capability to cover the shared
  filter-building helper (`buildRecipeFilters`) and the requirement that
  both `listRecipes` and `findStarred` apply the same filter set, including
  the deprecated singular `tasteNoteId`. D28 extends the same capability
  with three additional requirements:

  1. When the deprecated singular `tasteNoteId` is the parameter that
     actually drove the query (i.e., set without `tasteNoteIds`), the API
     SHALL emit an RFC 8594 `Deprecation: true` HTTP response header and a
     structured `warn` log line. The header SHALL be emitted on **both**
     offset-paginated and cursor-paginated responses.
  2. The `RecipeFilterSchema.tasteNoteId` field SHALL carry a JSDoc
     `@deprecated` tag and Zod `.meta({ deprecated: true })` metadata
     referencing `tasteNoteIds` and D28.
  3. A new test file SHALL cover the four deprecation cases for both
     endpoints, plus a controller-level header assertion.

  D28 also modifies one D12 requirement (the deprecated-singular behaviour
  scenario) to add the response-header obligation; the SQL behaviour itself
  is unchanged.