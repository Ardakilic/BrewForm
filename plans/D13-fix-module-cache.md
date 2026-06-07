# D13 — Module-Level Cache Without Invalidation

> **Plan validated against `main` branch — June 2026**
> Five errors were found in the original plan and are corrected in this revision.
> Errors are annotated inline with `[Corrected]` markers.
> A summary of all corrections appears at the bottom.

---

## Severity

**Medium**

---

## Issue Description

~~Both `RecipeListPage.tsx` and `StarredRecipesPage.tsx` use module-level variables as a cache for equipment and taste notes data~~ **[Corrected — see Error 1]**

The module-level cache has been centralised into a dedicated file as part of the D10/D11 refactor:

```ts
// apps/web/src/api/static-cache.ts (current state)
let _equipment: EquipmentListItem[] | null = null;
let _tasteNotes: TasteNoteFlatItem[] | null = null;

export async function getEquipmentCached(): Promise<EquipmentListItem[]> {
  if (!_equipment) _equipment = await equipmentApi.list();
  return _equipment;
}

export async function getTasteNotesCached(): Promise<TasteNoteFlatItem[]> {
  if (!_tasteNotes) _tasteNotes = await tasteApi.flat();
  return _tasteNotes;
}

export function invalidateStaticCache(): void {
  _equipment = null;
  _tasteNotes = null;
}
```

`invalidateStaticCache()` exists and correctly nulls both caches, but **it is never called** anywhere in the codebase. Every file that mutates equipment or taste notes — three pages in total — silently leaves the cache populated with stale data.

The React Router loaders on `RecipeListPage` and `StarredRecipesPage` call `getEquipmentCached()` / `getTasteNotesCached()` on every navigation to those routes:

```ts
// apps/web/src/pages/recipes/RecipeListPage.tsx (current state)
export const loader = async ({ request }: { request: Request }) => {
  const [recipesResponse, equipment, tasteNotes] = await Promise.all([
    recipeApi.list(params),
    getEquipmentCached(),     // ← returns stale data if cache was never invalidated
    getTasteNotesCached(),
  ]);
  return { recipesResponse, equipment, tasteNotes };
};
```

The same loader pattern exists in `StarredRecipesPage.tsx`.

---

## Impact

- **Stale filter dropdowns**: After a user or admin creates/edits/deletes equipment, navigating to the Recipe List shows outdated equipment in the filter dropdowns until a hard page reload
- **Stale taste notes**: Same issue — new taste notes added via admin are invisible in the recipe filter until hard reload
- **Cross-tab inconsistency**: Changes made in one browser tab are never reflected in other tabs (each JS context holds its own module-level cache)
- ~~**Duplicate code**: The cache logic is duplicated across both pages~~ **[Corrected — see Error 2; already resolved by static-cache.ts]**

---

## Root Cause

`invalidateStaticCache()` was added to `static-cache.ts` but was never wired up at the three mutation call sites. The three pages that perform equipment or taste-note mutations (`EquipmentListPage`, `AdminEquipmentPage`, `AdminTasteNotesPage`) each manage their own local React state after a successful API call but do not call `invalidateStaticCache()`, leaving the module-level cache permanently stale until the next hard reload.

---

## Affected Files

| File | Lines | Description |
|------|-------|-------------|
| `apps/web/src/api/static-cache.ts` | 1–18 | Cache module — `invalidateStaticCache()` exists but is never called |
| `apps/web/src/pages/equipment/EquipmentListPage.tsx` | `handleCreate`, `handleDelete` | User-facing equipment CRUD — missing `invalidateStaticCache()` |
| `apps/web/src/pages/admin/AdminEquipmentPage.tsx` | `handleSubmit`, `handleDelete` | Admin equipment CRUD — missing `invalidateStaticCache()` |
| `apps/web/src/pages/admin/AdminTasteNotesPage.tsx` | `handleCreate`, `handleDelete` | Admin taste note CRUD — missing `invalidateStaticCache()` |

