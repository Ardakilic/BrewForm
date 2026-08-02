# version-diff Specification

## Purpose
TBD - created by archiving change f09-version-diff. Update Purpose after archive.
## Requirements
### Requirement: Diff endpoint

The system SHALL expose `GET /api/v1/recipes/:slug/versions/diff?v1=<uuid>&v2=<uuid>`.

- Auth: optional (public recipes viewable by anyone; private/draft only by author or admin)
- The endpoint SHALL return a JSON envelope with the diff payload
- Query params `v1` and `v2` MUST be required UUIDs identifying two `recipe_version` rows
- Both versions MUST belong to the recipe identified by `:slug`
- The endpoint SHALL reject `v1 === v2` with 400 VALIDATION_ERROR
- Response SHALL be `VersionDiffOutputSchema` wrapped in `successEnvelope`
- The route MUST be registered BEFORE the catch-all `/:slugOrId` route (same ordering as `/:slug/versions`)

#### Scenario: Public recipe diff by anonymous user

- Given a public recipe with 3 versions
- When an anonymous user requests diff between v1 and v3
- Then the response is 200 with the full diff payload

#### Scenario: Private recipe diff by non-author

- Given a private recipe owned by user A
- When user B requests a version diff
- Then the response is 404 NOT_FOUND (existence-hiding)

#### Scenario: Missing query params

- Given a public recipe
- When a request omits `v2`
- Then the response is 400 VALIDATION_ERROR

#### Scenario: Same version requested twice

- Given a public recipe with version v1
- When a request sets both `v1` and `v2` to the same UUID
- Then the response is 400 VALIDATION_ERROR

### Requirement: Diff payload structure

The diff payload SHALL have the following structure:

```
{
  version1: { id, versionNumber, brewDate },
  version2: { id, versionNumber, brewDate },
  fields: DiffField[],
  tasteNotes: { added: string[], removed: string[], unchanged: string[] },
  equipment: { added: string[], removed: string[], unchanged: string[] }
}
```

Where `DiffField`:
```
{ field: string, value1: string|number|null, value2: string|number|null, status: 'added'|'removed'|'modified'|'unchanged' }
```

- `field` is a machine key (e.g. `"brewMethod"`), NOT a translated label
- 20 scalar fields compared: brewMethod, drinkType, productName, coffeeBrand, coffeeProcessing, grindSize, grinder, brewerDetails, groundWeightGrams, extractionTimeSeconds, extractionVolumeMl, temperatureCelsius, brewRatio, flowRate, preInfusionTimeSeconds, tds, preparationNotes, personalNotes, rating, emojiTag
- `tds` serialized as string (postgres-js numeric behavior)
- Taste notes and equipment diffed by join-table ID membership

#### Scenario: Field added between versions

- Given v1 has `grindSize: null` and v2 has `grindSize: "medium"`
- When diff is computed
- Then the field entry has `status: 'added'`, `value1: null`, `value2: "medium"`

#### Scenario: Taste note removed

- Given v1 has taste note "Chocolate" and v2 does not
- When diff is computed
- Then `tasteNotes.removed` contains "Chocolate"

### Requirement: Authorization

The system SHALL use `canViewRecipe(recipe, userId, isAdmin)` for authorization — same as sibling `/:slug/versions` route.
Non-visible recipes SHALL return 404 (existence-hiding), not 403.

#### Scenario: Admin views private recipe diff

- Given a private recipe and an admin user
- When the admin requests a version diff
- Then the response is 200 (admin bypass via canViewRecipe)

### Requirement: Error responses

The endpoint SHALL return the following error responses:

| Condition | Status | Code |
|-----------|--------|------|
| Missing v1/v2 params | 400 | VALIDATION_ERROR |
| v1 === v2 (same version) | 400 | VALIDATION_ERROR |
| Recipe not found | 404 | NOT_FOUND |
| Recipe not visible | 404 | NOT_FOUND |
| Version not found or wrong recipe | 404 | VERSION_NOT_FOUND |

#### Scenario: Version belongs to different recipe

- Given recipe A and recipe B each with versions
- When requesting diff with v1 from recipe A and v2 from recipe B
- Then the response is 404 VERSION_NOT_FOUND

### Requirement: OpenAPI documentation

The route MUST include full `describeRoute()` with `resolver(successEnvelope(VersionDiffOutputSchema))`.
The route MUST include `resolver(ErrorEnvelopeSchema)` for 400, 401, 404.
The route MUST include a `parameters` array for `v1` and `v2` query params.
The implementation MUST pass `openapi.coverage.test.ts`.

#### Scenario: Coverage test passes

- Given the new route is registered
- When `openapi.coverage.test.ts` runs
- Then the route is documented, tagged, and no orphan tags exist

### Requirement: Shared output schema

The system SHALL define `VersionDiffOutputSchema` in `packages/shared/src/schemas/responses/recipe.ts`.
The schema MUST be exported from barrel `packages/shared/src/schemas/index.ts`.
The schema SHALL include `DiffFieldSchema` with `field`, `value1`, `value2`, `status` (enum).
The schema SHALL include `VersionMetaSchema` with `id`, `versionNumber`, `brewDate`.
The schema SHALL include `ListDiffSchema` with `added`, `removed`, `unchanged` (string arrays).

