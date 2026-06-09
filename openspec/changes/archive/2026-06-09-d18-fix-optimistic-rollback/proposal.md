## Why

D10 migrated Like, Favourite, and Follow buttons to React Router 7's `useFetcher` with optimistic UI via `fetcher.formData`. The component-side pattern is correct: on failure, `fetcher.formData` clears and the button falls back to loader data. However, all three corresponding resource route actions **throw** on API failure instead of **returning** an error object. React Router 7 routes thrown errors from resource routes (accessed by fetchers) to the nearest `errorElement` in the route tree — the root Layout's `<RootErrorBoundary />` — replacing the entire page with a full-screen "Oops" / "Go Home" error UI. This is a regression from D10: pre-D10, a failed Like/Favourite/Follow just left the button stuck; post-D10, it **crashes the entire page**.

## What Changes

- **like.ts**: Replace validation `throw new Response(...)` with `return { ok: false, error: '...' }`. Replace `return null` with `return { ok: true }`. Replace `throw err` in catch with `return { ok: false, error: ... }`.
- **favourite.ts**: Add `createLogger` import and module-scoped logger. Wrap `recipeApi.favourite(id)` in try/catch. Replace validation throw with `return { ok: false, ... }`. Replace `return null` with `return { ok: true }`. Add catch returning `{ ok: false, error: ... }`.
- **follow.ts**: Add `createLogger` import and module-scoped logger. Wrap `followApi.follow/unfollow()` in try/catch. Replace validation throw with `return { ok: false, ... }`. Replace `return null` with `return { ok: true }`. Add catch returning `{ ok: false, error: ... }`.
- **Tests**: Add error-path tests to `LikeButton.test.tsx`, `FavouriteButton.test.tsx`, `FollowButton.test.tsx` verifying buttons revert to initial state when actions return `{ ok: false }` (no page crash, no stuck optimistic state).
- **PR description**: Create `pr_description.md` at project root summarizing the fix.

Component files (`LikeButton.tsx`, `FavouriteButton.tsx`, `FollowButton.tsx`) and router configuration (`router.tsx`) require **no changes** — the optimistic UI pattern is already correct on the component side.

## Capabilities

### New Capabilities

- `optimistic-rollback`: Resource route actions for Like, Favourite, and Follow that return error data instead of throwing, enabling automatic optimistic UI rollback (via `fetcher.formData` clearing) without triggering the root error boundary. Covers the action response shape (`{ ok: bool, error?: string }`), structured logging in all three actions, and test coverage for the error rollback path.

### Modified Capabilities

None. This is an additive fix to the action layer; no existing spec-level requirements change.

## Impact

- **Affected source files (3)**: `apps/web/src/routes/like.ts`, `apps/web/src/routes/favourite.ts`, `apps/web/src/routes/follow.ts`
- **Affected test files (3)**: `apps/web/src/components/recipe/LikeButton.test.tsx`, `apps/web/src/components/recipe/FavouriteButton.test.tsx`, `apps/web/src/components/user/FollowButton.test.tsx`
- **No API changes**, no schema changes, no database migrations, no new dependencies
- **No router changes** — resource routes keep their existing paths and no `errorElement` is added
- **Risk**: Low — the fix is entirely within action files; components, router, and loader wiring unchanged; `{ ok: false }` return is a plain JS object treated by React Router as normal completion with loader revalidation
