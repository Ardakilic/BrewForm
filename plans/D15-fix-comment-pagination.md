# D15 — Comment Pagination "Load More" Broken

> **Validation status (June 2026): NOT resolved.**
> The original plan contained a blanket claim that this issue was "Resolved by D10."
> That claim is incorrect. The initial-page load works correctly (D10 did migrate it to a
> React Router loader), but the "Load More" button remains silently broken because the
> `comments/recipe/:recipeId` resource route in `router.tsx` is registered with an
> `action` only — no `loader`. React Router's `useFetcher().load()` calls a route
> **loader** (GET), so clicking "Load More" throws a React Router error at runtime.
> Seven errors were found in the original plan and are documented at the end of this file.

## Severity

**Medium**

## Issue Description

The "Load More" button in `CommentSection.tsx` is silently broken. When a user clicks it,
`loadMoreFetcher.load('/comments/recipe/${recipeId}?page=${page + 1}')` is called (line 460).
This triggers a React Router GET fetch to the route `comments/recipe/:recipeId`. However,
that route in `router.tsx` is registered as an action-only resource route (line 231):

```ts
// router.tsx:231
{ path: 'comments/recipe/:recipeId', action: createCommentAction },
```

There is no `loader` defined. React Router's `fetcher.load(href)` requires a loader at the
target route. Without one, React Router throws at runtime:

```
You made a GET fetch to '/comments/recipe/...' but
no loader is defined for that route
```

As a result, `loadMoreFetcher.data` is never populated, the `useEffect` at lines 171–181
never runs, and no additional comments are ever appended.

The initial page load is fine: `RecipeDetailPage.loader` (line 66) calls
`commentApi.list(recipe.id, 1)` directly against the backend and passes the result as
`initialComments` to `CommentSection`. That path is correct. The problem is exclusively
in the "Load More" path via `useFetcher().load()`.

## Impact

- **Broken "Load More"**: Clicking the button throws a React Router error. Users with
  more than one page of comments (typically >10 per page) cannot see any comments beyond
  the first page.
- **Comment count heading is accurate**: `total` is correctly initialised from
  `initialComments.meta.pagination.total` (line 68), so the count heading shows the real
  total — the only broken piece is fetching subsequent pages.

## Root Cause

`useFetcher().load(url)` in React Router dispatches a GET request to the route at `url`
and invokes that route's **loader**. The `comments/recipe/:recipeId` route has no loader —
only `action: createCommentAction`. Adding a `listCommentsLoader` to `routes/comments.ts`
and wiring it into `router.tsx` is the entire fix.

## Affected Files

| File | Lines | Description |
|------|-------|-------------|
| `apps/web/src/routes/comments.ts` | (new export) | Add `listCommentsLoader` |
| `apps/web/src/router.tsx` | 39, 231 | Import and register the loader |

`CommentSection.tsx` requires **no changes** — the `loadMoreFetcher` implementation is
already correct (lines 171–181, 454–467).

## Fix Approach

### Step 1 — Add `listCommentsLoader` to `routes/comments.ts`

```ts
// apps/web/src/routes/comments.ts  (additions shown)

import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';   // add LoaderFunctionArgs
import { commentApi } from '../api/index.ts';
import { createLogger } from '@/utils/logger.ts';

const logger = createLogger('comments');

// ── NEW: loader for GET /comments/recipe/:recipeId?page=N ───────────────────
export const listCommentsLoader = async ({ params, request }: LoaderFunctionArgs) => {
  const recipeId = params.recipeId;
  if (typeof recipeId !== 'string' || recipeId.length === 0) {
    throw new Response('Missing recipe id', { status: 400 });
  }
  const url = new URL(request.url);
  const pageParam = url.searchParams.get('page');
  const page = pageParam ? parseInt(pageParam, 10) : 1;
  logger.debug({ recipeId, page }, 'listCommentsLoader started');
  return commentApi.list(recipeId, isNaN(page) ? 1 : page);
};

// existing exports unchanged below...
export const createCommentAction = async ({ params, request }: ActionFunctionArgs) => { ... };
export const deleteCommentAction = async ({ params }: ActionFunctionArgs) => { ... };
```

### Step 2 — Import and register the loader in `router.tsx`

**Line 39** (import statement):

```ts
// Before:
import { createCommentAction, deleteCommentAction } from './routes/comments.ts';

// After:
import { createCommentAction, deleteCommentAction, listCommentsLoader } from './routes/comments.ts';
```

**Line 231** (route registration):

```ts
// Before:
{ path: 'comments/recipe/:recipeId', action: createCommentAction },

// After:
{ path: 'comments/recipe/:recipeId', loader: listCommentsLoader, action: createCommentAction },
```

React Router correctly dispatches to the `loader` on GET and to the `action` on POST/DELETE,
so adding `loader` alongside the existing `action` does not affect comment submission.

### What stays the same

`CommentSection.tsx` is already correct:

- `loadMoreFetcher.load('/comments/recipe/${recipeId}?page=${page + 1}')` at line 460
  correctly targets the route that will now have a loader.
