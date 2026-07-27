## Why

The existing `RecipeComparePage` shows two recipes side-by-side but gives no visual indication of
which parameters differ. Users must manually scan each row to spot differences. Additionally, there
is no way to cherry-pick the best parameters from each recipe into a new one — users must manually
copy values. F09 (version diff) is blocked on the `DiffHighlighter` component from this change.

## What Changes

- Add visual diff highlighting to the comparison page (differing parameters get accent colors + background highlight)
- Add a `POST /api/v1/recipes/merge` endpoint that creates a new draft recipe from selected parameters of two recipe versions
- Add `DiffHighlighter` and `MergeSelector` frontend components
- Add `RecipeMergeSchema` shared Zod schema
- Add `mergeRecipes` service function + `fetchRecipeVersionWithRelations` model function
- Add `recipeApi.merge()` typed client method
- Add `merge.*` i18n keys (en + tr)

## Capabilities

### New Capabilities

- `recipe-comparison`: Diff highlighting on the compare page and a merge endpoint/component to create a new draft recipe from cherry-picked parameters of two versions.

### Modified Capabilities

(none — this is purely additive; no existing spec-level behavior changes)

## Impact

- **API:** One new route (`POST /api/v1/recipes/merge`) on the existing recipe router
- **Shared:** New schema export (`RecipeMergeSchema`), 3 new i18n keys per locale
- **Frontend:** Two new components, updated `RecipeComparePage`, one new `recipeApi` method
- **Database:** No schema changes, no migrations — uses existing `recipeVersions` table
- **Dependencies:** F09 (version diff) depends on `DiffHighlighter` from this change
