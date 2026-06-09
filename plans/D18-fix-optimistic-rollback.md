# D18 — No Optimistic Update Rollback

> **Status: OPEN — action layer incomplete.**
>
> D10 correctly migrated all three button components to `useFetcher` with the
> `fetcher.formData` optimistic UI pattern — the component side is architecturally
> correct. However, all three corresponding action files still **throw** on API
> failure instead of returning an error object. In React Router 7, a thrown error
> from a resource route accessed by a fetcher bubbles to the nearest
> `errorElement` in the route tree. Since the resource routes carry no
> `errorElement`, the error propagates to the root Layout's
> `errorElement: <RootErrorBoundary />`, replacing the entire page with the
> full-screen "Oops" / "Go Home / Reload" UI.
>
> The rollback mechanism (`fetcher.formData → null → falls back to loaderData`)
> only activates when the action **returns** (success or error). It never
> activates when the action **throws**, because React Router processes the throw
> as a navigation-level error before the fetcher can settle normally.
>
> **Fix scope is limited to three action files.** The component files need
> no changes.

---

## Severity

**High** — regression introduced by D10. The original bug (pre-D10) left the
button in a wrong state but the page remained fully usable. The current bug
crashes the page on any transient API failure (network error, 429, 500) during
a Like, Favourite, or Follow toggle.

---

## Issue Description

### What D10 did implement correctly

All three button components were migrated from `useState` + `useEffect` +
manual `api.post()` calls to `useFetcher` with `fetcher.Form`/`fetcher.submit`.
Optimistic state is correctly derived from `fetcher.formData`:

```ts
// LikeButton.tsx:16-20
const optimisticLiked = fetcher.formData ? fetcher.formData.get('liked') === 'true' : null;
const liked = optimisticLiked ?? initialLiked;          // falls back to loaderData on settle

const pendingDelta = fetcher.formData ? (fetcher.formData.get('liked') === 'true' ? 1 : -1) : 0;
const count = (initialCount ?? 0) + pendingDelta;

// FavouriteButton.tsx:15-22 — identical pattern with 'favourited'
// FollowButton.tsx:16-17  — identical pattern with 'following'
```

`initialLiked`, `initialFavourited`, and `initialFollowing` come from
`useLoaderData()` in their respective parent pages (`RecipeDetailPage`,
`UserProfilePage`). On a successful action React Router revalidates the loaders,
the props update, and the button shows the confirmed server state. On a **failed
action that returns normally**, `fetcher.formData` clears, the component falls
back to the original loaderData value, and the loader revalidation restores the
correct server state — a clean automatic rollback.

### What is still broken — the action layer

The rollback only fires when the action **returns**. All three action files
**throw** on API failure:

```ts
// like.ts:19-22 — explicit re-throw inside try/catch
} catch (err: unknown) {
  logger.error({ err, id }, 'likeAction failed');
  throw err;   // ← triggers error boundary
}

// favourite.ts:9 — no try/catch; API error propagates unchecked
await recipeApi.favourite(id);   // ← throws ApiError on non-OK response

// follow.ts:10-12 — no try/catch; API errors propagate unchecked
if (request.method === 'DELETE') {
  await followApi.unfollow(userId);   // ← throws
} else {
  await followApi.follow(userId);     // ← throws
}
```

`recipeApi.like/favourite` and `followApi.follow/unfollow` all delegate to
`api.post/delete` in `apps/web/src/api/client.ts`, which throws `ApiError`
(extends `Error`) for any non-OK response and re-throws network errors.

### Error boundary routing

The three resource routes have no `errorElement`:

```ts
// router.tsx:227-230
{ path: 'recipes/:id/like',      action: likeAction },      // no errorElement
{ path: 'recipes/:id/favourite', action: favouriteAction }, // no errorElement
{ path: 'follow/:userId',        action: followAction },    // no errorElement
```

They are children of the root Layout route at `'/'`, which carries:

```ts
// router.tsx:44-45
{
  path: '/',
  element: <Layout />,
  errorElement: <RootErrorBoundary />,   // ← catches all unhandled throws
  children: [ ... ]
}
```

React Router 7 confirms the behavior in its documentation for resource routes:

> "If you `throw` from your resource route [accessed by a `fetcher`], it will
> bubble to the nearest `ErrorBoundary` in the UI."
> — `docs/how-to/resource-routes.md`

`RootErrorBoundary` (`apps/web/src/components/ErrorBoundary.tsx:9,40`) renders
`min-h-screen` full-page content (heading, message, "Go Home" and "Reload Page"
buttons). The entire page — including the Layout and navbar — is replaced.

### Before vs after D10

| Scenario              | Pre-D10 (`useState`)          | Post-D10 current (broken)           |
|-----------------------|-------------------------------|--------------------------------------|
| API fails during Like | Button stuck in wrong state   | Full-screen error page — page crash  |
| Page usable after?    | Yes (just wrong button state) | No — user must navigate or reload    |
| Severity              | Medium                        | **High** (regression)                |

---

## Affected Files

