# D10 — TanStack Query Migration (Server State Cache Layer)

## Severity

**High**

## Issue Description

The frontend has no data-fetching cache layer. Every page implements raw `useEffect` + `useState` + `fetch` patterns, resulting in:

- No automatic cache invalidation
- No background refetching or stale-while-revalidate
- No request deduplication
- Manual loading/error state management per page
- No optimistic update support with automatic rollback

## Impact

- **UX**: Data goes stale immediately after mutations in other tabs or pages. Users see stale lists after liking/favouriting. No skeleton-to-content transitions on navigation.
- **DX**: Every page re-implements the same loading/error/data pattern (~15 occurrences of `useEffect` + `fetch`). New pages must copy boilerplate. No shared mutation handling.
- **Performance**: Identical requests fire on every mount (e.g., equipment list, taste notes). No deduplication across components.

## Root Cause

The app was built with raw `useEffect` + `useState` + `fetch` before any caching library was adopted. Each page independently manages its data lifecycle.

## Affected Files

| File | Lines | Pattern |
|------|-------|---------|
| `apps/web/src/pages/recipes/RecipeListPage.tsx` | 102-229 | `useEffect` → `recipeApi.list()` |
| `apps/web/src/pages/recipes/StarredRecipesPage.tsx` | 97-175 | `useEffect` → `recipeApi.starred()` |
| `apps/web/src/pages/recipes/RecipeDetailPage.tsx` | 42-87 | `useEffect` → `recipeApi.get()`, `tasteApi.flat()` |
| `apps/web/src/pages/HomePage.tsx` | 25-37 | `useEffect` → `recipeApi.list()` × 2 |
| `apps/web/src/pages/users/UserProfilePage.tsx` | 44-51 | `useEffect` → `api.get('/users/:username')` |
| `apps/web/src/pages/settings/SettingsPage.tsx` | 30-34 | `useEffect` → `api.get('/preferences')` |
| `apps/web/src/components/recipe/LikeButton.tsx` | 10-28 | Manual optimistic toggle |
| `apps/web/src/components/recipe/FavouriteButton.tsx` | 10-28 | Manual optimistic toggle |
| `apps/web/src/components/user/FollowButton.tsx` | 10-31 | Manual toggle |
| `apps/web/src/components/recipe/CommentSection.tsx` | 104-111 | `useEffect` → `api.get()` |

## Fix Approach

Adopt TanStack Query (React Query) for all server state management.

### Technical Approach

1. Install `@tanstack/react-query`
2. Create a `QueryClient` with sensible defaults:
   - `staleTime: 5 * 60 * 1000` (5 minutes)
   - `retry: 2`
   - `refetchOnWindowFocus: true`
3. Wrap app in `QueryClientProvider` in `App.tsx` alongside existing providers (`ThemeProvider`, `I18nProvider`, `AuthProvider`)
4. Migrate pages incrementally, starting with most data-heavy pages
5. Replace `useEffect` + `useState` + `fetch` with `useQuery` / `useMutation`
6. Add proper cache invalidation on mutations
7. Use query key conventions: `['recipes', { filters }]`, `['recipe', slug]`, `['user', username]`

### Provider Tree

```tsx
// apps/web/src/App.tsx
<ThemeProvider>
  <I18nProvider>
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={<PageSkeleton />}>
          <RouterProvider router={router} />
        </Suspense>
      </QueryClientProvider>
    </AuthProvider>
  </I18nProvider>
</ThemeProvider>
```

### Migration Order

1. **RecipeListPage** (pilot) — most complex, validates the pattern
2. **StarredRecipesPage** — reuses the same query key patterns
3. **RecipeDetailPage** — single resource with related queries
4. **HomePage** — two parallel list queries
5. **UserProfilePage** — single user profile query
6. **SettingsPage** — simple GET
7. **LikeButton / FavouriteButton / FollowButton** — mutation handling
8. **CommentSection** — paginated list + mutations

### Query Key Convention

```ts
// List queries with filters
['recipes', { page, perPage, brewMethod, drinkType, ...filters }]

// Starred recipes
['recipes', 'starred', { page, perPage, ...filters }]

// Single recipe
['recipe', slug]

// User profile
['user', username]

// Static data
['equipment']
['tasteNotes']
['preferences']

// Comments
['comments', recipeId, { page }]
```

### Example Migration

**Before:**
```tsx
const [recipes, setRecipes] = useState([]);
const [loading, setLoading] = useState(true);
const [total, setTotal] = useState(0);

useEffect(() => {
  setLoading(true);
  recipeApi.list(params).then((res) => {
    setRecipes(res.data);
    setTotal(res.meta.pagination.total);
  }).catch(() => {}).finally(() => setLoading(false));
}, [params]);
```

**After:**
```tsx
const { data, isLoading, error } = useQuery({
  queryKey: ['recipes', params],
  queryFn: () => recipeApi.list(params),
  staleTime: 5 * 60 * 1000,
});

const recipes = data?.data ?? [];
const total = data?.meta?.pagination?.total ?? 0;
```

## Implementation Steps

1. Read `apps/web/src/App.tsx` to understand provider tree
2. Install `@tanstack/react-query` via the workspace package manager
3. Create `QueryClient` with defaults in a new `apps/web/src/lib/queryClient.ts`
4. Wrap app in `QueryClientProvider` in `App.tsx`
5. Create shared API hooks in `apps/web/src/hooks/queries/`:
   - `useRecipes(params)` — recipe list query
   - `useStarredRecipes(params)` — starred recipes query
   - `useRecipe(slug)` — single recipe query
   - `useEquipment()` — equipment list (static data)
   - `useTasteNotes()` — taste notes (static data)
   - `useUser(username)` — user profile query
6. Migrate `RecipeListPage` as pilot — remove manual state, use `useRecipes`
7. Migrate `StarredRecipesPage` — reuse `useStarredRecipes`
8. Migrate `RecipeDetailPage` — use `useRecipe` + `useTasteNotes`
9. Migrate `HomePage` — use `useRecipes` × 2
10. Migrate `UserProfilePage` — use `useUser`
11. Migrate `SettingsPage` — use `useQuery` for preferences
12. Add `useMutation` to `LikeButton`, `FavouriteButton`, `FollowButton` with `onMutate`/`onError`/`onSettled` for optimistic updates
13. Migrate `CommentSection` — paginated query + mutations
14. Remove all manual loading/error state patterns
15. Run `make check-web`

## Testing Strategy

- Navigate between pages — verify data loads and shows skeleton during fetch
- Like/favourite a recipe — verify UI updates immediately, then persists on reload
- Open two tabs — verify mutations in one tab reflect in the other (via stale refetch)
- Open DevTools Network tab — verify no duplicate requests for same data
- Navigate back to a previously visited page — verify cached data shows instantly
- Test offline/error scenarios — verify error states display correctly

## Risk Assessment

- **Low**: Incremental migration — each page can be migrated independently
- **Medium**: Cache invalidation after mutations requires careful query key management
- **Low**: TanStack Query is a well-established library with excellent Deno/npm compatibility

## Dependencies

- **D14** (useUnitSystem reactivity) — should be migrated in parallel or after
- **D18** (optimistic rollback) — TanStack Query handles this automatically via `onMutate`/`onError`

## References

- TanStack Query docs: https://tanstack.com/query
- React Query DevTools: included in `@tanstack/react-query-devtools`
