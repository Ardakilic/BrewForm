## Context

The recipe fork feature has a fully implemented backend (API endpoint, service, model, Zod schema) and a fully implemented API client (`recipeApi.fork()`). Both `RecipeDetailPage.tsx:209` and `ForkCard.tsx:16` already contain navigation to `/recipes/:id/fork`. The only missing piece is the route definition in `apps/web/src/router.tsx`.

The plan at `plans/D04-fork-navigation-fix.md` provides two options. We choose **Option A** (dedicated fork page) because it:
- Provides a better UX with title customisation
- Handles errors gracefully with a dedicated error state
- Follows the pattern of other creation flows (`RecipeCreatePage`, `RecipeEditPage`)
- Requires zero changes to existing components (ForkCard, RecipeDetailPage)

## Goals / Non-Goals

**Goals:**
- Make the fork button functional — clicking it renders a fork confirmation page instead of a 404
- Allow users to optionally customize the fork title (capped at 200 chars)
- Navigate to the new recipe's edit page on successful fork
- Handle loading, error, and race-condition (double-click) states
- Include `noIndex` SEO meta (transient action page)

**Non-Goals:**
- Refactoring the fork API endpoint or service
- Changing the ForkCard or RecipeDetailPage components
- Adding fork to the recipe list or search flows
- E2E tests (out of scope for this fix)

## Decisions

### 1. Fork page loads source recipe via `recipeApi.get(id)`

The fork page needs the source recipe title to pre-fill the fork name (`"Fork of <original title>"`). `recipeApi.get()` accepts both slug and UUID — the route uses UUID (`:id`), so this works. Response type is `RecipeDetailResponse` which includes `.title`.

### 2. Post-fork navigation uses UUID, not slug

The fork page navigates to `/recipes/${result.id}/edit`. The `:id/edit` route expects a UUID. This matches the existing edit button convention in `RecipeDetailPage.tsx:225`: `to={`/recipes/${recipe.id}/edit`}`. While CreatePage and EditPage navigate by slug to the detail view, the fork page navigates to the **edit** route specifically, which uses UUID.

### 3. `noIndex` SEO meta

The fork page is a transient action page (not content for search engines), so `<SEOHead noIndex />` is appropriate. This follows the precedent of other action pages in the app.

### 4. Button disabled during API call

`forking` state tracks the API call. While `forking === true`, the submit button is `disabled`. This prevents double-submission race conditions.

### 5. Route ordering: after `recipes/:id/edit`

The new fork route is placed directly after the `recipes/:id/edit` block in `router.tsx`. React Router v7 uses specificity-based matching — `:id/fork` is more specific than `:slug`, so no conflicts with existing slug-based routes.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| `recipeApi.get(id)` fails (source recipe not found) | Show `setError('Failed to load recipe')` — user sees error state |
| `recipeApi.fork()` fails (403 forbidden on private recipe) | Show error message from API response — user sees error state |
| Double-click submits duplicate fork | Button disabled (`forking === true`) during API call |
| User clears fork title entirely | Pass `undefined` (not empty string) — server defaults to `"Fork of <original title>"` |
