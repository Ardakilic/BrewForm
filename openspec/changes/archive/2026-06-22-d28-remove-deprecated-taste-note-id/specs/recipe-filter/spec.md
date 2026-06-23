## ADDED Requirements

### Requirement: Deprecation signal for singular `tasteNoteId`

The API SHALL emit an [RFC 8594](https://www.rfc-editor.org/rfc/rfc8594)
`Deprecation: true` HTTP response header and exactly one structured `warn`
log entry when a request to `GET /api/v1/recipes` or
`GET /api/v1/recipes/starred` supplies the deprecated singular `tasteNoteId`
query parameter **and** does not supply the canonical plural `tasteNoteIds`.
The log entry SHALL be shaped as
`{ filter: 'tasteNoteId', userId, requestId }`. No additional fields (and
specifically no payload or PII) SHALL be logged.

When the plural `tasteNoteIds` is supplied — whether on its own or alongside
the singular — the plural form takes precedence per the existing `else if`
filter branch in `buildRecipeFilters` (`apps/api/src/modules/recipe/model.ts:
167-176`), and the API SHALL NOT emit the `Deprecation` header and SHALL NOT
emit the `warn` log entry. This preserves the precedence contract
established by D12's `buildRecipeFilters` helper.

The header value SHALL be the literal token `true`. The API SHALL NOT set a
`Sunset` companion header in Phase 1; the removal-date commitment that a
`Sunset` value implies belongs to Phase 2 / D29+.

The `Deprecation` header SHALL be emitted on **both** offset-paginated
responses (via `paginated()`) and cursor-paginated responses (via
`cursorPaginated()`). The `/recipes` controller has a two-branch return
(`index.ts:86-99`); both branches must check the deprecation flag and pass
the header. Extending only `paginated()` would silently drop the header in
cursor mode.

The detection of the deprecated parameter SHALL live in the service layer
(`service.ts:listRecipes` and `service.ts:listStarredRecipes`), which is
the layer that owns the `logger` and the return shape. The
`buildRecipeFilters` helper in `model.ts` SHALL NOT be modified to emit logs
or side effects — it is a pure `SQL[]`-returning data-access function (per
`model.ts:2-4`). The controller SHALL NOT re-derive the precedence check; it
SHALL set the header only when `result.deprecations?.tasteNoteId === true`.

The `requestId` included in the log entry SHALL be obtained from the Hono
context (`c.get('requestId')`) in the controller and plumbed through to the
service via a new optional `requestId?: string` parameter on both
`listRecipes` and `listStarredRecipes`.

#### Scenario: Singular parameter returns Deprecation header (offset mode)

- **WHEN** a client sends `GET /api/v1/recipes?tasteNoteId=<uuid>` (no
  `tasteNoteIds` set, no `cursor`)
- **THEN** the response status is `200`, the response includes the header
  `Deprecation: true`, and exactly one `warn` log entry is emitted with
  `{ filter: 'tasteNoteId', userId, requestId }`

#### Scenario: Singular parameter returns Deprecation header (cursor mode)

- **WHEN** a client sends
  `GET /api/v1/recipes?tasteNoteId=<uuid>&cursor=<cursor>&sortBy=createdAt`
- **THEN** the response status is `200`, the response includes the header
  `Deprecation: true` (set via the `cursorPaginated` branch), and exactly
  one `warn` log entry is emitted with `{ filter: 'tasteNoteId', userId,
  requestId }`

#### Scenario: Plural parameter does not return Deprecation header

- **WHEN** a client sends `GET /api/v1/recipes?tasteNoteIds=<uuid>` (no
  `tasteNoteId` set)
- **THEN** the response status is `200`, no `Deprecation` header is set, and
  no deprecation `warn` log entry is emitted

#### Scenario: Both parameters set — plural wins, no Deprecation header

- **WHEN** a client sends
  `GET /api/v1/recipes?tasteNoteIds=<uuid-1>&tasteNoteId=<uuid-2>`
- **THEN** the response status is `200`, the query filter is applied using
  the plural `tasteNoteIds` only (matching the `else if` precedence
  established by `buildRecipeFilters` in `model.ts:155-176`), no
  `Deprecation` header is set, and no deprecation `warn` log entry is
  emitted

#### Scenario: Neither parameter set — no Deprecation header

- **WHEN** a client sends `GET /api/v1/recipes` with no taste-note filter
- **THEN** the response status is `200`, no `Deprecation` header is set, and
  no deprecation `warn` log entry is emitted

#### Scenario: Starred endpoint behaves identically

- **WHEN** any of the above requests is sent to `GET /api/v1/recipes/starred`
  instead of `GET /api/v1/recipes` (with appropriate auth)
- **THEN** the same `Deprecation` header and `warn` log behaviour applies on
  the starred endpoint, because both controllers consume the same
  `deprecations` flag on the service return shape. The starred endpoint
  uses offset pagination only (no cursor branch).

#### Scenario: Detection lives in service, not in controller or buildRecipeFilters

- **WHEN** the implementation of `apps/api/src/modules/recipe/index.ts`
  (lines 73-107 and 124-134) is inspected
- **THEN** neither controller contains a reference to `filters.tasteNoteId`;
  both controllers determine whether to set the `Deprecation` header solely
  by checking `result.deprecations?.tasteNoteId === true`

#### Scenario: buildRecipeFilters remains side-effect-free

- **WHEN** the implementation of `buildRecipeFilters` in
  `apps/api/src/modules/recipe/model.ts:83-179` is inspected
- **THEN** it contains no `logger.warn` call, no `deprecations` field, and
  no side effect — it remains a pure function returning `SQL[]`

### Requirement: Both response helpers accept optional headers

Both `paginated<T>()` and `cursorPaginated<T>()` SHALL accept an optional fourth argument `options?: { headers?: Record<string, string> }` in `apps/api/src/utils/response/index.ts`. When provided, the headers SHALL be applied via `c.header(name, value)` before `c.json()` is called. The extension SHALL be purely additive — every existing call site that passes only three arguments SHALL continue to work unchanged.

#### Scenario: paginated with headers option

- **WHEN** `paginated(c, data, meta, { headers: { Deprecation: 'true' } })`
  is called
- **THEN** the response includes the header `Deprecation: true` and the
  response body is the standard `{ success, data, meta }` envelope

#### Scenario: cursorPaginated with headers option

- **WHEN** `cursorPaginated(c, data, cursorMeta, { headers: { Deprecation:
  'true' } })` is called
- **THEN** the response includes the header `Deprecation: true` and the
  response body is the standard `{ success, data, meta: { cursor } }` envelope

#### Scenario: Existing call sites unchanged

- **WHEN** any existing `paginated(c, data, pagination)` or
  `cursorPaginated(c, data, cursorMeta)` call site (passing only three
  arguments) is invoked
- **THEN** the response is identical to before — no headers are set, no
  error is raised, the fourth argument defaults to `undefined`

### Requirement: Schema annotation for `tasteNoteId`

The `RecipeFilterSchema.tasteNoteId` field SHALL carry a JSDoc `@deprecated`
tag and a Zod `.meta({ deprecated: true })` call in
`packages/shared/src/schemas/recipe.ts`. The JSDoc tag SHALL name the
canonical replacement (`tasteNoteIds`) and reference the D28 change folder.
The `.meta({ deprecated: true })` call SHALL make the deprecation visible to
`zod-openapi` v5 (pulled in by `hono-openapi`) in the generated OpenAPI
document.

The annotations SHALL be visible to TypeScript (editor strikethrough via
JSDoc) and OpenAPI consumers ( `deprecated: true` in the schema/parameter
object via `.meta()`). The inline `//` comment may be removed or retained
alongside the JSDoc tag.

#### Scenario: Schema field carries @deprecated JSDoc tag

- **WHEN** the source of `packages/shared/src/schemas/recipe.ts` is inspected
  at the `tasteNoteId` field declaration (currently lines 134-135)
- **THEN** the field has a JSDoc block containing an `@deprecated` tag, the
  prose references `tasteNoteIds` as the replacement, and the prose names
  the D28 OpenSpec change

#### Scenario: Schema field carries .meta({ deprecated: true })

- **WHEN** the source of `packages/shared/src/schemas/recipe.ts` is inspected
  at the `tasteNoteId` field declaration
- **THEN** the field's Zod chain includes `.meta({ deprecated: true })` (or
  `.meta({ deprecated: true, ... })` with additional metadata)

