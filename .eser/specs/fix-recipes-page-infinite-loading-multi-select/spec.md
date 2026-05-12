# Spec: fix-recipes-page-infinite-loading-multi-select

## Status: completed

## Concerns: well-engineered, beautiful-product, open-source

## Discovery Answers

### status_quo

Today, users visiting the /recipes page experience three issues: (1) The page enters an infinite request loop to /api/v1/recipes?page=1&perPage=12&sortBy=createdAt, making the page unusable. The browser network tab shows hundreds of identical requests. (2) The Taste Notes multi-select dropdown trigger has rounded-full pill styling with px-3 py-1, while every other native <select> filter uses the input-field class (rounded-lg, 0.5rem 0.75rem padding), creating visual inconsistency. (3) Active filter badges (equipment, taste notes) appear at the bottom of the sidebar below the Sort dropdown, far from the Filters heading, making it hard for users to see what filters are active and clear them. Pain level: 9/10 — the infinite loading makes the page completely broken. The current UI design intentionality for the filter bar is 4/10 due to the broken layout and inconsistent styling.

_-- Arda Kilicdagi_

### ambition

1-star: The page loads without infinite requests, the dropdowns look roughly the same, and badges are visible somewhere. 10-star: The recipes page loads instantly with a single API request. All filter controls share identical visual treatment (border-radius, padding, height, focus states). Active filter badges sit directly below the Filters heading with clear labels and one-click removal. The experience feels polished and intentional. Design intentionality target: 8/10. This UI is NOT AI-generated because it reuses the existing design system (input-field, card, btn-secondary) rather than introducing new decorative elements. Every change is functional, not decorative.

_-- Arda Kilicdagi_

### reversibility

No irreversible decisions. All changes are in React component JSX and CSS classes. If needed, we can revert the useMemo addition, restore the original TasteNotesFilter trigger classes, and move badges back to their original position. Zero migration required.

_-- Arda Kilicdagi_

### user_impact

This is a bug fix, not a behavior change. Users currently cannot use the recipes page at all due to infinite loading. After the fix, the page will work as originally intended. No breaking changes. Contributors will see the same filter patterns they are used to elsewhere in the app.

_-- Arda Kilicdagi_

### verification

Test strategy: (1) Unit test in RecipeListPage.test.tsx: verify that when searchParams contain tasteNoteIds, recipeApi.list is called exactly once (not in a loop). (2) Unit test in TasteNotesFilter.test.tsx: verify the trigger element has the correct CSS classes matching input-field styling. (3) Unit test in RecipeListPage.test.tsx: verify active filter badges render after the Filters heading and before the Search filter. Run vitest via deno run -A npm:vitest. Type-check with deno check. No documentation updates needed beyond code comments.

_-- Arda Kilicdagi_

### scope_boundary

This spec does NOT: change the API endpoint behavior, modify the database schema, add new filters, change pagination logic, refactor the entire RecipeListPage component, or alter the Base UI Select component internals beyond trigger styling. It also does NOT add e2e tests — only unit tests via vitest.

_-- Arda Kilicdagi_

## Test Strategy (well-engineered)

_To be addressed during execution._

## Performance Considerations (well-engineered)

_To be addressed during execution._

## Observability Plan (well-engineered)

_To be addressed during execution._

## Error Handling (well-engineered)

_To be addressed during execution._

## Security & Threat Model (well-engineered)

_To be addressed during execution._

## Developer Ergonomics (well-engineered)

_To be addressed during execution._

## Design States (empty, loading, error, success) (beautiful-product)

_To be addressed during execution._

## Mobile Layout (beautiful-product)

_To be addressed during execution._

## Interaction Design (beautiful-product)

_To be addressed during execution._

## Accessibility (beautiful-product)

_To be addressed during execution._

## Out of Scope

- This spec does NOT: change the API endpoint behavior, modify the database schema, add new filters, change pagination logic, refactor the entire RecipeListPage component, or alter the Base UI Select component internals beyond trigger styling
- It also does NOT add e2e tests — only unit tests via vitest.

## Tasks

- [x] task-1: Fix infinite loading in RecipeListPage.tsx by wrapping tasteNoteIds in useMemo so the useEffect dependency array stays stable. Files: apps/web/src/pages/recipes/RecipeListPage.tsx.
- [x] task-2: Update TasteNotesFilter trigger styling to match native select input-field class (rounded-lg, py-2 px-3, min-h-[42px], border, bg, text colors). Files: apps/web/src/components/recipe/TasteNotesFilter.tsx.
- [x] task-3: Move active filter badges (equipment and taste notes) to render directly below the Filters heading and Clear Filters button, before the Search filter. Files: apps/web/src/pages/recipes/RecipeListPage.tsx.
- [x] task-4: Add unit test in RecipeListPage.test.tsx verifying recipeApi.list is called exactly once when tasteNoteIds is present in URLSearchParams.
- [x] task-5: Add unit test in TasteNotesFilter.test.tsx verifying the Select.Trigger has the correct CSS classes matching input-field styling.
- [x] task-6: Add unit test in RecipeListPage.test.tsx verifying active filter badges render after the Filters heading and before the Search filter in DOM order.
- [x] task-7: Run all tests via deno run -A npm:vitest run in apps/web.
- [x] task-8: Run type check via deno check for affected files.

## Verification

- Test strategy: (1) Unit test in RecipeListPage.test.tsx: verify that when searchParams contain tasteNoteIds, recipeApi.list is called exactly once (not in a loop). (2) Unit test in TasteNotesFilter.test.tsx: verify the trigger element has the correct CSS classes matching input-field styling. (3) Unit test in RecipeListPage.test.tsx: verify active filter badges render after the Filters heading and before the Search filter
- Run vitest via deno run -A npm:vitest
- Type-check with deno check
- No documentation updates needed beyond code comments.

## Transition History

| From | To | User | Timestamp | Reason |
|------|----|------|-----------|--------|
| IDLE | DISCOVERY | Arda Kilicdagi | 2026-05-12T22:31:57.280Z | - |