| File | Lines | Problem |
|------|-------|---------|
| `apps/web/src/routes/like.ts` | 10, 21 | Line 10: throws `Response` for invalid params; line 21: re-throws API error |
| `apps/web/src/routes/favourite.ts` | 7, 9 | Line 7: throws `Response`; line 9: no try/catch on API call |
| `apps/web/src/routes/follow.ts` | 7, 10–12 | Line 7: throws `Response`; lines 10–12: no try/catch on API calls |

**Components are not affected** — `LikeButton.tsx`, `FavouriteButton.tsx`, and
`FollowButton.tsx` already implement the correct pattern.

---

## Advisory: `FollowButton.onToggleRollback` is dead code

`FollowButton` carries a callback-based rollback mechanism (lines 8–9, 19–20,
42–55) that was intended for parent-managed state scenarios:

```ts
// FollowButton.tsx:46-49
if (fetcher.data && typeof fetcher.data === 'object' && 'error' in fetcher.data) {
  log.debug({ userId }, 'fetcher settled with error');
  onToggleRollback?.(initialFollowing);
  return;
}
```

This mechanism is currently dead for two independent reasons:

1. `followAction` throws on failure (never returns `{ error: ... }`), so
   `fetcher.data` is `undefined`, not an error object. The `'error' in
   fetcher.data` guard never fires.

2. `UserProfilePage` (lines 187–190) passes only `userId` and
   `initialFollowing` — neither `onToggle` nor `onToggleRollback` is wired
   up at the call site.

After the action fix below, reason 1 is eliminated: `followAction` will return
`{ ok: false, error: '...' }`, making the guard fire correctly. Reason 2
(no-op callbacks) is a separate concern and can be addressed independently if
parent-controlled follow state is ever needed. No changes to `FollowButton`
or `UserProfilePage` are required for D18.

---

## Fix Approach

Convert all three action files to **return** error data on failure instead
of throwing. The `fetcher.formData → loaderData` rollback mechanism in the
components already handles the visual rollback automatically once the action
settles without throwing.

### `apps/web/src/routes/like.ts`

```ts
import type { ActionFunctionArgs } from 'react-router';
import { recipeApi } from '../api/index.ts';
import { createLogger } from '@/utils/logger.ts';

const logger = createLogger('like');

export const likeAction = async ({ params }: ActionFunctionArgs) => {
  const id = params.id;
  if (typeof id !== 'string' || id.length === 0) {
    return { ok: false, error: 'Missing or invalid route parameter: id' };
  }

  logger.debug({ id }, 'likeAction started');

  try {
    await recipeApi.like(id);
    logger.debug({ id }, 'likeAction completed');
    return { ok: true };
  } catch (err: unknown) {
    logger.error({ err, id }, 'likeAction failed');
    return { ok: false, error: err instanceof Error ? err.message : 'Like failed' };
  }
};
```

**Changes from current:**
- Line 10: `throw new Response(...)` → `return { ok: false, error: '...' }`
- Line 18: `return null` → `return { ok: true }`
- Line 21: `throw err` → `return { ok: false, error: ... }`

### `apps/web/src/routes/favourite.ts`

```ts
import type { ActionFunctionArgs } from 'react-router';
import { recipeApi } from '../api/index.ts';
import { createLogger } from '@/utils/logger.ts';

const logger = createLogger('favourite');

export const favouriteAction = async ({ params }: ActionFunctionArgs) => {
  const id = params.id;
  if (typeof id !== 'string' || id.length === 0) {
    return { ok: false, error: 'Missing route parameter: id' };
  }

  logger.debug({ id }, 'favouriteAction started');

  try {
    await recipeApi.favourite(id);
    logger.debug({ id }, 'favouriteAction completed');
    return { ok: true };
  } catch (err: unknown) {
    logger.error({ err, id }, 'favouriteAction failed');
    return { ok: false, error: err instanceof Error ? err.message : 'Favourite failed' };
  }
};
```

**Changes from current:**
- Line 7: `throw new Response(...)` → `return { ok: false, error: '...' }`
- No logger existed — add `createLogger('favourite')` import and calls
- Line 9: bare `await recipeApi.favourite(id)` with no try/catch → wrap in try/catch
- Line 10: `return null` → `return { ok: true }`
- Add catch block returning `{ ok: false, error: ... }`

### `apps/web/src/routes/follow.ts`

```ts
import type { ActionFunctionArgs } from 'react-router';
import { followApi } from '../api/index.ts';
import { createLogger } from '@/utils/logger.ts';

const logger = createLogger('follow');

export const followAction = async ({ params, request }: ActionFunctionArgs) => {
  const userId = params.userId;
  if (typeof userId !== 'string' || userId.length === 0) {
    return { ok: false, error: 'Missing or invalid userId' };
  }

  logger.debug({ userId, method: request.method }, 'followAction started');

  try {
    if (request.method === 'DELETE') {
      await followApi.unfollow(userId);
    } else {
      await followApi.follow(userId);
    }
    logger.debug({ userId }, 'followAction completed');
    return { ok: true };
  } catch (err: unknown) {
    logger.error({ err, userId }, 'followAction failed');
    return { ok: false, error: err instanceof Error ? err.message : 'Follow action failed' };
  }
};
```

