# D17 — Silent Error Swallowing (4 Remaining Occurrences)

> **Status (2026-07-04): ✅ Done** — zero empty `.catch` in the 3 target files; `createLogger` present; `recipe.focusMode.loadError` en/tr keys (:77).

## Severity

**Medium**

## Audit Notes (vs. original plan)

The original plan identified 15 empty `.catch(() => {})` occurrences. A full codebase audit
against the current `main` branch reveals that **11 of those 15 have already been resolved**
through the React Router loader migrations carried out in D10–D16. Those pages now use
`loader` functions registered in `router.tsx`; data fetching errors either propagate to the
`errorElement` boundary or are explicitly handled inside the loader, so client-side empty
catches no longer exist in them.

**Occurrences that are gone (loader-migrated):**

| File (original claim) | How it was fixed |
|-----------------------|-----------------|
| `RecipeListPage.tsx` × 5 | Full React Router loader (`getEquipmentCached`, `getTasteNotesCached`, `recipeApi.list`) |
| `StarredRecipesPage.tsx` × 3 | Full React Router loader, 401 → `redirect('/login')` |
| `SettingsPage.tsx:33` | Loader fetches preferences, wired in `router.tsx` |
| `HomePage.tsx:34` | Loader fetches latest + popular recipes |
| `UserProfilePage.tsx:232` | Loader fetches profile + follow data |
| `CommentSection.tsx:110` | Now receives `initialComments` prop from `RecipeDetailPage` loader; uses `useFetcher` for mutations |
| `RecipeDetailPage.tsx:64` | Loader fetches `tasteNotes` via `getTasteNotesCached()` in parallel |

One additional empty catch (`AuthContext.tsx:33`) is **intentional** and must not be changed:
`refreshUser().catch(() => {})` exists because a failed refresh simply means the user has
no valid session token, and that is a normal (non-error) state on every unauthenticated page
load. The inner `refreshUser` already has a `try/finally` that ensures `setIsLoading(false)`
is called in all cases.

---

## Remaining Occurrences (4 total, 3 files)

| File | Line | Actual context | Severity |
|------|------|---------------|----------|
| `RecipeFocusModePage.tsx` | 30 | `recipeApi.get(slug)` — recipe fetch (entire page) | **High** |
| `RecipeFocusModePage.tsx` | 23 | `tasteApi.flat()` — taste-notes fetch | Low |
| `RecipeCreatePage.tsx` | 87 | `beanApi.get(beanId)` — bean info pre-fill from `?beanId=` URL param | Low |
| `TasteAutocomplete.tsx` | 36 | `api.get('/taste-notes/flat')` — taste-notes search list | Low |

> **Original plan error — descriptions swapped for `RecipeFocusModePage`:**
> The original plan listed line 23 as "Recipe fetch (Medium/Critical)" and line 30 as
> "Taste notes fetch (Low/Non-critical)". These are **reversed**. In the actual source,
> `tasteApi.flat()` closes at line 23 and `recipeApi.get(slug)` closes at line 30.
> The category assignments have been corrected accordingly.
>
> **Original plan error — wrong context for `RecipeCreatePage:87`:**
> The original plan labelled line 87 as "Setup list fetch". In reality lines 64/71 are the
> equipment and setup list fetches (with non-empty catches); line 87 is the `beanApi.get(beanId)`
> call that pre-fills bean fields from an optional `?beanId=` URL param — a convenience
> feature whose silent failure is more tolerable, but still worth logging.

---

## Impact

- **UX (`RecipeFocusModePage` recipe fetch)**: When `recipeApi.get` fails the page is stuck
  showing "Loading…" forever, with no way for the user to understand why or retry.
- **Debugging**: No error information appears in the browser console for any of the four
  failures, making production debugging impossible.
- **Trust**: Silent failures erode user confidence — the UI just hangs or shows empty
  dropdowns with no explanation.

---

## Affected Files

| File | Occurrences remaining |
|------|----------------------|
| `apps/web/src/pages/recipes/RecipeFocusModePage.tsx` | 2 |
| `apps/web/src/pages/recipes/RecipeCreatePage.tsx` | 1 |
| `apps/web/src/components/taste/TasteAutocomplete.tsx` | 1 |

---

## Fix Approach

### Category 1: Critical Data — Show Error State

One occurrence where the page cannot render without the data:

| File | Line | Data |
|------|------|------|
| `RecipeFocusModePage.tsx` | 30 | Recipe (entire page depends on it) |

**What to do:**

1. Add `error` state and import `createLogger`.
2. Set the error in the catch block with a structured log.
3. Add an early-return error screen before the existing `if (!recipe)` guard.
4. Add the new i18n key `recipe.focusMode.loadError` to **both** locale files (see
   §[i18n keys](#i18n-keys) below).

```ts
// Add imports
import { createLogger } from '../../utils/logger.ts';

const log = createLogger('RecipeFocusModePage');

// Add state
const [error, setError] = useState<string | null>(null);

// Replace the recipe-fetch catch:
recipeApi.get(slug).then((data: Record<string, unknown>) => {
  setRecipe(data);
}).catch((err) => {
  log.error({ err, slug }, 'Failed to fetch recipe for focus mode');
  setError(t('recipe.focusMode.loadError'));
});

// Add before the existing `if (!recipe)` guard in JSX:
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

### Category 2: Non-Critical Data — Log Only

Three occurrences where failure degrades gracefully (empty dropdowns / missing pre-fill):

| File | Line | Data |
|------|------|------|
| `RecipeFocusModePage.tsx` | 23 | `tasteApi.flat()` — taste notes (renders fine without them) |
| `RecipeCreatePage.tsx` | 87 | `beanApi.get(beanId)` — bean pre-fill (only runs if `?beanId=` is present; user can fill manually) |
| `TasteAutocomplete.tsx` | 36 | `api.get('/taste-notes/flat')` — autocomplete list (component renders; just no suggestions) |

**Fix** — replace `.catch(() => {})` with a structured log in each:

```ts
// RecipeFocusModePage.tsx line 23 (logger already added for Category 1):
}).catch((err) => {
  log.error({ err }, 'Failed to fetch taste notes for focus mode');
});

