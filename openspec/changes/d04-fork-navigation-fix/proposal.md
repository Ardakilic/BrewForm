## Why

The "Fork Recipe" button on the recipe detail page and ForkCard sidebar navigates to `/recipes/:id/fork`, but no route is registered for this path. Authenticated non-owners who click it get a 404. The entire backend fork stack (API endpoint, service, model), the API client (`recipeApi.fork()`), and all UI components (ForkCard, detail page button) are fully implemented — only the router entry is missing.

## What Changes

- Add a new `recipes/:id/fork` route in the router, guarded by `RequireAuth`
- Create a new `RecipeForkPage` component that fetches the source recipe title, shows a confirmation form with an optional custom fork title (capped at 200 chars), calls `recipeApi.fork()`, and navigates to the new recipe's edit page on success
- No changes needed to `RecipeDetailPage.tsx`, `ForkCard.tsx`, or the API client

## Capabilities

### New Capabilities

- `recipe-fork-page`: A dedicated page for forking a recipe, allowing users to preview the source recipe name and optionally customize the fork title before committing. Replaces the broken direct navigation with a working fork flow.

### Modified Capabilities

<!-- None — no existing capability requirements are changing -->

## Impact

- **New file:** `apps/web/src/pages/recipes/RecipeForkPage.tsx`
- **Modified file:** `apps/web/src/router.tsx` — add one route entry
- **No API, shared, or DB changes** — backend fork stack is already implemented
