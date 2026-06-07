> **Note on code examples:** Code snippets in this document are illustrative references reflecting the intent of each change. They may not match the current codebase exactly. All snippets, file paths, and line numbers MUST be double-checked against the actual source files before implementation.

## Why

**The "Load More" button in `CommentSection.tsx` is silently broken.** When a user clicks it, `loadMoreFetcher.load('/comments/recipe/${recipeId}?page=N')` at `CommentSection.tsx:460` dispatches a GET fetch to the React Router route `comments/recipe/:recipeId`. That route at `router.tsx:231` is registered as an action-only resource route:

```ts
// apps/web/src/router.tsx:231
{ path: 'comments/recipe/:recipeId', action: createCommentAction }
```

There is no `loader` on this route. React Router's `fetcher.load(href)` **requires** a loader at the target route — it sends a GET request and expects the route's `loader` to handle it. Without a loader, React Router throws at runtime:

```
You made a GET fetch to '/comments/recipe/...' but no loader is defined for that route
```

The error is silent (no visible feedback to the user). The `loadMoreFetcher.data` is never populated (line 171), the `useEffect` at lines 171-181 never processes the response, and no additional comments are ever appended.

The initial page load works correctly: `RecipeDetailPage.loader` at `RecipeDetailPage.tsx:65` calls `commentApi.list(recipe.id, 1)` and passes the result as `initialComments` to `CommentSection` (line 390). The problem is exclusively in the client-side "Load More" path via `useFetcher().load()`.

### Current data flow — what works and what's broken

```
                          ┌────── WORKS ──────┐
                          │                    │
RecipeDetailPage.loader ──┤    calls           ├── commentApi.list(recipe.id, 1)
(server-side, page load)  │                    │         │
                          └────────────────────┘         │
                                                         ▼
                                               GET /api/v1/comments/recipe/:id?page=1
                                                         │
                                               ┌─────────▼─────────┐
                                               │  Backend returns   │
                                               │  PaginatedResponse │
                                               └─────────┬─────────┘
                                                         │
                                               ┌─────────▼─────────┐
                                               │ initialComments    │ → CommentSection (page 1 ok)
                                               └────────────────────┘


                          ┌────── BROKEN ─────┐
                          │                    │
CommentSection ──────────►│   calls            ├── loadMoreFetcher.load('/comments/recipe/:id?page=2')
("Load More" click)       │                    │         │
                          └────────────────────┘         │
                                                         ▼
                                               React Router lookup
                                               route: comments/recipe/:recipeId
                                               has:  action ✅
                                               has:  loader ❌  ← THIS IS THE BUG
                                                         │
                                                         ▼
                                               💥 "no loader is defined for that route"
                                               loadMoreFetcher.data = undefined
                                               useEffect at line 171 never runs
```

### Why this was missed

During the React Router 7 migration (D10), the `comments/recipe/:recipeId` route was registered as a resource route for comment creation (POST). The "Load More" path uses `fetcher.load()` which calls a GET — a different HTTP method. The route was missing the `loader` handler for GET since its inception. The initial page load path (via `RecipeDetailPage.loader`) was working, which made the bug non-obvious.

## What Changes

This is a **2-file code change + test additions**. No `CommentSection.tsx` changes needed.

### File 1: `apps/web/src/routes/comments.ts` — new export

Add `listCommentsLoader` as a new exported async function. It:
- Extracts `params.recipeId` (path param) and `?page=` (query param) from the `LoaderFunctionArgs`.
- Validates `recipeId` — returns 400 if missing/empty.
- Defaults `page` to 1 when absent or non-numeric.
- Calls `commentApi.list(recipeId, page)` which returns `PaginatedResponse<CommentData>` (the full `{ data, meta }` wrapper).
- Emits `log.debug({ recipeId, page }, 'listCommentsLoader started')` on entry.
- Requires adding `LoaderFunctionArgs` to the existing `react-router` type import on line 1.

### File 2: `apps/web/src/router.tsx` — import + route registration

- Add `listCommentsLoader` to the import from `'./routes/comments.ts'` on line 39.
- Add `loader: listCommentsLoader` to the `comments/recipe/:recipeId` route object on line 231.

The resulting route object:
```ts
{ path: 'comments/recipe/:recipeId', loader: listCommentsLoader, action: createCommentAction }
```

React Router dispatches based on HTTP method: GET → `loader`, POST → `action`. Comment submission (`fetcher.submit` with method `'post'`) is unaffected.

### File 3: `apps/web/src/components/recipe/CommentSection.test.tsx` — test router + new tests

- Add a `loader` to the `comments/recipe/:recipeId` route in `renderCommentSection()`. The test loader extracts `page` from the URL and returns mock paginated data.
- Add 5 new test cases covering: button visibility, comment appending, heading accuracy, button disappearance, and disabled-while-loading.

### What stays the same (verified correct — zero changes needed)

| Component | Reason |
|-----------|--------|
| `CommentSection.tsx` lines 68–78 | State initialisation from `initialComments` — correct |
| `CommentSection.tsx` lines 130–136 | Reset state when `initialComments` changes — correct |
| `CommentSection.tsx` lines 153–155 | `loadMoreFetcher` declared as `useFetcher()` — correct |
| `CommentSection.tsx` lines 171–181 | `useEffect` processes `loadMoreFetcher.data` — correct |
| `CommentSection.tsx` lines 454–467 | "Load More" button gating and click handler — correct |
| `apps/web/src/api/index.ts` | `commentApi.list()` uses `api.getWithMeta` — correct |
| `apps/web/src/api/types.ts:174-184` | `PaginatedResponse<T>` interface — correct |
| `apps/api/src/modules/comment/index.ts:58-65` | Backend GET endpoint — correct |
| `apps/api/src/modules/comment/service.ts:102-104` | `listComments` delegates to model — correct |
| `apps/api/src/modules/comment/model.ts:44-118` | `findByRecipe` with offset/limit pagination — correct |

## Capabilities

### New Capabilities

- `comment-pagination`: Client-side pagination for recipe comments via React Router `useFetcher().load()`. Covers:
  - The `listCommentsLoader` route loader that serves paginated `CommentData[]` through the `PaginatedResponse` wrapper.
  - Route registration supporting both GET (loader) and POST (action) on the same `comments/recipe/:recipeId` path.
  - The "Load More" button lifecycle: visibility gating (`total > comments.length`), loading state (disabled while fetching), comment appending, and disappearance when all comments are loaded.
  - Test coverage for all "Load More" behaviors.

### Modified Capabilities

None — no existing spec covers comment pagination behavior.

## Impact

| Category | Detail |
|----------|--------|
| **Files changed** | `apps/web/src/routes/comments.ts` (new function, 1 import change) |
|               | `apps/web/src/router.tsx` (1 import addition, 1 route addition) |
|               | `apps/web/src/components/recipe/CommentSection.test.tsx` (test router update + 5 new test cases) |
| **Files NOT changed** | `CommentSection.tsx`, `api/index.ts`, `api/types.ts`, all backend files |
| **API changes** | None — backend endpoint already exists |
| **Database changes** | None |
| **Breaking changes** | None — adding `loader` alongside `action` is additive |
| **Migration needed** | None |
| **Dependencies** | None (standalone frontend fix, zero new packages) |
| **Risk** | Low — 2-line router change, one new function, fully additive |
