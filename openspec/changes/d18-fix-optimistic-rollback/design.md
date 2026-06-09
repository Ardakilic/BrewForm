## Context

This fix addresses a regression introduced by D10 (React Router 7 migration). D10 migrated Like, Favourite, and Follow buttons from manual `useState` + `api.post()` calls to `useFetcher` with `fetcher.Form` / `fetcher.submit`. The optimistic UI pattern on the component side is correct:

```
optimistic = fetcher.formData?.get('liked') === 'true'        // null while pending → optimistic value
displayed = optimistic ?? initialLiked                        // falls back to loader data when settled
```

On action failure, `fetcher.formData` clears (→ `null`), the component reads `initialLiked` from loader data, and React Router revalidates loaders — **but only when the action returns normally**. The current action code throws on failure, which bypasses this mechanism entirely.

### Current (broken) error flow

```
User clicks Like
  → fetcher.Form submits POST /recipes/:id/like
  → likeAction: recipeApi.like(id) throws (network error / 500)
  → likeAction catch: logger.error(); throw err  ← BUG
  → React Router: thrown error, no errorElement on resource route
  → error bubbles to root Layout errorElement → RootErrorBoundary
  → entire page replaced with "Oops" screen
  → fetcher.formData never clears (action never settled)
```

### Fixed error flow

```
User clicks Like
  → fetcher.Form submits POST /recipes/:id/like
  → likeAction: recipeApi.like(id) throws (network error / 500)
  → likeAction catch: logger.error(); return { ok: false, error: '...' }  ← FIX
  → React Router: action returned normally (plain object)
  → fetcher.state → idle, fetcher.data = { ok: false, error: '...' }
  → fetcher.formData → null (clears)
  → component: optimisticLiked ?? initialLiked → null ?? initialLiked → server state
  → loader revalidation: loaders fetch fresh data
  → RootErrorBoundary NOT triggered ✓
```

### Error chain

The API call chain is:

```
likeAction  → recipeApi.like(id)                [apps/web/src/api/index.ts:58]
             → api.post(`/recipes/${id}/like`, {})  [apps/web/src/api/client.ts:90]
             → request<T>()                     [client.ts:70]
             → requestInternal()                [client.ts:12]
             → fetch() + error handling         [client.ts:42-63]
```

`requestInternal` throws `ApiError` (extends `Error`) for non-OK responses and re-throws network errors. The action's catch captures both cases and now returns `{ ok: false }` instead of re-throwing.

## Goals / Non-Goals

**Goals:**

- Prevent full-page crashes (RootErrorBoundary takeover) when Like, Favourite, or Follow API calls fail
- Enable automatic optimistic UI rollback on failure (button reverts to server-confirmed state)
- Maintain structured logging in all three actions (entry/exit/error logs)
- Add automated test coverage for both error rollback and success completion paths in all three button components
- Verify FollowButton's `onToggle` and `onToggleRollback` callback contracts through explicit mock assertions

**Non-Goals:**

- Adding inline error feedback (toast, inline message) to LikeButton/FavouriteButton — the `{ ok: false }` return enables this in the future via `fetcher.data?.ok === false` but no UI changes are made
- Fixing the FollowButton's dead callback-based rollback (`onToggleRollback`) — this becomes naturally functional after the action fix (the guard fires correctly), but the callbacks remain no-ops at the current call site
- Adding `errorElement` to resource routes — the correct fix is to never throw, not to catch throws
- Changing other resource routes (rate, comments) — they are out of scope
- Adding unit tests for action files directly — actions are tested through component integration tests

## Decisions

### Decision 1: Return `{ ok: bool, error?: string }` instead of throwing

**Alternatives considered:**

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Return `{ ok, error }` plain object | Fetcher settles normally; `formData` clears; loader revalidation runs; no error boundary | None | **Chosen** |
| Throw `new Response('...', { status: 4xx })` | Standard HTTP error pattern | With React Router 7, thrown `Response` from fetcher-accessed resource routes bubbles to nearest errorElement | Rejected |
| Add `errorElement` to each resource route | Contained error UI per route | Doubles code; still replaces page content; doesn't let rollback fire | Rejected |
| `return null` on error (silent) | Simplest | No `fetcher.data` for consumers; `formData` still clears but no error info | Rejected — loses diagnostics |

**Rationale:** Returning a plain JS object is the idiomatic React Router 7 pattern for fetcher actions. React Router treats it as a normal action completion: `fetcher.state` transitions to idle, `fetcher.formData` clears, and loaders revalidate. The `{ ok: false, error }` shape provides error information in `fetcher.data` for any consumer that wants it.