#### Scenario: Schema validates correct payload

- Given a well-formed diff payload
- When parsed with `VersionDiffOutputSchema`
- Then it succeeds without errors

#### Scenario: Schema rejects invalid status

- Given a diff field with `status: "changed"`
- When parsed with `VersionDiffOutputSchema`
- Then it throws a validation error

### Requirement: Frontend — VersionDiffPage

The system SHALL provide a `VersionDiffPage` at route `/recipes/:slug/versions/diff?v1=&v2=`.
The page MUST be lazy-loaded in the router (same pattern as compare page).
The page SHALL fetch via typed `recipeApi.diffVersions(slug, v1, v2)`.
The page SHALL render scalar fields via `DiffHighlighter` (with `status` prop).
The page SHALL render taste notes / equipment via an inline `DiffTagList` component.
The page MUST use unit-aware formatting via `useUnitSystem` + `formatWeight`/`formatVolume`/`formatTemperature`.
Field labels MUST be translated client-side via i18n keys (D40).
The page MUST use `PageContainer`, `LoadingState`, `EmptyState`, `Breadcrumb` (existing UI components).
The page MUST include mount/unmount debug logging via `createLogger`.

#### Scenario: Page renders diff with color coding

- Given two versions with modified grindSize and added taste note
- When the diff page loads
- Then grindSize row shows modified color and taste note appears in "added" section

### Requirement: Frontend — DiffHighlighter extension

The component SHALL accept an optional `status?: 'added' | 'removed' | 'modified' | 'unchanged'` prop.
When `status` is provided, the component MUST use status-specific CSS vars for background/text color.
When `status` is absent, the component MUST preserve existing binary differs-only behavior (backward compat).
The existing `labelKey` prop and `useTranslation` usage SHALL remain unchanged.
`RecipeComparePage` MUST be unaffected.

#### Scenario: Backward compatibility

- Given RecipeComparePage renders DiffHighlighter without status prop
- When the component renders
- Then it uses the existing binary highlight behavior (unchanged)

#### Scenario: Status prop drives colors

- Given DiffHighlighter rendered with `status="added"`
- When the component renders
- Then background uses `--diff-added-bg` and text uses `--diff-added-text`

### Requirement: Frontend — RecipeVersionsPage selection

The page SHALL display a checkbox on each version row (max 2 selectable).
A "Compare Selected" button/link MUST appear when exactly 2 versions are selected.
The link SHALL navigate to `/recipes/:slug/versions/diff?v1=<id1>&v2=<id2>`.
The button label MUST use an i18n key.

#### Scenario: Select two versions and navigate

- Given the versions page with 3 versions
- When user checks v1 and v3
- Then "Compare Selected" link appears pointing to `/recipes/:slug/versions/diff?v1=<v1id>&v2=<v3id>`

### Requirement: CSS variables

The system SHALL define 6 new CSS variables in all 3 theme blocks (`globals.css`):
- `--diff-added-bg`, `--diff-added-text`
- `--diff-removed-bg`, `--diff-removed-text`
- `--diff-modified-bg`, `--diff-modified-text`

#### Scenario: Dark theme has diff colors

- Given the dark theme block in globals.css
- When inspected
- Then all 6 diff variables are defined with dark-appropriate values

### Requirement: i18n

The system SHALL add en.json + tr.json keys for: page title, "Parameters", "Taste Notes", "Equipment", "Compare Selected", "Version Diff".
Field label keys MUST reuse existing `recipe.*` keys where available; missing ones (productName, coffeeBrand, coffeeProcessing, flowRate, preInfusionTimeSeconds, tds, emojiTag, notes) SHALL be added.

#### Scenario: Turkish locale renders page chrome

- Given locale is `tr`
- When VersionDiffPage renders
- Then all chrome strings display in Turkish

### Requirement: Tests

The implementation MUST include the following test files:
- Schema test: `packages/shared/src/schemas/recipe.version-diff.test.ts`
- Service test: `apps/api/src/modules/recipe/diff.test.ts`
- Route test: `apps/api/src/modules/recipe/diff.route.test.ts` (requires `brewform_test` DB provisioned)
- Component test: extend `DiffHighlighter.test.tsx` for status prop
- Page test: `apps/web/src/pages/recipes/VersionDiffPage.test.tsx`
- RecipeVersionsPage test: extend existing or add `RecipeVersionsPage.test.tsx` for checkbox/compare flow

#### Scenario: All tests pass

- Given the implementation is complete
- When `make test` runs
- Then all new and existing tests pass

### Requirement: Code documentation

All new public functions, service methods, model functions, and React components MUST include JSDoc/TSDoc docblocks describing purpose, parameters, and return values.
The `diffVersions` service function MUST include entry/exit structured debug logging per AGENTS.md (`log.debug({ recipeId, v1Id, v2Id }, 'diffVersions started')` / `'diffVersions completed'`).
Error paths MUST log with `log.error({ err, recipeId }, 'diffVersions failed')`.

#### Scenario: Service function has docblock and logging

- Given the `diffVersions` function in `service.ts`
- When inspected
- Then it has a TSDoc block with @param/@returns, a `log.debug` at entry, a `log.debug` at exit, and a `log.error` in the catch path