// RecipeCreatePage.tsx line 87 (add createLogger import + log instance):
import { createLogger } from '../../utils/logger.ts';
const log = createLogger('RecipeCreatePage');

}).catch((err) => {
  log.error({ err, beanId }, 'Failed to pre-fill bean info from URL param');
});

// TasteAutocomplete.tsx line 36 (add createLogger import + log instance):
import { createLogger } from '../../utils/logger.ts';
const log = createLogger('TasteAutocomplete');

}).catch((err) => {
  log.error({ err }, 'Failed to fetch taste notes list');
});
```

---

## i18n Keys

A new translation key is required for the `RecipeFocusModePage` error screen.
Add it to **both** locale files, following the existing `recipe.fork.loadError` pattern:

**`packages/shared/src/i18n/en.json`** (add after `recipe.focusMode.notes`):
```json
"recipe.focusMode.loadError": "Failed to load recipe"
```

**`packages/shared/src/i18n/tr.json`** (add after `recipe.focusMode.notes`):
```json
"recipe.focusMode.loadError": "Tarif yüklenemedi"
```

> Note: The original plan used `t('errors.loadFailed')`, which does not exist in either
> locale file. The correct namespace is `error.*` (no trailing 's'). Rather than reusing
> the overly generic `error.500` ("Something went wrong"), the new key above follows the
> established `recipe.*.loadError` pattern already used by `RecipeForkPage`.

---

## Implementation Steps

1. Add `recipe.focusMode.loadError` to `en.json` and `tr.json`.
2. In `RecipeFocusModePage.tsx`:
   - Import `createLogger` from `../../utils/logger.ts`.
   - Create `const log = createLogger('RecipeFocusModePage')`.
   - Add `const [error, setError] = useState<string | null>(null)`.
   - Replace the `recipeApi.get` empty catch (line 30) with log + `setError` (Category 1 fix).
   - Replace the `tasteApi.flat` empty catch (line 23) with `log.error` only (Category 2 fix).
   - Add the error early-return before the `if (!recipe)` guard in JSX.
3. In `RecipeCreatePage.tsx`:
   - Import `createLogger` and create `const log = createLogger('RecipeCreatePage')`.
   - Replace the `beanApi.get` empty catch (line 87) with `log.error` (Category 2 fix).
4. In `TasteAutocomplete.tsx`:
   - Import `createLogger` and create `const log = createLogger('TasteAutocomplete')`.
   - Replace the `api.get` empty catch (line 36) with `log.error` (Category 2 fix).
5. Run `make check-web`.

---

## Testing Strategy

- Disconnect network in DevTools → navigate to `/recipes/<slug>/focus` →
  verify the error message ("Failed to load recipe") appears instead of an infinite
  loading state.
- With network connected → navigate to `/recipes/<slug>/focus` → verify the page
  renders normally (error state is not shown).
- Disconnect network → open any recipe create form → observe browser console for a
  structured `[RecipeCreatePage]` error entry (no user-facing change since bean pre-fill
  is silent-by-design when no `?beanId=` param is set; test with a valid `?beanId=<uuid>`
  URL to confirm the catch fires).
- Disconnect network → open a recipe form with `TasteAutocomplete` → observe browser
  console for a structured `[TasteAutocomplete]` error entry; autocomplete renders but
  shows no suggestions.

---

## Additional Observations (Out of Scope for D17)

**`RecipeCreatePage.tsx` lines 64 and 71** already have non-empty catches:

```ts
.catch(() => setEquipError('Failed to load equipment'))  // line 64
.catch(() => setEquipError('Failed to load setups'))      // line 71
```

These show a user-facing error but use a hardcoded English string and have no `log.error()`.
They are not silent failures, so they fall outside D17's scope, but the missing structured
log should be addressed in **D26** (Expand Logging), which already lists `RecipeCreatePage`
as a P1 target.

**`RecipeFocusModePage`** is the only remaining page-level component that still uses
`useEffect`+`useState` for data fetching rather than a React Router `loader`. A full loader
migration (matching `RecipeDetailPage`) would be architecturally cleaner and eliminate these
catches entirely, but that is a larger change outside D17's scope.

---

## Risk Assessment

- **Low**: Adding `log.error()` is fully non-breaking.
- **Low**: The error state addition to `RecipeFocusModePage` is additive; it only fires on
  real fetch failures that currently leave the page broken anyway.
- **Low**: New i18n keys are additive; missing keys fall back gracefully in the i18n context.

---

## Dependencies

- None for the core fix.
- Overlaps with **D26** (Expand Logging) for `RecipeCreatePage` structured logging;
  D17's `log.error()` additions in that file are a strict subset of D26's broader work.
- Note: The original plan mentioned pairing with "D10 TanStack Query" — D10 was implemented
  as React Router loader/action/`useFetcher` adoption (not TanStack Query); the reference is
  no longer meaningful.