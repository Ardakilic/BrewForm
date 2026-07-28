# Tasks — F08 Recipe Comparison Improvements

## Phase 1: Shared Schema + i18n

- [x] 1.1 Add `RecipeMergeSchema` + `RecipeMerge` type to `packages/shared/src/schemas/recipe.ts`
- [x] 1.2 Export `RecipeMergeSchema` and `RecipeMerge` from `packages/shared/src/schemas/index.ts`
- [x] 1.3 Add `merge.selectParams`, `merge.create`, `merge.button` keys to `packages/shared/src/i18n/en.json`
- [x] 1.4 Add `merge.selectParams`, `merge.create`, `merge.button` keys to `packages/shared/src/i18n/tr.json`
- [x] 1.5 Write schema validation tests in `packages/shared/src/schemas/recipe.merge.test.ts` (valid payload, empty selections, invalid UUID, empty title, title >200, invalid enum `'v3'`, `'both'`/`'none'` for array fields, reject `'both'` for scalar fields)
- [x] 1.6 Run `make check-shared && make test-shared` — verify green

## Phase 2: API Model + Service

- [x] 2.1 Add `fetchRecipeVersionWithRelations(versionId)` to `apps/api/src/modules/recipe/model.ts` (with JSDoc, uses existing `db` + `recipeVersions` + `eq` imports)
- [x] 2.2 Add `mergeRecipes(authorId, data)` + private `getMergedIds` + private `getMergedPreparations` to `apps/api/src/modules/recipe/service.ts` (delegates to existing `createRecipe`; taste note intensities default to 1 — do NOT pass `tasteNoteIntensities`)
- [x] 2.3 Add structured logging: entry `log.debug({ authorId }, 'mergeRecipes started')`, exit `log.debug({ authorId, recipeId }, 'mergeRecipes completed')`, error `log.error({ err, authorId }, 'mergeRecipes failed')` — never log the payload
- [x] 2.4 Write service + model tests in `apps/api/src/modules/recipe/merge.test.ts` (draft creation, v2 picks, 'both' dedup, 'none' empty, RECIPE_NOT_FOUND throw, v1 fallback for unselected required fields, getMergedIds unit cases, getMergedPreparations unit cases, model returns relations, model returns undefined for missing)
- [x] 2.5 Run `make check-api && make test-specific filter=apps/api/src/modules/recipe/merge.test.ts` — verify green

## Phase 3: API Route + OpenAPI

- [x] 3.1 Add `POST /merge` route to `apps/api/src/modules/recipe/index.ts` — MUST be placed AFTER `POST /` (create) and BEFORE `GET /:slugOrId` to avoid path param capture
- [x] 3.2 Route handler: `isEmailVerified(c)` gate (403 EMAIL_NOT_VERIFIED) → `service.mergeRecipes` → catch `RECIPE_NOT_FOUND` (404) and `FORBIDDEN` (403) → `success(c, merged, 201)`
- [x] 3.3 Full `describeRoute` with: `tags: ['Recipes']`, `security: [{ bearerAuth: [] }]`, `requestBody: jsonRequestBody(RecipeMergeSchema)`, responses 201/400/401/403/404 using `resolver(successEnvelope(RecipeDetailOutputSchema))` and `resolver(ErrorEnvelopeSchema)`
- [x] 3.4 Import `RecipeMergeSchema` from `@brewform/shared/schemas` (`isEmailVerified` already imported at line 31)
- [x] 3.5 Write route integration tests in `apps/api/src/modules/recipe/merge.route.test.ts` (201 success envelope, 401 no auth, 403 unverified email, 404 missing version, 400 invalid payload)
- [x] 3.6 Run `make test-specific filter=openapi.coverage.test.ts` — verify merge route is documented, tagged `Recipes`, no orphan tags
- [x] 3.7 Run `make check-api && make test-api` — verify green

## Phase 4: Frontend Components

- [x] 4.1 Create `apps/web/src/components/recipe/DiffHighlighter.tsx` (three-column grid, `--diff-highlight` background on diff, accent colors, `formatter` prop, `useTranslation`)
- [x] 4.2 Create `apps/web/src/components/recipe/MergeSelector.tsx` (radio buttons per field, `onMerge` callback, `card` + `btn-primary` classes, `useTranslation`)
- [x] 4.3 Add `--diff-highlight` CSS variable to `apps/web/src/styles/globals.css` in all three theme blocks (`:root`, `.dark`, `.coffee`)
- [x] 4.4 Write `apps/web/src/components/recipe/DiffHighlighter.test.tsx` (highlights diffs, no highlight on identical, formatter usage, dash for null)
- [x] 4.5 Write `apps/web/src/components/recipe/MergeSelector.test.tsx` (renders radios, onMerge with selections, onMerge with empty object)
- [x] 4.6 Run web tests — verify green

## Phase 5: Frontend Integration

- [x] 5.1 Add `recipeApi.merge(body: RecipeMerge)` to `apps/web/src/api/index.ts` (import `RecipeMerge` + `RecipeDetailOutput` from `@brewform/shared/schemas`)
- [x] 5.2 Update `RecipeComparePage.tsx`: change `CompareTable` signature from single-recipe to `{ v1, v2 }` dual-version props; replace private `CompareRow` with `DiffHighlighter` rows; preserve `labelFor(BREW_METHODS/DRINK_TYPES)` as `formatter` prop
- [x] 5.3 Add merge flow: `showMerge` + `mergeError` state, "Merge Recipes" button, `MergeSelector` overlay, `handleMerge` with try/catch + `setMergeError`, navigate to `/recipes/${merged.id}/edit` on success
- [x] 5.4 Add `createLogger('RecipeComparePage')` mount/unmount logging via `useEffect`
- [x] 5.5 Write `apps/web/src/pages/recipes/RecipeComparePage.test.tsx` (diff highlighting renders, merge button visible, merge flow calls API + navigates, error state on API failure)
- [x] 5.6 Run `make check-web` — verify green

## Phase 6: Final Verification

- [x] 6.1 Run `make fmt`
- [x] 6.2 Run `make check` (all workspaces)
- [x] 6.3 Run `make lint`
- [x] 6.4 Run `make test` (full suite)
- [x] 6.5 Verify OpenAPI spec at `/api/v1/openapi.json` includes `POST /api/v1/recipes/merge` with 201/400/401/403/404
