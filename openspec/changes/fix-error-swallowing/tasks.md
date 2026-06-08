## 1. i18n Keys

- [ ] 1.1 Add `"recipe.focusMode.loadError": "Failed to load recipe"` to `packages/shared/src/i18n/en.json` after line 76 (`"recipe.focusMode.notes": "Notes"`) and before line 77 (`"recipe.qrCode": "QR Code"`)
- [ ] 1.2 Add `"recipe.focusMode.loadError": "Tarif yüklenemedi"` to `packages/shared/src/i18n/tr.json` after line 76 (`"recipe.focusMode.notes": "Notlar"`) and before line 77 (`"recipe.qrCode": "QR Kodu"`)

## 2. RecipeFocusModePage — Imports, State & Docblock

- [ ] 2.1 Import `createLogger` from `../../utils/logger.ts` and add `const log = createLogger('RecipeFocusModePage')` at module scope (after imports, before the component)
- [ ] 2.2 Add `const [error, setError] = useState<string | null>(null)` alongside existing `recipe` and `allTasteNotes` state declarations
- [ ] 2.3 Add JSDoc docblock above `export function RecipeFocusModePage()` (line ~12): `/** Renders a focused, distraction-free view of a single brew recipe with stats, bean info, brew timeline, equipment, and tasting notes. */`

## 3. RecipeFocusModePage — Category 1: Critical Recipe Fetch

- [ ] 3.1 Replace the empty `.catch(() => {})` on `recipeApi.get(slug)` (line ~30) with:
  ```ts
  .catch((err) => {
    log.error({ err, slug }, 'Failed to fetch recipe for focus mode');
    setError(t('recipe.focusMode.loadError'));
  })
  ```

- [ ] 3.2 Add error early-return JSX BEFORE the existing `if (!recipe)` loading guard:
  ```tsx
  if (error) {
    return (
      <div
        className='mx-auto max-w-3xl px-4 sm:px-6 py-12 text-center'
        style={{ color: 'var(--error)' }}
      >
        {error}
      </div>
    );
  }
  ```

## 4. RecipeFocusModePage — Category 2: Non-Critical Taste Notes Fetch

- [ ] 4.1 Replace the empty `.catch(() => {})` on `tasteApi.flat()` (line ~23) with:
  ```ts
  .catch((err) => {
    log.error({ err }, 'Failed to fetch taste notes for focus mode');
  })
  ```

## 5. RecipeCreatePage — Category 2 & Docblocks

- [ ] 5.1 Import `createLogger` from `../../utils/logger.ts` and add `const log = createLogger('RecipeCreatePage')` at module scope (after imports, before the component)
- [ ] 5.2 Replace the empty `.catch(() => {})` on `beanApi.get(beanId)` (line ~87) with:
  ```ts
  .catch((err) => {
    log.error({ err, beanId }, 'Failed to pre-fill bean info from URL param');
  })
  ```
- [ ] 5.3 Add JSDoc docblock above `export function RecipeCreatePage()` (line ~17): `/** Multi-step form for creating a new brew recipe with bean info, brew parameters, equipment selection, taste notes, and preparation instructions. */`
- [ ] 5.4 Add JSDoc docblock above `function toggleEquipment(id)` (line ~109): `/** Toggles an equipment item in the selected equipment set. */`
- [ ] 5.5 Add JSDoc docblock above `function setBrewerDetailsFromSetup(value)` (line ~115): `/** Applies brewer details from the selected setup to the form state. */`
- [ ] 5.6 Add JSDoc docblock above `async function handleSubmit(e)` (line ~127): `/** Validates and submits the recipe creation form. On success navigates to the new recipe page; on failure displays validation or network errors. */`
- [ ] 5.7 Add JSDoc docblock above `function Section(...)` (line ~518): `/** Card wrapper for form sections with a title header. */`
- [ ] 5.8 Add JSDoc docblock above `function Field(...)` (line ~527): `/** Labeled form field container with optional required indicator. */`

## 6. TasteAutocomplete — Category 2 & Docblocks

- [ ] 6.1 Import `createLogger` from `../../utils/logger.ts` and add `const log = createLogger('TasteAutocomplete')` at module scope
- [ ] 6.2 Replace the empty `.catch(() => {})` on `api.get('/taste-notes/flat')` (line ~36) with:
  ```ts
  .catch((err) => {
    log.error({ err }, 'Failed to fetch taste notes list');
  })
  ```
- [ ] 6.3 Add JSDoc docblock above `interface TasteNote` (line ~5): `/** Represents a single taste note node in the SCAA flavor hierarchy. */`
- [ ] 6.4 Add JSDoc docblock above `interface Props` (line ~12): `/** Props for the TasteAutocomplete component. */`
- [ ] 6.5 Add JSDoc docblock above `export function TasteAutocomplete(...)` (line ~20): `/** Searchable autocomplete for SCAA taste notes with hierarchical grouping, intensity controls, and keyboard navigation. */`
- [ ] 6.6 Add JSDoc docblock above `function toggleNote(id)` (line ~155): `/** Adds or removes a taste note from the selection. When adding, defaults intensity to 2. */`
- [ ] 6.7 Add JSDoc docblock above `function cycleIntensity(id)` (line ~172): `/** Cycles a selected note's intensity through 1 → 2 → 3 → 1. */`
- [ ] 6.8 Add JSDoc docblock above `function handleKeyDown(e)` (line ~179): `/** Handles keyboard navigation (ArrowUp/Down, Enter, Escape) in the autocomplete dropdown. */`