- The `loadMoreFetcher` `useEffect` at lines 171–181 already extracts
  `result.meta.pagination.total` and appends comments to state.
- `total > comments.length` on line 454 correctly gates the "Load More" button.
- The `PaginatedResponse<T>` interface in `api/types.ts:175-185` already models the shape.

## Implementation Steps

1. Open `apps/web/src/routes/comments.ts`. Add `LoaderFunctionArgs` to the `react-router`
   type import on line 1.
2. Add `listCommentsLoader` as a new export (before the existing action exports for
   readability).
3. Open `apps/web/src/router.tsx`. Add `listCommentsLoader` to the import from
   `./routes/comments.ts` on line 39.
4. On line 231, add `loader: listCommentsLoader` to the `comments/recipe/:recipeId` route
   object.
5. Run `make check-web` to confirm TypeScript and lint pass.
6. Smoke-test manually: navigate to a recipe with >10 comments, verify "Load More" appears
   and clicking it appends the next page without replacing existing comments.

## Test Coverage Gap

`CommentSection.test.tsx` has no tests for "Load More" behaviour. The test helper
`renderCommentSection()` (lines 180–216) registers the `comments/recipe/:recipeId` route
with only an `action` — no `loader`. A future "Load More" test should:

1. Add a `loader` to the test router's `comments/recipe/:recipeId` route that returns a
   mock second-page `PaginatedResponse`.
2. Assert that clicking "Load More" appends new comments and updates the count heading.
3. Assert that "Load More" disappears once `total === comments.length`.

These tests are not blocking the fix but should accompany it.

## Testing Strategy

- Navigate to a recipe with 0 comments — verify no "Load More" button, heading shows "0 comments"
- Navigate to a recipe with 1–9 comments — verify no "Load More" button (all on one page)
- Navigate to a recipe with 10+ comments — verify "Load More" button appears
- Click "Load More" — verify new comments are appended, existing comments remain
- Verify the count heading shows the actual total throughout
- Verify "Load More" disappears when all comments are loaded (`total === comments.length`)
- Verify comment submission (POST) still works after adding the loader to the route
- Run `make check-web`

## Risk Assessment

- **Low**: Minimal change — two lines in `router.tsx`, one new function in `routes/comments.ts`
- **Low**: Adding `loader` alongside `action` on a resource route is standard React Router
  practice; POST/DELETE dispatch is unaffected
- **Low**: No backend or database changes; `commentApi.list()` already used by the page loader

## Dependencies

- None (standalone frontend fix)

---

## Validation Notes — Errors Found in Original Plan

Seven errors were identified during validation against the `main` branch (June 2026).

### Error 1 — Critical: False resolution claim

**Original:** Header blockquote stated "Resolved by D10 (React Router 7 migration)."

**Reality:** Not resolved. `loadMoreFetcher.load()` still targets a loader-less route.

---

### Error 2 — Critical: Wrong root cause

**Original:** "The root cause is on line 108 … `useEffect(() => api.get<Comment[]>(…))` …
`setTotal(Array.isArray(data) ? data.length : 0)`"

**Reality:** This code does not exist anywhere in `CommentSection.tsx`. The component
uses `useFetcher` throughout, not `useEffect + api.get`. The actual root cause is the
missing `loader` on the `comments/recipe/:recipeId` route in `router.tsx`.

---

### Error 3 — Critical: Wrong affected file

**Original:** Affected file listed as `apps/web/src/components/recipe/CommentSection.tsx`
lines 104–111.

**Reality:** `CommentSection.tsx` requires no changes. The affected files are
`apps/web/src/routes/comments.ts` (new `listCommentsLoader`) and
`apps/web/src/router.tsx` (lines 39 and 231).

---

### Error 4 — High: Non-existent "Current Code" snippet

**Original:** "Current Code" block showed:
```ts
api.get<Comment[]>(`/comments/recipe/${recipeId}?page=${page}`)
  .then((data: Comment[]) => {
    setComments(Array.isArray(data) ? data : []);
    setTotal(Array.isArray(data) ? data.length : 0);
  })
```

**Reality:** This pattern does not appear anywhere in the file. The component already
uses correctly typed `useFetcher` with `initialComments` props.

---

### Error 5 — High: Non-existent "Fixed Code" snippet

**Original:** "Fixed Code" block showed replacing the above with a `PaginatedComments`
interface and `api.get<PaginatedComments>()` call.

**Reality:** Inapplicable — there is no `api.get()` call to replace, and
`PaginatedResponse<T>` already exists in `api/types.ts:175–185`.

---

### Error 6 — Medium: Wrong implementation steps

**Original:** Steps 1–7 described reading/modifying `CommentSection.tsx:104–111`.

**Reality:** Steps should target `routes/comments.ts` (new loader) and `router.tsx`
(import + route registration). `CommentSection.tsx` is not touched.

---

### Error 7 — Medium: Missing test coverage gap

**Original:** Testing Strategy listed user-facing scenarios but made no mention of the
fact that `CommentSection.test.tsx` has no "Load More" tests and that the test router
in `renderCommentSection()` would need a loader to support them.

**Reality:** The gap is real and should be addressed alongside the fix.