### Decision 2: Wrap all API calls in try/catch within each action

**Alternatives considered:**

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| try/catch in each action | Fine-grained error context; action-specific logging | Slight code duplication (similar pattern in 3 files) | **Chosen** |
| Shared `safeAction` wrapper | DRY | Less flexible error messages; harder to add action-specific logging; adds abstraction layer | Rejected |
| Let API errors propagate and catch at a middleware level | Centralized handling | No action-specific context; `fetcher` doesn't settle properly with middleware-level catches | Rejected |

**Rationale:** Each action needs to log with its own module-scoped logger and include action-specific identifiers (recipe `id` or `userId`). The pattern is boilerplate-light (3 lines for try/catch) and consistent across all three files.

### Decision 3: Use `err instanceof Error ? err.message : '...'` for error extraction

The `ApiError` class extends `Error` and carries a human-readable `message` from the backend. Network errors (`TypeError: Failed to fetch`) also extend `Error`. This extraction provides useful diagnostic info in `fetcher.data` while falling back to a generic message for unknown error types.

**Security note:** The error message is only stored in `fetcher.data` on the client side. LikeButton and FavouriteButton do NOT render `fetcher.data` in the DOM. FollowButton reads `'error' in fetcher.data` as a boolean signal. No server error messages are displayed to end users by these components.

### Decision 4: No component changes needed

The `optimistic ?? initial` pattern in all three components is already correct. When `fetcher.formData` clears (action settles), `optimistic` becomes `null`, and the nullish coalescing operator falls through to `initial*` props from loader data. Adding error feedback would be a separate feature.

### Decision 5: Test approach — component integration tests with settling actions

The existing tests use a hanging action (`() => new Promise(() => {})`) that never settles — this only tests the pending/disabled state. New tests provide actions that immediately return a value, letting the fetcher settle through to the completion state.

**Error path tests** (action returns `{ ok: false, error: '...' }`) verify:

1. Button is not disabled after the action settles (fetcher state → idle)
2. Button shows original count/state (optimistic state rolled back via `fetcher.formData` clearing)
3. No error boundary takeover (implicit — `render()` doesn't throw)

**Success path tests** (action returns `{ ok: true }`) verify:

1. Button is not disabled after the action settles (fetcher cycle completes normally)
2. Button shows original count/state (fetcher.formData clears, falls back to props)
3. FollowButton-specific: `onToggle` callback fires with the correct new following value on success; `onToggleRollback` fires with `initialFollowing` on error

**Note on visual state in tests without loaders:** Since the test routers do not provide loaders that return updated data, `initialLiked`/`initialCount`/`initialFollowing` props remain unchanged after action completion. This means both success and error paths result in the same visual state (original values). The test assertions therefore focus on:
- Action lifecycle completion (button not disabled)
- Correct callback invocation (FollowButton's `onToggle`/`onToggleRollback`)
- No error boundary trigger (implicit)

## Risks / Trade-offs

1. **Risk: `{ ok: false }` return shape may be consumed by existing code unexpectedly**
   → **Mitigation:** LikeButton and FavouriteButton don't read `fetcher.data` at all. FollowButton already checks `'error' in fetcher.data` — the new `{ ok, error }` shape satisfies this check (both `ok` and `error` properties exist). No breaking change.

2. **Risk: Backend `ApiError` messages may contain sensitive info leaked to `fetcher.data`**
   → **Mitigation:** No component renders `fetcher.data` content to the DOM. `fetcher.data` is a JavaScript object visible only via React DevTools or console inspection. This is identical to the current exposure via thrown errors in console. If backend error messages contain PII, that's a separate backend fix.

3. **Risk: React Router `v7_skipActionErrorRevalidation` flag may affect loader revalidation**
   → **Mitigation:** This flag only applies to thrown errors and thrown `Response` objects with 4xx/5xx status. Returning a plain `{ ok: false }` object is NOT affected — loaders revalidate normally. The project does not set this flag in its router configuration.

4. **Risk: `followAction` uses `request.method` to branch between follow/unfollow. If action returns `{ ok: false }` on validation, the method comparison never runs.**
   → **Mitigation:** Validation runs first, before the `request.method` branch. This is the current behavior (the `throw new Response(...)` also short-circuits before the method check). No behavioral change.

## Open Questions

None. All design decisions have been resolved based on codebase analysis, React Router 7 documentation, and the existing component patterns.
