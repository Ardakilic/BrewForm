# recipe-filter Specification

## Purpose

Defines the shared recipe filter-building helper used by every recipe-listing query in the API. The backend currently has two listing endpoints — the public `/api/v1/recipes` (`service.ts:listRecipes`) and `/api/v1/recipes/starred` (`model.ts:findStarred`) — both of which construct a Drizzle `WHERE` clause from the same eight filter keys (`brewMethod`, `drinkType`, `search`, `mainBrewer`, `coffeeVarietyId`, `equipmentId`, `tasteNoteIds`, plus the deprecated `tasteNoteId` singular). This capability establishes that the Drizzle `WHERE` fragments for those shared filters are produced by a single `buildRecipeFilters()` helper exported from `apps/api/src/modules/recipe/model.ts`, returning a typed `SQL[]` that callers compose with their own base conditions (visibility, favourites-scope, `authorId`) via Drizzle's `and(...)`. The helper delegates `coffeeVarietyId` to the existing `recipeCoffeeVarietyCondition()` helper, supports the deprecated singular `tasteNoteId` for backward compatibility with the public `RecipeFilterSchema`, and leaves visibility / favourite-scope / author conditions to the caller.
## Requirements
### Requirement: Shared recipe filter-building helper

The system SHALL provide a `buildRecipeFilters(filters: RecipeFilterCriteria): SQL[]`
function exported from `apps/api/src/modules/recipe/model.ts`. The
function SHALL handle every filter key defined on
`RecipeFilterCriteria`:

- `brewMethod?: BrewMethod`
- `drinkType?: DrinkType`
- `search?: string`
- `equipmentId?: string`
- `tasteNoteIds?: string` (comma-separated UUIDs)
- `tasteNoteId?: string` (deprecated, singular; backward compatibility)
- `mainBrewer?: string`
- `coffeeVarietyId?: string`

Each branch SHALL generate the exact same Drizzle condition structure
that `apps/api/src/modules/recipe/service.ts:listRecipes()` produced
prior to the refactor. Both `listRecipes()` (in `service.ts`) and
`findStarred()` (in `model.ts`) SHALL call this helper and SHALL NOT
contain any inline filter `if` blocks.

#### Scenario: listRecipes calls the helper

- **WHEN** `service.ts:listRecipes(filters)` is invoked with any
  filter combination
- **THEN** the function calls `model.buildRecipeFilters(filters)`
  exactly once and uses the returned array as the filter portion of
  its `WHERE` clause

#### Scenario: findStarred calls the helper

- **WHEN** `model.ts:findStarred(userId, filters, ...)` is invoked
  with any filter combination
- **THEN** the function calls `buildRecipeFilters(filters)` exactly
  once and uses the returned array as the filter portion of its
  `WHERE` clause

#### Scenario: No inline filter blocks remain in either call site

- **WHEN** `apps/api/src/modules/recipe/service.ts` and
  `apps/api/src/modules/recipe/model.ts` are inspected after the
  refactor
- **THEN** neither `listRecipes` nor `findStarred` contains any
  `if (filters.brewMethod)`, `if (filters.drinkType)`,
  `if (filters.search)`, `if (filters.mainBrewer)`,
  `if (filters.equipmentId)`, `if (filters.tasteNoteIds)`,
  `if (filters.tasteNoteId)`, or `if (filters.coffeeVarietyId)`
  branch

### Requirement: Caller composes base conditions

`buildRecipeFilters` SHALL NOT include visibility conditions,
favourite-scope conditions, `authorId` conditions, or any other
caller-specific base condition. The helper's return value SHALL
contain only conditions derived from `RecipeFilterCriteria`. Callers
SHALL prepend their own base conditions and compose the resulting
array with Drizzle's `and()`.

#### Scenario: Helper output omits visibility

