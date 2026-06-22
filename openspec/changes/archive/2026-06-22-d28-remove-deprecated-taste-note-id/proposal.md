## Why

The recipe filter schema at `packages/shared/src/schemas/recipe.ts:134-135`
exposes a singular `tasteNoteId` query parameter alongside the canonical plural
`tasteNoteIds`. The singular form has been annotated as deprecated in a code
comment since the plural was introduced, but the deprecation lives only in the
source — the API gives no runtime signal to callers that the parameter is on
its way out.

The backend honours the singular form via an `else if` branch in
`apps/api/src/modules/recipe/service.ts:544-551` (inside `listRecipes`).
Until D12 (separate change, in progress) lands, the same branch is missing
from `apps/api/src/modules/recipe/model.ts:findStarred`. D12 fixes that parity
gap. D12's `design.md:90` explicitly defers the deprecation cycle itself:
_"No removal of the deprecated `tasteNoteId` — that's a separate API
deprecation cycle."_ This change is that cycle.

None of D01-D11 plan the deprecation work either. With D12 closing the parity
gap, the next required step is the deprecation signal: clients need a
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
  `apps/api/src/modules/recipe/model.ts:findStarred` (the latter once D12
  has landed). The flag is set to `true` only when `tasteNoteId` is provided
  **and** `tasteNoteIds` is absent — matching the existing `else if`
  precedence so the plural form continues to take priority silently.
- Emit a structured `warn` log line at the same point: `log.warn({ filter:
  'tasteNoteId', userId, requestId }, 'Deprecated query parameter used')`.
  No payload, no PII, traceable IDs only — per AGENTS.md logging rules.
- Extend `paginated()` in `apps/api/src/utils/response/index.ts` to accept an
  optional `{ headers?: Record<string, string> }` argument so the controller
  layer can set arbitrary response headers without leaking HTTP plumbing into
  the service layer. This is purely additive — all existing call sites work
  unchanged.
- Update both recipe controllers in `apps/api/src/modules/recipe/index.ts`
  (lines 42-55 for `/recipes`, lines 72-82 for `/recipes/starred`) to check
  `result.deprecations?.tasteNoteId === true` and pass
  `{ headers: { Deprecation: 'true' } }` to `paginated()`. The `Deprecation:
  true` header follows [RFC 8594](https://www.rfc-editor.org/rfc/rfc8594).
  No `Sunset` date is set in Phase 1 — that decision belongs to Phase 2.
- Add a JSDoc `@deprecated` tag to the `tasteNoteId` field in
  `packages/shared/src/schemas/recipe.ts:134-135` so generated TypeScript /
  OpenAPI consumers see the deprecation in their toolchain.
- Update the documentation row for `tasteNoteId` in `docs/api.md:234` to add
  a "Will be removed in a future release" note and link to the OpenSpec
  change folder for D28.
- Add a new test file
  `apps/api/src/modules/recipe/recipe-filter-deprecation.test.ts` covering
  the four deprecation cases (singular only → flag set; plural only → no
  flag; both → no flag; neither → no flag) and, optionally, a controller-
  level test that asserts the `Deprecation: true` header is present on the
  response when the singular parameter is used.

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
     structured `warn` log line.
  2. The `RecipeFilterSchema.tasteNoteId` field SHALL carry a JSDoc
     `@deprecated` tag pointing to `tasteNoteIds` and referencing D28.
  3. A new test file SHALL cover the four deprecation cases.

  D28 also modifies one D12 requirement (the deprecated-singular behaviour
  scenario) to add the response-header obligation; the SQL behaviour itself
  is unchanged.
