> **Note on code examples:** Code snippets in this document are illustrative references reflecting the intent and structure of each change. They may not match the current codebase exactly. All snippets, file paths, and line numbers MUST be double-checked against the actual source files before implementation. The written decision text takes precedence over any code snippet.

## Context

`CommentSection.tsx` uses two distinct paths to load comments for a recipe recipe:

**Path A — Initial page load (works):**
```
RecipeDetailPage.loader (server-side)
  → commentApi.list(recipe.id, 1)
    → fetch GET /api/v1/comments/recipe/:id?page=1
      → backend: listComments → findByRecipe (offset=0, limit=10)
        → returns PaginatedResponse<CommentData>
  → passes as initialComments prop to CommentSection
```

**Path B — "Load More" after first page (broken, this fix):**
```
CommentSection (client-side, "Load More" button click)
  → loadMoreFetcher.load('/comments/recipe/${recipeId}?page=${page + 1}')
    → React Router dispatches to route: comments/recipe/:recipeId
      → needs: LOADER (absent!)  ← THE BUG
      → has: ACTION (createCommentAction) only
    → 💥 throws "no loader is defined for that route"
```

### Existing code baseline

**`apps/web/src/routes/comments.ts`** (complete file, 45 lines):
```ts
import type { ActionFunctionArgs } from 'react-router';
import { commentApi } from '../api/index.ts';
import { createLogger } from '@/utils/logger.ts';

const logger = createLogger('comments');

export const createCommentAction = async ({ params, request }: ActionFunctionArgs) => {
  const form = await request.formData();
  const rawContent = form.get('content');
  if (typeof rawContent !== 'string' || rawContent.trim() === '') {
    throw new Response('Comment content is required', { status: 400 });
  }
  const content = rawContent.trim();
  const recipeId = params.recipeId;
  if (typeof recipeId !== 'string' || recipeId.length === 0) {
    throw new Response('Missing recipe id', { status: 400 });
  }
  const rawParent = form.get('parentCommentId');
  const parentCommentId = typeof rawParent === 'string' && rawParent.length > 0
    ? rawParent
    : undefined;

  logger.debug(
    { recipeId, hasParentCommentId: Boolean(parentCommentId) },
    'createCommentAction started',
  );

  try {
    const created = await commentApi.create(recipeId, {
      content,
      ...(parentCommentId ? { parentCommentId } : {}),
    });
    logger.debug({ recipeId, commentId: created.id }, 'createCommentAction completed');
    return created;
  } catch (err: unknown) {
    logger.error({ err, recipeId }, 'createCommentAction failed');
    throw err;
  }
};

export const deleteCommentAction = async ({ params }: ActionFunctionArgs) => { ... };
```

**`apps/web/src/router.tsx`** relevant lines:
```ts
// Line 39:
import { createCommentAction, deleteCommentAction } from './routes/comments.ts';

// Line 231:
{ path: 'comments/recipe/:recipeId', action: createCommentAction },
```

**`CommentSection.tsx`** relevant sections:
```ts
// Line 155 — fetcher declaration
const loadMoreFetcher = useFetcher();

// Lines 171–181 — fetcher data processing (already correct)
useEffect(() => {
  if (loadMoreFetcher.state !== 'idle' || !loadMoreFetcher.data) return;
  const result = loadMoreFetcher.data as {
    data: CommentData[];
    meta: { pagination: { total: number; page: number; perPage: number; totalPages: number } };
  };
  if (!Array.isArray(result.data)) return;
  setComments((prev) => [...prev, ...result.data]);
  setPage(result.meta.pagination.page);
  setTotal(result.meta.pagination.total);
}, [loadMoreFetcher.state, loadMoreFetcher.data]);

// Lines 454–467 — "Load More" button (already correct)
{total > comments.length && (
  <div className='mt-4 text-center'>
    <button
      type='button'
      onClick={() => {
        if (loadMoreFetcher.state !== 'idle') return;
        loadMoreFetcher.load(`/comments/recipe/${recipeId}?page=${page + 1}`);
      }}
      className='btn-secondary'
      disabled={loadMoreFetcher.state !== 'idle'}
    >
      {t('comment.loadMore')}
    </button>
  </div>
)}
```

### Fixed data flow

After this change, Path B becomes:

