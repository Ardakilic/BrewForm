# D13 — Module-Level Cache Without Invalidation

## Severity

**Medium**

## Issue Description

Both `RecipeListPage.tsx` and `StarredRecipesPage.tsx` use module-level variables as a cache for equipment and taste notes data:

```ts
// RecipeListPage.tsx:93-94
let cachedEquipment: EquipmentItem[] | null = null;
let cachedTasteNotes: TasteNoteFlat[] | null = null;

// StarredRecipesPage.tsx:67-68
let cachedEquipment: EquipmentItem[] | null = null;
let cachedTasteNotes: TasteNoteFlat[] | null = null;
```

These module-level variables are set once on first page load and never refreshed unless the page is fully reloaded.

## Impact

- **Stale UI data**: If a user adds or edits equipment in another tab, the filter dropdowns won't update until a full page reload
- **Stale taste notes**: Same issue for taste notes — new notes added in Settings or another page won't appear in filters
- **Cross-tab inconsistency**: Module-level state is per-tab (each tab has its own JS context), so changes in one tab never reflect in another
- **Duplicate code**: The cache logic is duplicated across both pages

## Root Cause

Module-level variables were used as a simple optimization to avoid re-fetching static data on every component mount. However, this pattern has no invalidation mechanism and doesn't sync across tabs or page reloads.

## Affected Files

| File | Lines | Description |
|------|-------|-------------|
| `apps/web/src/pages/recipes/RecipeListPage.tsx` | 93-94, 146-160 | Module-level cache + fetch on mount |
| `apps/web/src/pages/recipes/StarredRecipesPage.tsx` | 67-68, 126-140 | Module-level cache + fetch on mount |

## Fix Approach

### Option A: TanStack Query (Recommended — depends on D10)

If D10 is implemented, move equipment and taste notes to `useQuery` with appropriate `staleTime`:

```ts
// hooks/queries/useEquipment.ts
export function useEquipment() {
  return useQuery({
    queryKey: ['equipment'],
    queryFn: () => equipmentApi.list(),
    staleTime: 10 * 60 * 1000, // 10 minutes — equipment rarely changes
  });
}

// hooks/queries/useTasteNotes.ts
export function useTasteNotes() {
  return useQuery({
    queryKey: ['tasteNotes'],
    queryFn: () => tasteApi.flat(),
    staleTime: 10 * 60 * 1000,
  });
}
```

Benefits:
- Automatic background refetching when stale
- Cache shared across components (if both pages use the same query key)
- No module-level state needed
- Cross-tab sync via `refetchOnWindowFocus`

### Option B: Cross-Tab Invalidation via Storage Events (If D10 not done yet)

Add a `storage` event listener to invalidate cache when equipment/taste notes change in another tab:

```ts
// In a shared hook or provider
useEffect(() => {
  function handleStorageChange(e: StorageEvent) {
    if (e.key === 'brewform-equipment-cache') {
      cachedEquipment = null; // Invalidate
      // Trigger re-fetch via callback or state
    }
    if (e.key === 'brewform-taste-notes-cache') {
      cachedTasteNotes = null;
    }
  }
  window.addEventListener('storage', handleStorageChange);
  return () => window.removeEventListener('storage', handleStorageChange);
}, []);

// When updating equipment/taste notes in Settings:
localStorage.setItem('brewform-equipment-cache', Date.now().toString());
```

### Option C: Simple Refetch on Focus (Minimal)

Add `window.addEventListener('focus', ...)` to refetch when the user returns to the tab:

```ts
useEffect(() => {
  function handleFocus() {
    // Clear cache and refetch
    cachedEquipment = null;
    cachedTasteNotes = null;
    equipmentApi.list().then((data) => { ... });
    tasteApi.flat().then((data) => { ... });
  }
  window.addEventListener('focus', handleFocus);
  return () => window.removeEventListener('focus', handleFocus);
}, []);
```

## Implementation Steps

### If D10 (TanStack Query) is done:

1. Create `apps/web/src/hooks/queries/useEquipment.ts` with `useQuery`
2. Create `apps/web/src/hooks/queries/useTasteNotes.ts` with `useQuery`
3. Replace `cachedEquipment`/`cachedTasteNotes` usage in both pages with hook calls
4. Remove module-level cache variables and `_resetStaticCache()` export
5. Run `make check-web`

### If D10 is not done:

1. Create a shared hook `apps/web/src/hooks/useStaticData.ts` that encapsulates the cache logic
2. Add `storage` event listener for cross-tab invalidation
3. Replace direct module-level cache usage in both pages with the hook
4. When equipment/taste notes are updated elsewhere, dispatch a storage event
5. Run `make check-web`

## Testing Strategy

- Open recipe list page in two tabs
- In tab A, add a new piece of equipment via Settings
- Switch to tab B — verify the new equipment appears in filter dropdowns (after refocus with Option C, or automatically with Option A)
- Verify equipment filter still works after cache invalidation
- Verify taste notes filter still works after cache invalidation
- Check that module-level cache variables are removed

## Risk Assessment

- **Low**: Option A (TanStack Query) is the cleanest solution and handles everything automatically
- **Medium**: Option B requires coordinating storage events across pages
- **Low**: Option C is a minimal fix that improves freshness without full cache management

## Dependencies

- **D10** (TanStack Query) — recommended path; Option A is cleanest if D10 is done first
- **D11** (recipe list deduplication) — the shared hook/cache should be extracted once

## References

- TanStack Query staleTime docs: https://tanstack.com/query/v4/docs/guides/stale-data
- MDN StorageEvent: https://developer.mozilla.org/en-US/docs/Web/API/StorageEvent