**Changes from current:**
- Line 7: `throw new Response(...)` → `return { ok: false, error: '...' }`
- No logger existed — add `createLogger('follow')` import and calls
- Lines 9–14: bare `await followApi.unfollow/follow()` with no try/catch → wrap in try/catch
- Line 14: `return null` → `return { ok: true }`
- Add catch block returning `{ ok: false, error: ... }`

---

## Why returning `{ ok: false }` is correct and sufficient

**On failure (action returns `{ ok: false, error: '...' }`):**

1. `fetcher.state` → `'loading'` (revalidating) → `'idle'`
2. `fetcher.formData` → `null` — optimistic state evicted
3. `fetcher.data` = `{ ok: false, error: '...' }`
4. Components fall back: `optimisticLiked ?? initialLiked` → `null ?? initialLiked` → shows server-confirmed state
5. React Router revalidates loaders (action returned normally, not threw) → loader fetches fresh data, `initialLiked` prop updates to confirmed server value
6. `RootErrorBoundary` is **not** triggered ✓
7. Page remains fully usable ✓

**On success (action returns `{ ok: true }`):**

1. Same revalidation flow — loaders update `initialLiked` to new confirmed value
2. `fetcher.formData` cleared → brief fallback to old `initialLiked` during revalidation — invisible in practice since loaders complete within the same render cycle on fast connections

**Note on `fetcher.data` consumer readiness:**
`LikeButton` and `FavouriteButton` do not currently read `fetcher.data`, so the
`{ ok: false }` return is only consumed by `FollowButton`'s `'error' in
fetcher.data` guard (which will now fire correctly, though the callback is a
no-op at the current call site). If inline error feedback is desired in
`LikeButton`/`FavouriteButton` in the future, it can be added by checking
`fetcher.data?.ok === false`.

---

## Implementation Steps

1. **Read** `apps/web/src/routes/like.ts` — confirm current state matches analysis above
2. **Edit** `like.ts`: replace `throw new Response(...)` with `return { ok: false, ... }` (line 10); replace `return null` with `return { ok: true }` (line 18); replace `throw err` with `return { ok: false, ... }` (line 21)
3. **Read** `apps/web/src/routes/favourite.ts` — confirm current state
4. **Edit** `favourite.ts`: add `createLogger` import; replace validation throw (line 7) with `return`; wrap lines 9–10 in try/catch; change `return null` to `return { ok: true }`; add catch returning `{ ok: false, ... }`
5. **Read** `apps/web/src/routes/follow.ts` — confirm current state
6. **Edit** `follow.ts`: add `createLogger` import; replace validation throw (line 7) with `return`; wrap lines 9–13 in try/catch; change `return null` to `return { ok: true }`; add catch returning `{ ok: false, ... }`
7. **Update tests** in `LikeButton.test.tsx`, `FavouriteButton.test.tsx`, `FollowButton.test.tsx` — add error scenario (see Testing Strategy)
8. Run `make check-web`

---

## Testing Strategy

### Manual test (DevTools)

1. Open a recipe → click Like → heart fills immediately (optimistic)
2. DevTools → Network → set Offline
3. Click Like again → verify the button **reverts** to previous state after the request fails (button not stuck, page not replaced by error screen)
4. Verify the full navbar and page are still visible (no `RootErrorBoundary` takeover)
5. Set Network back to Online → click Like → verify normal flow still works
6. Repeat steps 1–5 for Favourite on the same recipe
7. Navigate to a user profile → repeat steps 1–5 for Follow

### Automated tests to add

Add a new `describe` block in each component test file to cover the error path.
Each test router should provide an action that **returns** `{ ok: false, error: 'server error' }`.

**`LikeButton.test.tsx` — add:**

```tsx
describe('LikeButton — action failure rollback', () => {
  it('reverts to initial state when action returns an error', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <LikeButton recipeId='recipe-1' initialLiked={false} initialCount={3} />,
          children: [
            {
              path: 'recipes/:id/like',
              action: () => ({ ok: false, error: 'server error' }),
              element: null,
            },
          ],
        },
      ],
      { initialEntries: ['/'] },
    );
    render(<RouterProvider router={router} />);
    const button = screen.getByRole('button');

    await user.click(button);

    // After action settles (ok: false), formData clears, button reverts
    await waitFor(() => {
      expect(button).not.toBeDisabled();
      expect(button.textContent).toContain('3'); // count unchanged
    });
  });
});
```

Apply the same pattern for `FavouriteButton.test.tsx` and `FollowButton.test.tsx`,
adjusting field names (`favourited`, `following`) and expected initial values.

---

## Risk Assessment

**Low** — the fix is entirely within the action layer. The component files, router
configuration, and loaderData wiring are unchanged. The `{ ok: false }` return
is a plain JS object (not a thrown `Response`), so React Router treats it as a
normal action completion and proceeds with loader revalidation — exactly the
behavior required for the rollback to work.

---

## Dependencies

None. This plan is self-contained. D10 (React Router 7 migration) is a
prerequisite and is already complete.