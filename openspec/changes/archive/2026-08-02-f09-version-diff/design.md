## Architecture

Standard 3-layer API pattern (model → service → route) + shared schema + frontend page.

```
┌─────────────────────────────────────────────────────────────────────┐
│  GET /api/v1/recipes/:slug/versions/diff?v1=<uuid>&v2=<uuid>        │
├─────────────────────────────────────────────────────────────────────┤
│  Route (index.ts)                                                   │
│    ├── optionalAuthGuard                                            │
│    ├── getRecipe(slug) → canViewRecipe(recipe, userId, isAdmin)     │
│    └── service.diffVersions(recipeId, v1Id, v2Id)                   │
├─────────────────────────────────────────────────────────────────────┤
│  Service (service.ts)                                               │
│    ├── model.fetchRecipeVersionWithRelations(v1Id)  ← F08 reuse    │
│    ├── model.fetchRecipeVersionWithRelations(v2Id)  ← F08 reuse    │
│    ├── assert both belong to recipeId (cross-recipe guard)          │
│    ├── scalar field comparison (20 fields)                          │
│    ├── taste note set diff (added/removed/unchanged)                │
│    └── equipment set diff (added/removed/unchanged)                 │
├─────────────────────────────────────────────────────────────────────┤
│  Response: VersionDiffOutputSchema (packages/shared)                │
│    { version1, version2, fields[], tasteNotes{}, equipment{} }      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  Frontend                                                           │
├─────────────────────────────────────────────────────────────────────┤
│  RecipeVersionsPage                                                 │
│    └── checkboxes (max 2) + "Compare Selected" Link                 │
│                                                                     │
│  /recipes/:slug/versions/diff?v1=&v2=                               │
│    └── VersionDiffPage                                              │
│         ├── recipeApi.diffVersions(slug, v1, v2)                    │
│         ├── DiffHighlighter (extended: +status prop)                │
│         ├── DiffTagList (inline: taste notes / equipment)           │
│         └── formatValue (unit-aware via useUnitSystem)              │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Decisions

### D1: Reuse `fetchRecipeVersionWithRelations` (F08 model function)

The plan proposed a new `getRecipeVersionsForDiff` model function. F08's `fetchRecipeVersionWithRelations(versionId)` loads the same relations (tasteNotes, equipment, additionalPreparations, recipe). Call it twice; add a `recipeId` assertion in the service. No new model function needed.

### D2: Extend DiffHighlighter, don't rewrite

F08 shipped `DiffHighlighter` with `labelKey` (i18n key) + binary differs-only highlighting. F09 adds an optional `status?: 'added' | 'removed' | 'modified' | 'unchanged'` prop. When provided, use status-specific colors; when absent, fall back to existing binary behavior. `RecipeComparePage` is unaffected.

### D3: Return field keys, translate client-side (D40 i18n)

The service returns `field` (machine key, e.g. `"brewMethod"`), not English labels. The frontend maps field → i18n key via a lookup (same pattern as `RecipeComparePage.tsx:220-275`). New i18n keys needed: `versionDiff.*` page chrome + any uncovered field labels.

### D4: Typed boundary (D42)

New `VersionDiffOutputSchema` in `packages/shared/src/schemas/responses/recipe.ts`. Typed `recipeApi.diffVersions()` method. No page-local interfaces.

### D5: `canViewRecipe` for authorization

Use `service.canViewRecipe(recipe, userId, isAdmin)` — same as the sibling `/:slug/versions` route. No hand-rolled visibility checks.

### D6: OpenAPI per AGENTS.md

Full `describeRoute()` with `resolver(successEnvelope(VersionDiffOutputSchema))`, `resolver(ErrorEnvelopeSchema)` for 400/401/404, and `parameters` for `v1`/`v2` query params. Copy merge endpoint pattern.

### D7: CSS vars in all 3 theme blocks

`globals.css` has light/dark/third theme blocks (lines ~55, ~75, ~95). New `--diff-added-bg`, `--diff-added-text`, `--diff-removed-bg`, `--diff-removed-text`, `--diff-modified-bg`, `--diff-modified-text` go in all three.

### D8: No `additionalPreparations` diff

The plan loads `additionalPreparations` but never diffs them. Drop from scope — the relation is loaded by `fetchRecipeVersionWithRelations` anyway (no extra query cost), but the diff output only covers scalar fields + taste notes + equipment.

## Scalar Fields (20)

`brewMethod`, `drinkType`, `productName`, `coffeeBrand`, `coffeeProcessing`, `grindSize`, `grinder`, `brewerDetails`, `groundWeightGrams`, `extractionTimeSeconds`, `extractionVolumeMl`, `temperatureCelsius`, `brewRatio`, `flowRate`, `preInfusionTimeSeconds`, `tds`, `preparationNotes`, `personalNotes`, `rating`, `emojiTag`

Note: `tds` is `z.string().nullable()` (numeric → string via postgres-js).

## Error Handling

| Condition | Response |
|-----------|----------|
| Missing `v1`/`v2` query params | 400 VALIDATION_ERROR |
| Recipe not found | 404 NOT_FOUND |
| Recipe not visible to caller | 404 NOT_FOUND (existence-hiding) |
| Version not found / wrong recipe | 404 VERSION_NOT_FOUND |
| Unauthenticated on private recipe | 404 (via canViewRecipe) |

## Testing Strategy

- `packages/shared/src/schemas/recipe.version-diff.test.ts` — schema validation
- `apps/api/src/modules/recipe/diff.test.ts` — service unit tests (diff logic, edge cases)
- `apps/api/src/modules/recipe/diff.route.test.ts` — route integration (auth, visibility, 400/404)
- `apps/web/src/components/recipe/DiffHighlighter.test.tsx` — extend existing test for status prop
- `apps/web/src/pages/recipes/VersionDiffPage.test.tsx` — page render + formatting