#### Scenario: Deprecation visible to generated consumers

- **WHEN** TypeScript inference is exercised against
  `z.infer<typeof RecipeFilterSchema>` (or the generated OpenAPI document at
  `GET /api/v1/openapi.json`)
- **THEN** the `tasteNoteId` field is reported as deprecated by the
  toolchain (e.g., editor strikethrough on `RecipeFilterSchema.shape.tasteNoteId`,
  or `deprecated: true` in the OpenAPI parameter description)

### Requirement: OpenAPI metadata for deprecated parameter and Deprecation header

The `describeRoute` metadata on both the `/recipes` route and the `/recipes/starred` route SHALL add `tasteNoteId` (with `deprecated: true`) and `tasteNoteIds` to the `parameters` array. The `tasteNoteId` parameter entry SHALL include `deprecated: true` and a description pointing to `tasteNoteIds` as the replacement and referencing D28. Both routes SHALL declare the `Deprecation` response header on the `200` response via `headers: { Deprecation: { schema: { type: 'string' }, description: '...' } }`.

This is mandatory per AGENTS.md: _"Every new route (or change to a route's
request/response shape) MUST include OpenAPI metadata."_

#### Scenario: tasteNoteId documented as deprecated in OpenAPI parameters

- **WHEN** the `describeRoute` parameters array of the `/recipes` route
  ( `index.ts:42-49`) is inspected
