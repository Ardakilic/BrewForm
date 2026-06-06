# D18 — No Optimistic Update Rollback

> **Resolved by D10 (React Router 7 migration).**
> Optimistic update rollback is now handled by React Router 7's `useFetcher` API.
> The `fetcher.formData` pattern provides automatic rollback: the optimistic state
> is derived from `fetcher.formData` which reverts when the action fails (the
> fetcher clears its formData on completion). No manual snapshot/restore logic needed.
> Applied to `LikeButton`, `FavouriteButton`, and `FollowButton`.

## Severity

**Medium**

## Issue Description

Three button components perform optimistic UI updates without storing or restoring previous state on API failure:

- `LikeButton.tsx` — toggles like state and count immediately
- `FavouriteButton.tsx` — toggles favourite state and count immediately
- `FollowButton.tsx` — toggles follow state immediately

```ts
// LikeButton.tsx:15-28
async function toggle() {
  if (loading) return;
  setLoading(true);
  try {
    const result = await api.post<{ liked: boolean }>(`/recipes/${recipeId}/like`, {});
    const nowLiked = (result as { liked: boolean }).liked;
    setLiked(nowLiked);
    setCount((c) => nowLiked ? c + 1 : c - 1);
  } catch {
    // BUG: no rollback — UI shows incorrect state
  } finally {
    setLoading(false);
  }
}
```

## Impact

- **Incorrect UI state**: If the API call fails (network error, 429 rate limit, 500 server error), the UI shows the wrong like/favourite/follow state
- **Desync**: The button state no longer matches the server state. The user must reload to see the correct state.
- **User confusion**: Users may think their action succeeded when it didn't

## Root Cause

The optimistic update pattern was implemented without a rollback mechanism. The `catch` block is empty — it doesn't restore the previous state.

## Affected Files

| File | Lines | Description |
|------|-------|-------------|
| `apps/web/src/components/recipe/LikeButton.tsx` | 15-28 | Like toggle without rollback |
| `apps/web/src/components/recipe/FavouriteButton.tsx` | 15-28 | Favourite toggle without rollback |
| `apps/web/src/components/user/FollowButton.tsx` | 15-31 | Follow toggle without rollback |

## Fix Approach

### Option A: TanStack Query (Recommended — depends on D10)

If D10 is done, TanStack Query handles optimistic updates with automatic rollback via `onMutate`/`onError`:

```ts
const likeMutation = useMutation({
  mutationFn: () => api.post(`/recipes/${recipeId}/like`, {}),
  onMutate: async () => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['recipe', slug] });

    // Snapshot previous value
    const previous = queryClient.getQueryData(['recipe', slug]);

    // Optimistically update
    queryClient.setQueryData(['recipe', slug], (old: any) => ({
      ...old,
      userLiked: !old.userLiked,
      likeCount: old.userLiked ? old.likeCount - 1 : old.likeCount + 1,
    }));

    return { previous };
  },
  onError: (err, variables, context) => {
    // Rollback on error
    queryClient.setQueryData(['recipe', slug], context?.previous);
  },
  onSettled: () => {
    // Always refetch to ensure consistency
    queryClient.invalidateQueries({ queryKey: ['recipe', slug] });
  },
});
```

### Option B: Manual Snapshot and Rollback (If D10 not done)

Store the previous state before the optimistic update and restore it on failure:

```ts
async function toggle() {
  if (loading) return;
  setLoading(true);

  const previousLiked = liked;
  const previousCount = count;

  try {
    setLiked(!liked);
    setCount((c) => !liked ? c + 1 : (c ?? 0) - 1);

    const result = await api.post<{ liked: boolean }>(`/recipes/${recipeId}/like`, {});
    const nowLiked = (result as { liked: boolean }).liked;
    setLiked(nowLiked);
    setCount((c) => nowLiked ? (previousLiked ? (c ?? 0) + 1 : c) : (previousLiked ? (c ?? 0) - 1 : c));
  } catch (err) {
    log.error({ err }, 'Like toggle failed');
    // Rollback
    setLiked(previousLiked);
    setCount(previousCount);
  } finally {
    setLoading(false);
  }
}
```

Simplified for the toggle pattern:

```ts
async function toggle() {
  if (loading) return;
  setLoading(true);

  // Snapshot current state
  const prevLiked = liked;
  const prevCount = count;

  // Optimistically update
  setLiked(!prevLiked);
  setCount((c) => (c ?? 0) + (prevLiked ? -1 : 1));

  try {
    const result = await api.post<{ liked: boolean }>(`/recipes/${recipeId}/like`, {});
    // Server confirmed — set the actual value (may differ from optimistic)
    setLiked(result.liked);
    setCount((c) => result.liked ? (prevCount ?? 0) + 1 : (prevCount ?? 0) - 1);
  } catch (err) {
    // Rollback on failure
    setLiked(prevLiked);
    setCount(prevCount);
  } finally {
    setLoading(false);
  }
}
```

### Option C: Remove Optimistic Updates (Simplest)

Just wait for the server response before updating the UI:

```ts
async function toggle() {
  if (loading) return;
  setLoading(true);
  try {
    const result = await api.post<{ liked: boolean }>(`/recipes/${recipeId}/like`, {});
    setLiked(result.liked);
    setCount((c) => result.liked ? c + 1 : c - 1);
  } catch (err) {
    log.error({ err }, 'Like toggle failed');
  } finally {
    setLoading(false);
  }
}
```

Trade-off: Slightly slower UI response (waits for round-trip), but always correct.

## Implementation Steps

### If D10 is done:

1. Verify TanStack Query mutations are set up for like/favourite/follow
2. Verify `onMutate` stores previous state and `onError` rolls back
3. Verify `onSettled` invalidates relevant queries
4. Test with DevTools offline mode

### If D10 is not done:

1. Read `LikeButton.tsx`, `FavouriteButton.tsx`, `FollowButton.tsx`
2. For each component, add previous state snapshot before optimistic update
3. In the `catch` block, restore previous state
4. Add `log.error()` in the catch block for debugging
5. Test with DevTools offline mode — toggle like/favourite/follow, verify rollback
6. Run `make check-web`

## Testing Strategy

- Open a recipe → click Like → verify heart fills immediately
- Toggle DevTools Network → Offline
- Click Like again → verify UI rolls back to previous state
- Go back Online → verify state matches server
- Repeat for Favourite and Follow buttons
- Verify count numbers are correct after rollback
- Verify no stale state remains after failed mutation

## Risk Assessment

- **Low**: Option A (TanStack Query) handles everything automatically
- **Low**: Option B (manual rollback) is straightforward but must handle edge cases
- **Low**: Option C (no optimistic update) is simplest but less responsive

## Dependencies

- **D10** (TanStack Query) — Option A depends on this
- None for Options B or C