## 7. RecipeForkPage — Docblock Fix

- [ ] 7.1 Add JSDoc docblock above `async function handleFork()` (line ~44): `/** Creates a fork of the source recipe with the current title. On success navigates to the new recipe's edit page; on failure displays the error. */`

## 8. Tests — RecipeFocusModePage Error State

- [ ] 8.1 Add `vi.mock('@/utils/logger.ts', () => ({ createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))` BEFORE the component import in `RecipeFocusModePage.test.tsx`, following the established 12-file convention
- [ ] 8.2 Add `'recipe.focusMode.loadError': 'Failed to load recipe'` to the `enT` helper map (after `recipe.focusMode.by`)
- [ ] 8.3 Add `'recipe.focusMode.loadError': 'Tarif yüklenemedi'` to the `trT` helper map (after `recipe.focusMode.by`)
- [ ] 8.4 Add test: "shows error message when recipeApi.get fails" — `mockRecipeApi.get.mockRejectedValue(new Error('Not found'))`, render, verify `waitFor` text "Failed to load recipe" appears, verify "Loading..." does NOT appear
- [ ] 8.5 Add test: "shows Turkish error message when recipeApi.get fails and locale is tr" — set Turkish locale + mock rejection, verify "Tarif yüklenemedi" appears
- [ ] 8.6 Add test: "error state does not appear when recipe fetch succeeds" — ensure `recipe.focusMode.loadError` text is NOT in document after successful render
- [ ] 8.7 Add test: "error div uses error color variable" — mock rejection, verify error text is in a div with `style.color === 'var(--error)'`
- [ ] 8.8 Run `make test-specific filter=apps/web/src/pages/recipes/RecipeFocusModePage.test.tsx` and verify all tests pass (existing + new)

## 9. Tests — TasteAutocomplete Logger Mock

- [ ] 9.1 Add `vi.mock('@/utils/logger.ts', () => ({ createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))` BEFORE the component import in `TasteAutocomplete.test.tsx` (the source file will now import `createLogger`, so this mock is required)
- [ ] 9.2 Run `make test-specific filter=apps/web/src/components/taste/TasteAutocomplete.test.tsx` and verify all existing tests still pass

## 10. Verification

- [ ] 10.1 Run `make fmt` to format all changed files
- [ ] 10.2 Run `make lint` and verify no new warnings
- [ ] 10.3 Run `make check-web` and verify TypeScript compilation passes with zero errors
- [ ] 10.4 Run `make test-web` (or `make test`) and verify ALL tests pass, including the new error-state tests

## 11. PR Description

- [ ] 11.1 Create `pr_description.md` at the project root (`/Users/arda.kilicdagi/projects/personal/BrewForm/pr_description.md`) with the following sections:

  **Title**: `# Fix silent error swallowing in client-side data fetching`

  **Summary**: Explain that 4 `.catch(() => {})` blocks were silently swallowing errors, leaving users with infinite spinners or empty UI with zero diagnostics. This PR replaces them with structured logging and (for the critical recipe fetch) a user-facing error screen.

  **What's in this PR**:
  - `apps/web/src/pages/recipes/RecipeFocusModePage.tsx` — Added structured error logging, error state for recipe fetch failure, JSDoc docblock
  - `apps/web/src/pages/recipes/RecipeCreatePage.tsx` — Added structured error logging for bean pre-fill failure, JSDoc docblocks on all exported functions
  - `apps/web/src/components/taste/TasteAutocomplete.tsx` — Added structured error logging for taste notes fetch failure, JSDoc docblocks on all exported functions/interfaces
  - `apps/web/src/pages/recipes/RecipeForkPage.tsx` — Added JSDoc docblock on `handleFork`
  - `packages/shared/src/i18n/en.json` — Added `recipe.focusMode.loadError` key
  - `packages/shared/src/i18n/tr.json` — Added `recipe.focusMode.loadError` key
  - `apps/web/src/pages/recipes/RecipeFocusModePage.test.tsx` — Added logger mock, i18n keys, 4 new error-state test cases
  - `apps/web/src/components/taste/TasteAutocomplete.test.tsx` — Added logger mock

  **How to verify**:
  - `make check-web` — zero TypeScript errors
  - `make test-web` — all tests pass
  - Manual: Disconnect network → navigate to `/recipes/<slug>/focus` → verify "Failed to load recipe" error message appears instead of infinite loading
  - Manual: With network → verify normal page renders
  - Manual: Disconnect network → open recipe create form with `?beanId=<uuid>` → verify `[RecipeCreatePage]` error entry in browser console
  - Manual: Disconnect network → open TasteAutocomplete → verify `[TasteAutocomplete]` error entry in browser console

  **Risk & Rollback**:
  - Low risk — additive changes only, no backend/schema/dependency changes
  - Error state only fires on fetch failures that already leave the page broken
  - New i18n keys are additive; `t()` falls back to raw key display if missing
  - Rollback: clean `git revert`

  **Checklist**:
  - [x] 4 empty catches replaced with structured error handling
  - [x] Critical fetch shows user-facing error screen
  - [x] Non-critical fetches log errors for debugging
  - [x] i18n keys in both English and Turkish
  - [x] JSDoc docblocks on all exported functions in affected files
  - [x] `createLogger` mocks in both affected test files
  - [x] New automated tests for error state
  - [x] `make fmt`, `make lint`, `make check-web`, `make test-web` pass
