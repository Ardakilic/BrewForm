# Tasks — f09-version-diff

## Phase 1: Shared schema + API

- [x] **T1**: Add `VersionDiffOutputSchema` (+ `DiffFieldSchema`, `VersionMetaSchema`, `ListDiffSchema`) to `packages/shared/src/schemas/responses/recipe.ts` with TSDoc docblocks; export from barrel
- [x] **T2**: Add schema unit test `packages/shared/src/schemas/recipe.version-diff.test.ts` (valid payload, invalid status enum, missing fields)
- [x] **T3**: Add `diffVersions(recipeId, v1Id, v2Id)` to `apps/api/src/modules/recipe/service.ts` with TSDoc docblock + entry/exit/error structured logging — reuse `model.fetchRecipeVersionWithRelations`, assert same recipe, reject v1===v2, compare 20 scalar fields + taste notes + equipment
- [x] **T4**: Add service test `apps/api/src/modules/recipe/diff.test.ts` (happy path, same-version guard, cross-recipe guard, all-null fields, taste/equipment set diffs)
- [x] **T5**: Add `GET /:slug/versions/diff` route to `apps/api/src/modules/recipe/index.ts` — register BEFORE catch-all `/:slugOrId`; `optionalAuthGuard`, `canViewRecipe`, v1===v2 → 400, full OpenAPI `describeRoute()` with `resolver(successEnvelope(VersionDiffOutputSchema))` + error envelopes + `parameters`
- [x] **T6**: Add route test `apps/api/src/modules/recipe/diff.route.test.ts` (auth, visibility, admin bypass, 400 missing params, 400 same version, 404 wrong recipe, happy path) — requires `brewform_test` DB

## Phase 2: Frontend

- [x] **T7**: Extend `DiffHighlighter` with optional `status` prop + status-specific CSS var colors; preserve existing `labelKey` behavior when status absent; add TSDoc to component + props interface
- [x] **T8**: Extend `DiffHighlighter.test.tsx` — status prop rendering (all 4 statuses), backward compat (no status prop)
- [x] **T9**: Add CSS variables (`--diff-added-bg/text`, `--diff-removed-bg/text`, `--diff-modified-bg/text`) to all 3 theme blocks in `globals.css`
- [x] **T10**: Add typed `recipeApi.diffVersions(slug, v1, v2)` method to `apps/web/src/api/index.ts` with TSDoc
- [x] **T11**: Create `VersionDiffPage.tsx` with TSDoc — fetch diff, render via DiffHighlighter + DiffTagList, unit formatting, i18n labels, PageContainer/LoadingState/EmptyState/Breadcrumb, mount/unmount logger
- [x] **T12**: Add page test `apps/web/src/pages/recipes/VersionDiffPage.test.tsx` (loading, error, render with statuses, unit formatting)
- [x] **T13**: Add router entry for `recipes/:slug/versions/diff` (lazy import, near compare route, BEFORE `:slug` catch-all)
- [x] **T14**: Add version selection checkboxes + "Compare Selected" link to `RecipeVersionsPage.tsx` with TSDoc on new helpers
- [x] **T15**: Add/extend `RecipeVersionsPage.test.tsx` — checkbox selection (max 2), compare link visibility + href
- [x] **T16**: Add i18n keys to `en.json` + `tr.json` (page chrome + missing field labels)

## Phase 3: Verification

- [x] **T17**: `make check` — type-check all workspaces
- [x] **T18**: `make lint` — lint all apps/packages
- [x] **T19**: `make fmt` — format
- [x] **T20**: `make test` — full test suite (includes `openapi.coverage.test.ts`)
