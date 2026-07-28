## Why

Users edit recipes over time but have no way to see *what* changed between versions. The version history page lists versions but offers no comparison. F08 shipped the `DiffHighlighter` component and merge endpoint for cross-recipe comparison — F09 extends this to same-recipe version-to-version diff, the highest-impact remaining P0 feature.

## What Changes

- New `GET /api/v1/recipes/:slug/versions/diff?v1=&v2=` endpoint returning a field-by-field diff payload
- New `diffVersions` service function comparing scalar fields, taste notes, and equipment between two versions
- New `VersionDiffOutputSchema` in shared response schemas (typed boundary per D42)
- New `VersionDiffPage` frontend page with color-coded diff rendering
- Extend `DiffHighlighter` with optional `status` prop (added/removed/modified/unchanged) while preserving existing `labelKey` i18n API
- Add version selection checkboxes + "Compare Selected" button to `RecipeVersionsPage`
- New router entry for `/recipes/:slug/versions/diff`
- CSS variables for diff status colors in all 3 theme blocks
- i18n keys (en + tr) for diff page chrome and field labels

## Capabilities

### New Capabilities

- `version-diff`: Field-by-field comparison between two versions of the same recipe — API endpoint, service logic, shared output schema, and frontend diff view.

### Modified Capabilities

- `web-shared-components`: DiffHighlighter gains an optional `status` prop for color-coded rendering (backward-compatible; existing `labelKey` API unchanged).

## Impact

- **API**: `apps/api/src/modules/recipe/` — new route, service function, model reuse
- **Shared**: `packages/shared/src/schemas/responses/recipe.ts` — new `VersionDiffOutputSchema`
- **Web**: new page, router entry, DiffHighlighter extension, RecipeVersionsPage checkboxes, CSS vars, i18n
- **No DB changes**: all fields exist on `recipe_version`; no new tables or columns
- **OpenAPI**: new route documented per AGENTS.md mandate; coverage test must pass