- **THEN** it contains an entry for `tasteNoteId` with `deprecated: true`
  and an entry for `tasteNoteIds`, both with appropriate `schema` and
  `description` fields

#### Scenario: Deprecation header declared in OpenAPI response

- **WHEN** the `describeRoute` `200` response of the `/recipes` route is
  inspected
- **THEN** it declares a `Deprecation` header with a `schema` of type
  `string` and a description referencing RFC 8594

#### Scenario: Starred route metadata updated

- **WHEN** the `describeRoute` parameters array and `200` response of the
  `/starred` route (`index.ts:112-121`) is inspected
- **THEN** it also contains the `tasteNoteId` (deprecated) and
  `tasteNoteIds` parameter entries and the `Deprecation` response header
  declaration

### Requirement: Test coverage for the deprecation cases

The API package SHALL contain a test file
`apps/api/src/modules/recipe/recipe-filter-deprecation.test.ts` that covers
the four deprecation cases:

1. `tasteNoteId` set without `tasteNoteIds` → `deprecations.tasteNoteId` is
   `true`
2. `tasteNoteIds` set without `tasteNoteId` → `deprecations.tasteNoteId` is
   absent or `false`
3. Both set → plural wins, `deprecations.tasteNoteId` is absent or `false`
4. Neither set → no flag, no header

The same four cases SHALL be exercised against both `listRecipes` and
`listStarredRecipes` so that parity between the two endpoints established by
D12 is preserved by D28.

A controller-level integration test SHALL use Hono's `app.request(...)` method
to assert the presence (or absence) of the `Deprecation: true` HTTP header on
a real request/response pair. This test SHALL cover:

- `GET /api/v1/recipes?tasteNoteId=<uuid>` → header present
- `GET /api/v1/recipes?tasteNoteIds=<uuid>` → header absent
- `GET /api/v1/recipes?tasteNoteId=<uuid>&cursor=<...>&sortBy=createdAt` →
  header present (exercises the `cursorPaginated` branch)

The response-helper test file
(`apps/api/src/utils/response/response.test.ts`) SHALL be extended to assert
that `paginated()` and `cursorPaginated()` with the `{ headers }` option
correctly call `c.header(name, value)` before responding.

#### Scenario: Four service-level cases exist for listRecipes

- **WHEN** `apps/api/src/modules/recipe/recipe-filter-deprecation.test.ts`
  is inspected
- **THEN** it contains a `describe` block for `listRecipes` with one `it`
  per case (singular-only, plural-only, both, neither) asserting on
  `result.deprecations?.tasteNoteId`

#### Scenario: Four service-level cases exist for listStarredRecipes

- **WHEN** the same test file is inspected
- **THEN** it contains a second `describe` block for `listStarredRecipes`
  with the same four cases

#### Scenario: Controller-level header test exists

- **WHEN** the test file is inspected
- **THEN** it contains a `describe` block that uses `app.request(...)` to
  assert the `Deprecation` header is present when `tasteNoteId` is used and
  absent when `tasteNoteIds` is used, including a cursor-mode case