```
CommentSection (client-side, "Load More" button click)
  → loadMoreFetcher.load('/comments/recipe/${recipeId}?page=${page + 1}')
    → React Router dispatches to route: comments/recipe/:recipeId
      → runs: listCommentsLoader (NEW)
        → extracts params.recipeId, url.searchParams.get('page')
        → calls: commentApi.list(recipeId, page)
          → fetch GET /api/v1/comments/recipe/:id?page=N
            → backend returns PaginatedResponse<CommentData>
        → returns PaginatedResponse<CommentData>
      → loadMoreFetcher.data = PaginatedResponse
    → useEffect at line 171 runs
      → appends result.data to existing comments
      → updates page and total state
```

## Goals / Non-Goals

**Goals:**
- Provide a `loader` on the `comments/recipe/:recipeId` React Router route so `useFetcher().load()` resolves correctly.
- The loader must extract `recipeId` (path param) and `page` (query param) and return the full `PaginatedResponse<CommentData>` wrapper.
- Add `LoaderFunctionArgs` to the type import in `routes/comments.ts`.
- Update the import and route definition in `router.tsx`.
- Add "Load More" test coverage to `CommentSection.test.tsx`.

**Non-Goals:**
- No changes to `CommentSection.tsx`.
- No backend changes — `GET /api/v1/comments/recipe/:recipeId?page=N` already works.
- No `perPage` parameter in the loader — the backend default is used.
- No error toast or user-visible feedback when "Load More" fails.
- No changes to the `comments/:id` delete route (it only uses `action: deleteCommentAction` for DELETE requests).
- No changes to how the initial comments page is loaded.

## Decisions

### Decision 1: Loader function signature and location

**Choice**: New exported function `listCommentsLoader` in `apps/web/src/routes/comments.ts`, placed before the existing action exports.

**Rationale**: The file already holds all `comments/*` resource route handlers. Adding the loader here keeps related concerns co-located. The naming follows the existing pattern (`createCommentAction`, `deleteCommentAction` → `listCommentsLoader` — "loader" suffix for loaders, "action" suffix for actions).

**Before (line 1):**
```ts
import type { ActionFunctionArgs } from 'react-router';
```

**After (line 1):**
```ts
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
```

**New function (inserted after the `logger` declaration, before `createCommentAction`):**
```ts
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
```

**Alternative considered**: Creating a separate loader file (e.g., `routes/commentListLoader.ts`). Rejected — adds file fragmentation for a single 10-line function. The file already co-locates comment route handlers.

### Decision 2: Loader returns full `PaginatedResponse` wrapper (not just `CommentData[]`)

**Choice**: The loader returns whatever `commentApi.list()` returns — the full `{ data, meta: { pagination: ... } }` wrapper.

**Rationale**: The consuming `useEffect` at `CommentSection.tsx:171-181` already destructures `result.data` and `result.meta.pagination`. Changing the return shape would require changing `CommentSection.tsx`, which contradicts the goal of zero component changes.

The `commentApi.list()` implementation uses `api.getWithMeta`:
```ts
// apps/web/src/api/index.ts
export const commentApi = {
  list: (recipeId: string, page: number) =>
    api.getWithMeta<{
      data: CommentData[];
      meta: { pagination: { total: number; page: number; perPage: number; totalPages: number } };
    }>(`/comments/recipe/${recipeId}?page=${page}`),
  ...
};
```

`api.getWithMeta` returns the raw JSON response (including the `{ data, meta }` envelope), while `api.get` would unwrap `.data`. Using `getWithMeta` is correct.

**Alternative considered**: Using `api.get` and wrapping in `{ data, meta }` manually. Rejected — the backend already provides proper metadata via the `paginated()` utility. Duplicating pagination logic client-side is fragile and unnecessary.

### Decision 3: Route registration — loader alongside action on same path

**Choice**: Add `loader: listCommentsLoader` to the existing route object without creating a new route path.

**Before (router.tsx line 39):**
```ts
import { createCommentAction, deleteCommentAction } from './routes/comments.ts';
```

**After (router.tsx line 39):**
```ts
import { createCommentAction, deleteCommentAction, listCommentsLoader } from './routes/comments.ts';
```

**Before (router.tsx line 231):**
```ts
{ path: 'comments/recipe/:recipeId', action: createCommentAction },
```

**After (router.tsx line 231):**
```ts
{ path: 'comments/recipe/:recipeId', loader: listCommentsLoader, action: createCommentAction },
```