- **WHEN** `buildRecipeFilters({ brewMethod: 'ESPRESSO' })` is called
- **THEN** the returned `SQL[]` contains exactly one condition (the
  `brewMethod` subquery) and does NOT contain any reference to
  `recipes.visibility`

#### Scenario: listRecipes prepends visibility condition

- **WHEN** `service.ts:listRecipes(filters)` composes its `WHERE`
  clause
- **THEN** the visibility condition (admin-aware) is prepended to
  the array returned by `buildRecipeFilters(filters)` before
  `and(...)` is applied

#### Scenario: findStarred prepends public visibility condition

- **WHEN** `model.ts:findStarred(userId, filters, ...)` composes its
  `WHERE` clause
- **THEN** `eq(recipes.visibility, 'public')` is prepended to the
  array returned by `buildRecipeFilters(filters)` before `and(...)`
  is applied

### Requirement: Type safety on the conditions array

The return type of `buildRecipeFilters` SHALL be `SQL[]`, not
`any[]`. Inside the helper, every value pushed to the local
`conditions` array SHALL be of type `SQL`. Where the helper invokes
Drizzle's `or()` (which returns `SQL | undefined`), the result SHALL
be assigned to a local variable and pushed only after a non-null
check.

After the refactor, `apps/api/src/modules/recipe/model.ts:findStarred()`
SHALL declare its local conditions array as `const conditions: SQL[]`
(not `const conditions: any[]`).

#### Scenario: Helper signature returns SQL[]

- **WHEN** TypeScript checks
  `apps/api/src/modules/recipe/model.ts`
- **THEN** the declared return type of `buildRecipeFilters` is
  `SQL[]` and the function body type-checks under that constraint

#### Scenario: findStarred conditions array is SQL[]

- **WHEN** `apps/api/src/modules/recipe/model.ts:findStarred` is
  inspected after the refactor
- **THEN** the local conditions array declaration reads
  `const conditions: SQL[]`

#### Scenario: search branch null-guards or()

- **WHEN** `buildRecipeFilters({ search: 'foo' })` is called
- **THEN** the result of `or(ilike(...), inArray(...))` is assigned
  to a local variable and pushed to `conditions` only when that
  variable is truthy

### Requirement: coffeeVarietyId delegates to the existing helper

When `coffeeVarietyId` is provided, `buildRecipeFilters` SHALL call
the existing exported `recipeCoffeeVarietyCondition()` helper in
`apps/api/src/modules/recipe/model.ts` and push its return value.
The helper SHALL NOT inline a duplicate `inArray(recipes.id,
db.select(...).from(recipeVersions).where(...))` subquery for this
filter.

#### Scenario: coffeeVarietyId branch delegates

- **WHEN** `buildRecipeFilters({ coffeeVarietyId: 'some-uuid' })` is
  called
- **THEN** the returned array contains exactly one condition, which
  is the value produced by `recipeCoffeeVarietyCondition('some-uuid')`

#### Scenario: findStarred inline coffeeVariety subquery is removed

- **WHEN** `apps/api/src/modules/recipe/model.ts:findStarred` is
  inspected after the refactor
- **THEN** the inline `inArray(recipes.id, db.select(...).from(recipeVersions).where(eq(recipeVersions.coffeeVarietyId, ...)))`
  block previously present at lines ~614–623 is absent

### Requirement: Deprecated tasteNoteId (singular) is honoured

`buildRecipeFilters` SHALL generate a single taste-note condition when
`tasteNoteId` (singular) is provided AND `tasteNoteIds` (plural) is NOT.
When both `tasteNoteIds` and `tasteNoteId` are provided, the plural
`tasteNoteIds` SHALL take precedence and `tasteNoteId` SHALL be ignored
(matching the existing `else if` branch in `listRecipes`).

This means `model.ts:findStarred()` — which previously dropped `tasteNoteId`
silently — SHALL pick up the deprecated singular filter for free after the
D12 refactor. This is an intentional parity fix against the public
`RecipeFilterSchema` contract.

