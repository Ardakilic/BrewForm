# D17 — Silent Error Swallowing (22+ Occurrences)

## Severity

**Medium**

## Issue Description

The frontend has 15+ occurrences of `.catch(() => {})` that silently swallow errors. When data fetching fails, users see no feedback — the UI just shows an empty state or stuck loading indicator.

### All Occurrences

| File | Line | Context | Severity |
|------|------|---------|----------|
| `RecipeListPage.tsx` | 151 | Equipment list fetch | Low |
| `RecipeListPage.tsx` | 158 | Taste notes fetch | Low |
| `RecipeListPage.tsx` | 169 | Coffee variety search | Low |
| `RecipeListPage.tsx` | 193 | Coffee variety name lookup | Low |
| `RecipeDetailPage.tsx` | 64 | Taste notes flat fetch | Low |
| `StarredRecipesPage.tsx` | 131 | Equipment list fetch | Low |
| `StarredRecipesPage.tsx` | 138 | Taste notes fetch | Low |
| `SettingsPage.tsx` | 33 | Preferences fetch | Medium |
| `HomePage.tsx` | 34 | Recipe lists fetch (latest + popular) | Medium |
| `UserProfilePage.tsx` | 232 | User profile fetch | Medium |
| `CommentSection.tsx` | 110 | Comments fetch | Medium |
| `RecipeFocusModePage.tsx` | 23 | Recipe fetch | Medium |
| `RecipeFocusModePage.tsx` | 30 | Taste notes fetch | Low |
| `RecipeCreatePage.tsx` | 87 | Setup list fetch | Low |
| `TasteAutocomplete.tsx` | 36 | Taste notes search | Low |

## Impact

- **UX**: Users see empty/stuck states with no explanation when API calls fail
- **Debugging**: No error information is available in the browser console for failed requests
- **Trust**: Silent failures erode user trust — they don't know if data is missing or if something is broken

## Root Cause

`.catch(() => {})` was used as a quick way to suppress unhandled promise rejections during development. The pattern was copy-pasted across pages without considering user-facing error handling.

## Affected Files

| File | Occurrences |
|------|-------------|
| `apps/web/src/pages/recipes/RecipeListPage.tsx` | 5 |
| `apps/web/src/pages/recipes/StarredRecipesPage.tsx` | 3 |
| `apps/web/src/pages/settings/SettingsPage.tsx` | 1 |
| `apps/web/src/pages/HomePage.tsx` | 1 |
| `apps/web/src/pages/users/UserProfilePage.tsx` | 1 |
| `apps/web/src/components/recipe/CommentSection.tsx` | 1 |
| `apps/web/src/pages/recipes/RecipeDetailPage.tsx` | 1 |
| `apps/web/src/pages/recipes/RecipeFocusModePage.tsx` | 2 |
| `apps/web/src/pages/recipes/RecipeCreatePage.tsx` | 1 |
| `apps/web/src/components/taste/TasteAutocomplete.tsx` | 1 |

## Fix Approach

Categorize each occurrence and apply the appropriate fix.

### Category 1: Critical Data (Show Error State)

These are data loads that the page cannot function without:

| File | Line | Data |
|------|------|------|
| `HomePage.tsx` | 34 | Recipe lists (main content) |
| `UserProfilePage.tsx` | 232 | User profile (entire page) |
| `SettingsPage.tsx` | 33 | Preferences (settings form) |
| `CommentSection.tsx` | 110 | Comments (section content) |
| `RecipeFocusModePage.tsx` | 23 | Recipe (entire page) |

**Fix**: Add error state and display an error message:

```ts
const [error, setError] = useState<string | null>(null);

// In the catch block:
.catch((err) => {
  log.error({ err }, 'Failed to fetch data');
  setError(t('errors.loadFailed'));
});

// In the JSX:
if (error) {
  return <div className="text-center py-12 text-[color:var(--error)]">{error}</div>;
}
```

### Category 2: Non-Critical Data (Log Only)

These are supplementary data loads where failure degrades gracefully:

| File | Line | Data |
|------|------|------|
| `RecipeListPage.tsx` | 151, 158 | Equipment + taste notes (filter dropdowns empty) |
| `RecipeListPage.tsx` | 169, 193 | Coffee variety search/name |
| `StarredRecipesPage.tsx` | 131, 138 | Equipment + taste notes |
| `RecipeDetailPage.tsx` | 64 | Taste notes flat |
| `RecipeFocusModePage.tsx` | 30 | Taste notes |
| `RecipeCreatePage.tsx` | 87 | Setup list |
| `TasteAutocomplete.tsx` | 36 | Taste note search |

**Fix**: Replace `.catch(() => {})` with `.catch((err) => log.error({ err }, 'description'))`:

```ts
.catch((err) => {
  log.error({ err }, 'Failed to fetch equipment list');
});
```

### Category 3: CommentSection Special Case

The `CommentSection.tsx` line 110 is a special case — the comments load failure should show an error state within the section:

```ts
.catch((err) => {
  log.error({ err }, 'Failed to fetch comments');
  setStatusMessage(t('comment.loadError'));
});
```

## Implementation Steps

1. Audit all `.catch(() => {})` occurrences (15 found — see table above)
2. For each occurrence, categorize as Critical or Non-Critical
3. For Critical (5 occurrences):
   - Add `error` state variable
   - Add `log.error()` call in catch block
   - Add error message display in JSX
4. For Non-Critical (10 occurrences):
   - Replace `.catch(() => {})` with `.catch((err) => log.error({ err }, 'description'))`
5. Ensure all files import `createLogger` and create a logger instance
6. Run `make check-web`

## Testing Strategy

- Disconnect network in DevTools → navigate to HomePage → verify error message appears
- Disconnect network → navigate to UserProfilePage → verify error message appears
- Disconnect network → navigate to SettingsPage → verify error message appears
- Disconnect network → open a recipe → verify CommentSection shows error
- Check browser console for structured error logs from non-critical failures
- Verify equipment/taste notes filter dropdowns still work when API is available

## Risk Assessment

- **Low**: Adding error logging is non-breaking
- **Low**: Adding error states to critical pages is additive
- **Medium**: Must verify error states render correctly with existing UI patterns

## Dependencies

- None (standalone fix, but pairs well with D10 TanStack Query which handles errors natively)