#### Scenario: Response-helper test extended

- **WHEN** `apps/api/src/utils/response/response.test.ts` is inspected
- **THEN** it contains tests asserting that `paginated()` and
  `cursorPaginated()` with `{ headers: { Deprecation: 'true' } }` set the
  header on the response

#### Scenario: Tests pass under `make test-api`

- **WHEN** `make test-api` is invoked on a clean checkout that includes the
  D28 changes
- **THEN** every test in
  `apps/api/src/modules/recipe/recipe-filter-deprecation.test.ts` and
  `apps/api/src/utils/response/response.test.ts` passes and no pre-existing
  test regresses

## MODIFIED Requirements

### Requirement: Deprecated tasteNoteId (singular) is honoured

`buildRecipeFilters` SHALL generate a single taste-note condition when
`tasteNoteId` (singular) is provided AND `tasteNoteIds` (plural) is NOT.
When both `tasteNoteIds` and `tasteNoteId` are provided, the plural
`tasteNoteIds` SHALL take precedence and `tasteNoteId` SHALL be ignored
(matching the existing `else if` branch in `buildRecipeFilters` at
`model.ts:167-176`).

This means `model.ts:findStarred()` — which previously dropped
`tasteNoteId` silently — picks up the deprecated singular filter for free
via the shared `buildRecipeFilters` helper (D12 parity fix). This is an
intentional parity fix against the public `RecipeFilterSchema` contract.

**MODIFIED by D28:** In addition to applying the filter, the API response
for any request whose query used the deprecated singular `tasteNoteId`
without the plural `tasteNoteIds` SHALL include a `Deprecation: true` HTTP
response header per the [Deprecation signal for singular `tasteNoteId`
requirement above](#requirement-deprecation-signal-for-singular-tastenoteid).
The SQL behaviour itself is unchanged; only the response headers and the
service-layer logging side-effect are added. The detection lives in the
service layer ( `listRecipes` / `listStarredRecipes`), not in
`buildRecipeFilters` (which remains side-effect-free).

#### Scenario: Singular tasteNoteId generates one condition

- **WHEN** `buildRecipeFilters({ tasteNoteId: 'some-uuid' })` is called
  (and `tasteNoteIds` is absent)
- **THEN** the returned array contains exactly one
  `inArray(recipes.currentVersionId, db.select(...).from(recipeTasteNotes).where(eq(recipeTasteNotes.tasteNoteId, 'some-uuid')))`
  condition

#### Scenario: Plural tasteNoteIds takes precedence

- **WHEN** `buildRecipeFilters({ tasteNoteIds: 'a,b', tasteNoteId: 'c' })`
  is called
- **THEN** the returned array contains two conditions (for `a` and `b`) and
  no condition referencing `c`

#### Scenario: /api/v1/recipes/starred honours singular tasteNoteId

- **WHEN** a `GET /api/v1/recipes/starred?tasteNoteId=<uuid>` request is
  processed
- **THEN** the resulting query includes the single-taste-note condition
  (previously dropped silently on this endpoint, fixed by D12)

#### Scenario: Singular tasteNoteId triggers Deprecation header (D28)

- **WHEN** a `GET /api/v1/recipes?tasteNoteId=<uuid>` (or
  `GET /api/v1/recipes/starred?tasteNoteId=<uuid>` with auth) request is
  processed
- **THEN** the SQL filter is applied as before AND the response includes
  the `Deprecation: true` header AND the service layer emits a
  `warn` log entry with `{ filter: 'tasteNoteId', userId, requestId }`

#### Scenario: Plural tasteNoteIds does not trigger Deprecation header (D28)

- **WHEN** a `GET /api/v1/recipes?tasteNoteIds=a,b` request is processed
- **THEN** the SQL filter is applied as before AND the response does NOT
  include the `Deprecation` header AND no deprecation `warn` log entry is
  emitted

#### Scenario: Cursor mode preserves Deprecation header (D28)

- **WHEN** a `GET /api/v1/recipes?tasteNoteId=<uuid>&cursor=<cursor>&sortBy=createdAt`
  request is processed
- **THEN** the response goes through the `cursorPaginated` branch AND still
  includes the `Deprecation: true` header — the header is not silently
  dropped in cursor mode