**Rationale**: React Router resource routes support both `loader` and `action` on the same path. The router dispatches by HTTP method: GET → `loader`, non-GET (POST/PUT/PATCH/DELETE) → `action`. `useFetcher().load()` sends a GET, so it reaches the loader. `useFetcher().submit()` (used for comment creation at line 200) sends a POST, reaching the action. This is standard React Router design — see the [React Router docs on resource routes](https://reactrouter.com/how-to/resource-routes).

**Alternative considered**: Creating a separate route like `comments/recipe/:recipeId/pages`. Rejected — adds URL proliferation, deviates from the path convention used by `commentApi.list()`, and makes the URL structure inconsistent with the backend API path.

**Alternative considered**: Moving the loader to a different path and updating `loadMoreFetcher.load()` to target it. Rejected — requires changing `CommentSection.tsx`, which is correct as-is.

### Decision 4: No `perPage` parameter in the loader

**Choice**: The loader does not parse or pass a `perPage` query parameter. Only `page` is supported.

**Rationale**:
- `commentApi.list(recipeId, page)` only accepts two arguments — no `perPage`.
- The backend's `PaginationSchema` defaults `perPage` to a system-wide value (visible at `apps/api/src/modules/comment/index.ts:58` where `zValidator('query', PaginationSchema)` validates the query).
- The component doesn't offer per-page-size controls, so there's no use case for passing `perPage`.
- Adding `perPage` would be a new feature, not a bug fix.

**Alternative considered**: Adding `perPage` to both the loader and `commentApi.list()`. Rejected — scope creep for a bug fix that restores broken functionality.

### Decision 5: Test loader mock design

**Choice**: The test loader in `renderCommentSection()` returns a hardcoded mock `PaginatedResponse` with distinct comment data per page.

**Mock loader design:**
```ts
{
  path: 'comments/recipe/:recipeId',
  loader: async ({ request }: { request: Request }) => {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') ?? '1', 10);
    if (page === 2) {
      return {
        data: [
          {
            id: 'comment-page2-1',
            content: 'Second page comment 1',
            authorId: 'user-1',
            createdAt: '2024-02-01T10:00:00Z',
            replies: [],
          },
          {
            id: 'comment-page2-2',
            content: 'Second page comment 2',
            authorId: 'user-2',
            createdAt: '2024-02-01T09:00:00Z',
            replies: [],
          },
        ],
        meta: { pagination: { total: 25, page: 2, perPage: 10, totalPages: 3 } },
      };
    }
    if (page === 3) {
      return {
        data: [
          {
            id: 'comment-page3-1',
            content: 'Third page comment 1',
            authorId: 'user-3',
            createdAt: '2024-02-01T08:00:00Z',
            replies: [],
          },
        ],
        meta: { pagination: { total: 25, page: 3, perPage: 10, totalPages: 3 } },
      };
    }
    // fallback (page 1 or any other)
    return {
      data: [],
      meta: { pagination: { total: 25, page: 1, perPage: 10, totalPages: 3 } },
    };
  },
  action: /* existing action unchanged */,
}
```

**Rationale**: Page-specific mock data allows tests to verify that:
- Page 2 comments are distinct from page 1 (verifying appending, not replacing).
- The total count remains 25 throughout (verifying heading accuracy).
- Page 3 returns data with `total: 25, page: 3, totalPages: 3` so that after loading it, `comments.length === total` and the button disappears.

**Alternative considered**: Using a generic mock that ignores the page number. Rejected — would not allow testing that the correct page is requested or that distinct page data arrives.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Loader throws on invalid `recipeId` (400), which bubbles to React Router error boundary | Component only calls `loadMoreFetcher.load()` with a valid `recipeId` from `CommentSection` props, which comes from `RecipeDetailPage`. The `page` is always `page + 1` (≥ 2). Invalid input risk is minimal. |
| Backend returns an error for pages > valid range (e.g., page 999). The `useEffect` at line 171 silently ignores non-array responses (`if (!Array.isArray(result.data)) return`) | Acceptable — the button re-enables and the user can retry. Backend currently returns empty `data: []` for out-of-range pages, not errors. Adding error feedback is a separate UX improvement. |
| Double-click "Load More" sends two requests | Already guarded by `if (loadMoreFetcher.state !== 'idle') return` in the onClick handler and `disabled={loadMoreFetcher.state !== 'idle'}` on the button. No change needed. |
| Race condition: user navigates away while "Load More" is in flight | React Router automatically cancels in-flight fetcher requests when the component unmounts (the `useFetcher` is tied to the component lifecycle). The `useEffect` cleanup is implicit. |
| The `comments/:id` route (delete) might also need a loader | It does not — `deleteFetcher.submit(null, { method: 'delete', action: '/comments/:id' })` dispatches a DELETE which reaches the `action`. No GET fetcher targets this route. |

## Open Questions

None — all design decisions are resolved. The implementation is well-understood from the existing codebase.
