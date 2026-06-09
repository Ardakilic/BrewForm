## Context

BrewForm's React Router loader migrations (D10–D16) resolved 11 of 15 empty `.catch(() => {})` occurrences by moving data fetching into loader functions that propagate errors to `errorElement` boundaries or handle them explicitly. Four occurrences remain in three client-side components that still use `useEffect`+`useState` for data fetching:

| File | Line | API Call | Severity |
|------|------|----------|----------|
| `RecipeFocusModePage.tsx:30` | 30 | `recipeApi.get(slug)` | **High** — page unusable |
| `RecipeFocusModePage.tsx:23` | 23 | `tasteApi.flat()` | Low — optional data |
| `RecipeCreatePage.tsx:87` | 87 | `beanApi.get(beanId)` | Low — optional pre-fill |
| `TasteAutocomplete.tsx:36` | 36 | `api.get('/taste-notes/flat')` | Low — optional autocomplete |

**Verified**: A codebase-wide regex search for `\.catch\(\(\)\s*=>\s*\{\s*\}` across `apps/web/src/**/*.{ts,tsx}` returns zero results beyond these 4 + the intentional one in AuthContext.

One additional empty catch in `AuthContext.tsx:33` is **intentional** — `refreshUser().catch(() => {})` exists because a failed token refresh is a normal unauthenticated state. The inner `refreshUser` already has a `try/finally` that ensures `setIsLoading(false)` is called. This catch MUST NOT be changed.

The existing `RecipeForkPage` (`apps/web/src/pages/recipes/RecipeForkPage.tsx`) provides the established reference pattern:
- `createLogger` imported via `@/utils/logger.ts` (path alias)
- `const log = createLogger('RecipeForkPage')` at module scope
- `log.error({ err, id }, 'loadSourceRecipe failed')` in catch blocks
- `setError(t('recipe.fork.loadError'))` for user-facing messages
- Error banner with `var(--error)` background before main content
- JSDoc docblock on the exported component function
- Mount/unmount lifecycle logging with `log.debug`

**Import path convention in `pages/recipes/`**: Three files use `../../utils/logger.ts` (relative: RecipeListPage, StarredRecipesPage, useCoffeeVarietyFilter), one uses `@/utils/logger.ts` (alias: RecipeForkPage). Both resolve to the same file. This change uses **relative** paths for RecipeFocusModePage and RecipeCreatePage to match the majority convention in the directory. TasteAutocomplete (in `components/taste/`) uses `../../utils/logger.ts`.

## Goals / Non-Goals