**MODIFIED by D28:** In addition to applying the filter, the API response
for any request whose query used the deprecated singular `tasteNoteId`
without the plural `tasteNoteIds` SHALL include a `Deprecation: true` HTTP
response header per the [Deprecation signal for singular `tasteNoteId`
requirement above](#requirement-deprecation-signal-for-singular-tastenoteid).
The SQL behaviour itself is unchanged; only the response headers and the
service / model logging side-effect are added.

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
  (previously dropped silently on this endpoint)

#### Scenario: Singular tasteNoteId triggers Deprecation header (D28)

- **WHEN** a `GET /api/v1/recipes?tasteNoteId=<uuid>` (or
  `GET /api/v1/recipes/starred?tasteNoteId=<uuid>` with auth) request is
  processed
- **THEN** the SQL filter is applied as before AND the response includes
  the `Deprecation: true` header AND the service / model layer emits a
  `warn` log entry with `{ filter: 'tasteNoteId', userId, requestId }`

#### Scenario: Plural tasteNoteIds does not trigger Deprecation header (D28)

- **WHEN** a `GET /api/v1/recipes?tasteNoteIds=a,b` request is processed
- **THEN** the SQL filter is applied as before AND the response does NOT
  include the `Deprecation` header AND no deprecation `warn` log entry is
  emitted

### Requirement: Empty and sanitized filter inputs generate no condition

`buildRecipeFilters` SHALL treat empty or sanitization-stripped
inputs as "no filter":

- An empty `search` string, OR a `search` string that becomes empty
  after stripping `%` and `_` characters, SHALL generate no
  condition.
- An empty `mainBrewer` string, OR a `mainBrewer` string that
  becomes empty after stripping `%` and `_` characters, SHALL
  generate no condition.
- A `tasteNoteIds` string that is an empty string SHALL generate no
  condition. (Whitespace-only entries within a non-empty
  comma-separated list MAY still produce a condition, matching the
  legacy behaviour of `service.ts:listRecipes()`.)
- All other absent filter keys (`brewMethod`, `drinkType`,
  `equipmentId`, `coffeeVarietyId`, `tasteNoteId`) SHALL generate
  no condition when their value is `undefined` or empty string.

#### Scenario: Empty search is ignored

- **WHEN** `buildRecipeFilters({ search: '' })` is called
- **THEN** the returned array is empty

#### Scenario: Sanitization-stripped search is ignored

- **WHEN** `buildRecipeFilters({ search: '%_%' })` is called
- **THEN** the returned array is empty (the sanitized form is the
  empty string)

#### Scenario: Sanitization-stripped mainBrewer is ignored

- **WHEN** `buildRecipeFilters({ mainBrewer: '%' })` is called
- **THEN** the returned array is empty

#### Scenario: Empty filters object returns an empty array

- **WHEN** `buildRecipeFilters({})` is called
- **THEN** the returned array is exactly `[]`

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
filter branch, and the API SHALL NOT emit the `Deprecation` header and SHALL
NOT emit the `warn` log entry. This preserves the precedence contract
established by `apps/api/src/modules/recipe/service.ts:544-551` and by D12's
`buildRecipeFilters` helper.

The header value SHALL be the literal token `true`. The API SHALL NOT set a
`Sunset` companion header in Phase 1; the removal-date commitment that a
`Sunset` value implies belongs to Phase 2 / D29+.

The detection of the deprecated parameter SHALL live in the service / model
layer (the same layer that owns the `else if` branch), surfaced to the
controller via an optional `deprecations?: { tasteNoteId?: boolean }` field
on the listing return shape. The controller SHALL NOT re-derive the
precedence check; it SHALL set the header only when
`result.deprecations?.tasteNoteId === true`.

#### Scenario: Singular parameter returns Deprecation header

- **WHEN** a client sends `GET /api/v1/recipes?tasteNoteId=<uuid>` (no
  `tasteNoteIds` set)
- **THEN** the response status is `200`, the response includes the header
  `Deprecation: true`, and exactly one `warn` log entry is emitted with
  `{ filter: 'tasteNoteId', userId, requestId }`

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
  established by D12), no `Deprecation` header is set, and no deprecation
  `warn` log entry is emitted