> **Note**: `RecipeListPage.tsx` and `StarredRecipesPage.tsx` no longer need changes — they already consume `getEquipmentCached()` / `getTasteNotesCached()` in their React Router loaders and will automatically get fresh data on the next navigation once the cache is correctly invalidated at mutation sites.

---

## Fix Approach

### D10 is already done (React Router 7 loaders)

~~Option A: TanStack Query (Recommended — depends on D10)~~ **[Corrected — see Errors 3 & 4]**

D10 was revised from TanStack Query to React Router 7 data loaders. Loaders are already in place on `RecipeListPage` and `StarredRecipesPage`. TanStack Query is not a dependency of this project.

The correct approach for the current architecture is:

**Call `invalidateStaticCache()` immediately after each successful equipment or taste-note mutation.** The next time the user navigates to any route whose loader calls `getEquipmentCached()` or `getTasteNotesCached()`, React Router will run the loader again and the nulled cache will trigger a fresh API fetch.

```ts
// Pattern to apply at each mutation site
import { invalidateStaticCache } from '../../api/static-cache.ts';

async function handleCreate(e: React.FormEvent) {
  // ... existing API call ...
  setEquipment((prev) => [...prev, created as EquipmentItem]); // existing local state update
  invalidateStaticCache(); // ADD THIS — so the next loader run fetches fresh data
}

async function handleDelete(id: string) {
  // ... existing API call ...
  setEquipment((prev) => prev.filter((eq) => eq.id !== id)); // existing local state update
  invalidateStaticCache(); // ADD THIS
}
```

No `useRevalidator` is needed in the mutation pages themselves. The recipe list pages' loaders will pick up the fresh data naturally on the next navigation.

### Option B: Cross-Tab Invalidation via Storage Events (Optional enhancement)

If same-tab stale data is considered the primary issue, the fix above is sufficient. For cross-tab consistency, add a `StorageEvent` broadcast when the cache is invalidated:

```ts
// apps/web/src/api/static-cache.ts — extend the existing invalidate function
export function invalidateStaticCache(): void {
  _equipment = null;
  _tasteNotes = null;
  // Broadcast to other tabs
  try {
    localStorage.setItem('brewform-static-cache-bust', Date.now().toString());
  } catch {
    // ignore — private browsing may block localStorage
  }
}

// In a shared hook or at router level, listen for the bust signal:
useEffect(() => {
  function handleStorage(e: StorageEvent) {
    if (e.key === 'brewform-static-cache-bust') {
      invalidateStaticCache();
      // Loaders re-run on next navigation; no immediate revalidation needed
    }
  }
  window.addEventListener('storage', handleStorage);
  return () => window.removeEventListener('storage', handleStorage);
}, []);
```

> **Note**: The `storage` event fires only in *other* tabs (not the one that wrote), which is the correct cross-tab invalidation behaviour.

---

## Implementation Steps (D10 done — React Router 7 loaders)

1. Open `apps/web/src/pages/equipment/EquipmentListPage.tsx`
   - Add `import { invalidateStaticCache } from '../../api/static-cache.ts';`
   - Call `invalidateStaticCache()` at the end of the `try` block in `handleCreate` (after the local state update)
   - Call `invalidateStaticCache()` at the end of the `try` block in `handleDelete` (after the local state update)

2. Open `apps/web/src/pages/admin/AdminEquipmentPage.tsx`
   - Add `import { invalidateStaticCache } from '../../api/static-cache.ts';`
   - Call `invalidateStaticCache()` at the end of the `try` block in `handleSubmit` (covers both create and edit paths, after `resetForm()`)
   - Call `invalidateStaticCache()` at the end of the `try` block in `handleDelete` (after the local state update)

3. Open `apps/web/src/pages/admin/AdminTasteNotesPage.tsx`
   - Add `import { invalidateStaticCache } from '../../api/static-cache.ts';`
   - Call `invalidateStaticCache()` at the end of the `try` block in `handleCreate` (after the local state update)
   - Call `invalidateStaticCache()` at the end of the `try` block in `handleDelete` (after the local state update)

4. ~~Remove module-level cache variables and `_resetStaticCache()` export~~ **[Corrected — see Error 5; nothing to remove; `invalidateStaticCache()` already exists in `static-cache.ts`]**