**Goals:**
- Replace all 4 silent empty catches with structured `log.error()` calls that include the error object and relevant context (`slug`, `beanId`)
- Add user-facing error state to RecipeFocusModePage when the recipe fetch (critical data) fails
- Add `recipe.focusMode.loadError` i18n keys to both `en.json` and `tr.json`
- Add automated tests for the RecipeFocusModePage error state, following the RecipeForkPage error test pattern
- Add `createLogger` mocks to the two test files that will need them (RecipeFocusModePage.test.tsx, TasteAutocomplete.test.tsx) following the established 12-file convention
- Add JSDoc docblocks to all exported functions in the 3 affected source files (14 missing in total, including RecipeForkPage's `handleFork` which was omitted from the reference)
- Create a `pr_description.md` at the project root

**Non-Goals:**
- Migrating RecipeFocusModePage to a React Router loader (larger architectural change, deferred)
- Adding structured logs to the non-empty-but-hardcoded-English catches in RecipeCreatePage:64/71 (destined for D26 "Expand Logging")
- Changing the intentional empty catch in `AuthContext.tsx:33`
- Adding user-facing error states for non-critical fetches (they degrade gracefully without UI disruption)
- Fixing the pre-existing UX issue in TasteAutocomplete where a failed fetch shows "Loading taste notes..." forever instead of an empty state (separate issue; the logging addition at least enables debugging it)

## Decisions

### Decision 1: Two-category severity split

**Choice**: Critical data fetches get user-facing error state + logging; non-critical fetches get logging only.

**Rationale**: A failed recipe fetch blocks the entire page — the user needs to know something went wrong. Failed taste notes or bean pre-fill just means an empty dropdown or a form field the user fills manually — logging suffices for debugging without cluttering the UI.

**Alternatives considered**:
- Show errors for all 4: Would add noise to the UI for non-blocking failures.
- Do nothing: Already unacceptable — silent failures block debugging and erode trust.

### Decision 2: i18n key naming

**Choice**: Use `recipe.focusMode.loadError` following the existing `recipe.fork.loadError` pattern.

**Rationale**: The `recipe.*.loadError` namespace is already established (RecipeForkPage uses `recipe.fork.loadError` at `en.json:38`). The plan's original proposal of `errors.loadFailed` doesn't exist. Using `error.500` would be too generic.

### Decision 3: Logger import path

**Choice**: 
- RecipeFocusModePage + RecipeCreatePage: `../../utils/logger.ts` (relative)
- TasteAutocomplete: `../../utils/logger.ts` (relative, matches existing `../../api/index.ts` import)

**Rationale**: 3 of 4 files in `pages/recipes/` that use `createLogger` already use relative paths. TasteAutocomplete already uses `../../api/index.ts` — adding `../../utils/logger.ts` is consistent with the file's existing import style.

### Decision 4: Error state UI placement

**Choice**: Add the error check BEFORE the existing `if (!recipe)` loading guard in RecipeFocusModePage's JSX return.

**Rationale**: When the fetch rejects, `setError` is called but `setRecipe` is not — so `recipe` remains null. If error is checked AFTER the loading guard, the loading spinner would display instead of the error message. Error state MUST take priority.

### Decision 5: Test approach — mock `createLogger`

**Choice**: Add `vi.mock('@/utils/logger.ts', ...)` to both RecipeFocusModePage.test.tsx and TasteAutocomplete.test.tsx, following the established 12-file convention.

**Rationale**: 12 of 13 test files whose source imports `createLogger` mock it via `vi.mock`. The one exception (RecipeForkPage.test.tsx) is a pre-existing inconsistency, not a pattern to follow. Mocking ensures clean test output and enables future assertion of logging calls if needed.

**Note**: RecipeForkPage.test.tsx is missing its `createLogger` mock — this is a pre-existing gap. It works because the real `ConsoleLogger` uses `console.*` which Vitest captures. This is out of scope for D17 but worth noting for D26.

### Decision 6: Docblocks on all changed/new exported functions

**Choice**: Add JSDoc docblocks to all 14 missing declarations across the 3 affected files + RecipeForkPage's `handleFork`.

**Rationale**: `RecipeForkPage` already has a JSDoc (serving as baseline), but its `handleFork` is undocumented. `RecipeFocusModePage`, `RecipeCreatePage`, and `TasteAutocomplete` have NO docblocks on their exported components or helper functions. AGENTS.md conventions require JSDoc on public functions. Since we're touching these files for error handling, adding docblocks is a natural companion task.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| RecipeFocusModePage error state might show briefly during slow fetches | `.catch()` only fires on rejection, not during pending promise — timing is not a factor |
| New i18n keys missing → raw key displayed | `t()` falls back to showing the key string, which is still informative |
| `createLogger` import breaks tests if not mocked | Both affected test files get `vi.mock('@/utils/logger.ts', ...)` blocks added before component import |
| TasteAutocomplete "loading" test uses non-resolving promise → `.catch()` never reached | No change needed — behavior unchanged for the never-resolve path |
| TasteAutocomplete pre-existing UX issue: failed fetch shows "Loading taste notes..." forever (no empty-state fallback after rejection) | Out of scope for D17. The added `log.error` at least enables debugging this issue in production. Could be enhanced in a follow-up. |