#### Scenario: Neither parameter set — no Deprecation header

- **WHEN** a client sends `GET /api/v1/recipes` with no taste-note filter
- **THEN** the response status is `200`, no `Deprecation` header is set, and
  no deprecation `warn` log entry is emitted

#### Scenario: Starred endpoint behaves identically

- **WHEN** any of the above requests is sent to `GET /api/v1/recipes/starred`
  instead of `GET /api/v1/recipes` (with appropriate auth)
- **THEN** the same `Deprecation` header and `warn` log behaviour applies on
  the starred endpoint, because both controllers consume the same
  `deprecations` flag on the service / model return shape

#### Scenario: Detection lives in service / model, not the controller

- **WHEN** the implementation of `apps/api/src/modules/recipe/index.ts:42-55`
  and `apps/api/src/modules/recipe/index.ts:72-82` is inspected
- **THEN** neither controller contains a reference to `filters.tasteNoteId`;
  both controllers determine whether to set the `Deprecation` header solely
  by checking `result.deprecations?.tasteNoteId === true`

### Requirement: Schema annotation for `tasteNoteId`

The `RecipeFilterSchema.tasteNoteId` field SHALL carry a JSDoc `@deprecated`
tag and a Zod `.meta({ deprecated: true })` call in
`packages/shared/src/schemas/recipe.ts`. The JSDoc tag SHALL name the
canonical replacement (`tasteNoteIds`) and reference the D28 change folder.
The annotation SHALL be visible to TypeScript and OpenAPI
consumers via the existing toolchain (i.e., it SHALL be a real `@deprecated`
JSDoc tag, not only an inline comment).

#### Scenario: Schema field carries @deprecated JSDoc tag

- **WHEN** the source of `packages/shared/src/schemas/recipe.ts` is inspected
  at the `tasteNoteId` field declaration (currently lines 134-135)
- **THEN** the field's JSDoc block contains an `@deprecated` tag, the prose
  references `tasteNoteIds` as the replacement, and the prose names the D28
  OpenSpec change

#### Scenario: Deprecation visible to generated consumers

- **WHEN** TypeScript inference is exercised against
  `z.infer<typeof RecipeFilterSchema>` (or the generated OpenAPI document at
  `GET /api/v1/openapi.json`)
- **THEN** the `tasteNoteId` field is reported as deprecated by the
  toolchain (e.g., editor strikethrough on `RecipeFilterSchema.shape.tasteNoteId`,
  or `deprecated: true` in the OpenAPI parameter description)

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
`findStarred` (or `listStarredRecipes`) so that parity between the two
endpoints established by D12 is preserved by D28.

An optional controller-level smoke test MAY use Hono's test client to assert
the presence (or absence) of the `Deprecation: true` HTTP header on a real
request/response pair. This test is not required by the spec but is
encouraged.

#### Scenario: Four service-level cases exist

- **WHEN** `apps/api/src/modules/recipe/recipe-filter-deprecation.test.ts`
  is inspected
- **THEN** it contains a `describe` block for `listRecipes` with one `it`
  per case (singular-only, plural-only, both, neither) and a second
  `describe` block for `findStarred` / `listStarredRecipes` with the same
  four cases

#### Scenario: Tests pass under `make test-api`

- **WHEN** `make test-api` is invoked on a clean checkout that includes the
  D28 changes (with D12 already merged)
- **THEN** every test in
  `apps/api/src/modules/recipe/recipe-filter-deprecation.test.ts` passes
  and no pre-existing test regresses