5. *(Optional)* Implement Option B cross-tab storage broadcast in `static-cache.ts` and add a listener in `App.tsx` or a shared layout component

6. Run `make check-web`

---

## Testing Strategy

- Navigate to `/equipment` in Tab A and create a new piece of equipment
- Navigate to `/recipes` in the same tab — verify the new equipment appears immediately in the filter dropdown (confirms same-tab invalidation)
- *(For Option B)* Create equipment in Tab A, then switch focus to Tab B and navigate to `/recipes` — verify the new equipment appears in the filter dropdown
- Navigate to `/recipes/starred` — verify the same equipment list is fresh
- Delete a piece of equipment via `/equipment`, navigate to `/recipes` — verify the deleted item is gone from the filter
- Repeat the create/delete tests via the admin panel (`/admin/equipment`)
- Create a new taste note via `/admin/taste-notes`, navigate to `/recipes` — verify the new taste note appears in the taste note filter
- Run `make check-web` — no type errors

---

## Risk Assessment

- **Low**: The fix is mechanical — three files, one import each, one or two `invalidateStaticCache()` calls per mutation handler. No new abstractions, no new files, no new dependencies
- **Low**: `invalidateStaticCache()` is already tested via the existing mocks in `RecipeListPage.test.tsx` and `StarredRecipesPage.test.tsx` which already mock `../../api/static-cache.ts`
- **None**: No changes to `static-cache.ts`, `RecipeListPage.tsx`, or `StarredRecipesPage.tsx` are needed

---

## Dependencies

- ~~**D10** (TanStack Query) — recommended path~~ **[Corrected — D10 is done; it chose React Router 7 loaders, not TanStack Query]**
- ~~**D11** (recipe list deduplication) — the shared hook/cache should be extracted once~~ **[Corrected — D11 is done; cache is already in `static-cache.ts`; no further extraction needed]**
- **None**: This plan is self-contained and has no blocking dependencies

---

## References

- `apps/web/src/api/static-cache.ts` — cache module with the unused `invalidateStaticCache()`
- `apps/web/src/pages/recipes/RecipeListPage.tsx` — consumes `getEquipmentCached()` / `getTasteNotesCached()` in its loader
- `apps/web/src/pages/recipes/StarredRecipesPage.tsx` — same loader pattern
- MDN StorageEvent: https://developer.mozilla.org/en-US/docs/Web/API/StorageEvent
- React Router `useRevalidator`: https://reactrouter.com/api/hooks/useRevalidator

---

## Summary of Corrections

| # | Location in original plan | Error | Correction |
|---|--------------------------|-------|------------|
| 1 | Issue Description / Affected Files | Stated that `RecipeListPage.tsx:93-94` and `StarredRecipesPage.tsx:67-68` contain the module-level cache variables | Those files have been refactored. The cache now lives exclusively in `apps/web/src/api/static-cache.ts`. Neither page file contains module-level cache variables. |
| 2 | Impact — "Duplicate code" bullet | Listed "Duplicate code: The cache logic is duplicated across both pages" as an active impact | Already resolved. `static-cache.ts` centralises the cache; neither page duplicates it. |
| 3 | Root Cause | Described fetching as occurring in `useEffect` hooks on component mount | Data is fetched in React Router `loader` functions, not `useEffect` hooks. Component mount is not the fetch trigger. |
| 4 | Fix Approach — Option A | Proposed creating TanStack Query `useQuery` hooks (`useEquipment`, `useTasteNotes`) as the recommended path | D10 was revised to use React Router 7 data loaders (already in use), not TanStack Query. No `@tanstack/react-query` dependency exists in `apps/web/package.json`. Option A is moot. The correct fix is to call `invalidateStaticCache()` at mutation sites. |
| 5 | Implementation Steps — Step 4 | Said "Remove module-level cache variables and `_resetStaticCache()` export" | No module-level vars exist in the page files; nothing to remove there. The function is named `invalidateStaticCache()` (not `_resetStaticCache()`), it already exists in `static-cache.ts`, and it must be kept — not removed. |