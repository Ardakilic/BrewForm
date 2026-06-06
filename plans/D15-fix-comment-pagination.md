# D15 — Comment Section Pagination Broken

> **Resolved by D10 (React Router 7 migration).**
> The comment pagination fix was implemented as part of the D10 React Router 7 migration.
> Comments are now loaded via the recipe detail page's route loader, which properly
> reads `meta.pagination.total` from the API response envelope. The "Load More"
> button uses `useFetcher().load()` to append additional pages, accumulating them
> in local state. Mutation results are also properly handled via `useFetcher`
> resource routes.

## Severity

**Medium**

## Issue Description

The "Load More" button in `CommentSection.tsx` almost never shows because pagination is broken. The root cause is on line 108:

```ts
// CommentSection.tsx:105-111
useEffect(() => {
  api.get<Comment[]>(`/comments/recipe/${recipeId}?page=${page}`)
    .then((data: Comment[]) => {
      setComments(Array.isArray(data) ? data : []);
      setTotal(Array.isArray(data) ? data.length : 0); // BUG: sets total to current page count
    })
    .catch(() => {});
}, [recipeId, page]);
```

The code treats the API response as a raw `Comment[]` array and sets `total` to `data.length` (the number of items on the current page). It should use the pagination metadata from the API response envelope.

The API returns a paginated response:

```ts
// apps/api/src/modules/comment/index.ts:62-68
const result = await service.listComments(recipeId, page, perPage);
return paginated(c, result.comments, {
  page,
  perPage,
  total: result.total,
  totalPages: Math.ceil(result.total / perPage),
});
```

The response envelope is `{ data: Comment[], meta: { pagination: { total, page, perPage, totalPages } } }`.

## Impact

- **Broken pagination**: "Load More" button only shows when the current page happens to have fewer items than the total (i.e., the last page). For recipes with many comments, users can never see beyond page 1.
- **Wrong comment count**: The heading shows `{total}` comments, but `total` is actually just the count of the first page (typically 10 or 20), not the actual total.

## Root Cause

The `api.get()` call doesn't account for the paginated response envelope. It expects `Comment[]` but receives `{ data: Comment[], meta: { pagination: { total } } }`. The `setTotal(data.length)` line sets the total to the number of items returned on the current page, not the server's total count.

## Affected Files

| File | Lines | Description |
|------|-------|-------------|
| `apps/web/src/components/recipe/CommentSection.tsx` | 104-111 | Broken pagination logic |

## Fix Approach

Change the `api.get()` call to use the paginated response shape and extract `meta.pagination.total`.

### Current Code

```ts
api.get<Comment[]>(`/comments/recipe/${recipeId}?page=${page}`)
  .then((data: Comment[]) => {
    setComments(Array.isArray(data) ? data : []);
    setTotal(Array.isArray(data) ? data.length : 0);
  })
  .catch(() => {});
```

### Fixed Code

```ts
interface PaginatedComments {
  data: Comment[];
  meta: {
    pagination: {
      total: number;
      page: number;
      perPage: number;
      totalPages: number;
    };
  };
}

api.get<PaginatedComments>(`/comments/recipe/${recipeId}?page=${page}`)
  .then((response) => {
    const comments = Array.isArray(response.data) ? response.data : [];
    setComments(comments);
    setTotal(response.meta?.pagination?.total ?? comments.length);
  })
  .catch(() => {});
```

### Additional Fix: Accumulate Comments Across Pages

Currently, changing `page` replaces the comments array. For a "Load More" pattern, new pages should be appended:

```ts
api.get<PaginatedComments>(`/comments/recipe/${recipeId}?page=${page}`)
  .then((response) => {
    const newComments = Array.isArray(response.data) ? response.data : [];
    setComments((prev) => page === 1 ? newComments : [...prev, ...newComments]);
    setTotal(response.meta?.pagination?.total ?? newComments.length);
  })
  .catch(() => {});
```

## Implementation Steps

1. Read `CommentSection.tsx` to understand current implementation (lines 104-111)
2. Check the API response shape from `apps/api/src/modules/comment/index.ts` (lines 59-68) — confirmed: `{ data, meta: { pagination: { total } } }`
3. Define a `PaginatedComments` interface matching the API envelope
4. Change `api.get<Comment[]>()` to `api.get<PaginatedComments>()`
5. Extract `response.data` for comments array
6. Extract `response.meta.pagination.total` for total count
7. Fix the "Load More" behavior to accumulate comments (append, not replace)
8. Test with recipes that have many comments (> 1 page)
9. Run `make check-web`

## Testing Strategy

- Navigate to a recipe with 0 comments — verify no "Load More" button, heading shows "0 comments"
- Navigate to a recipe with 1-5 comments — verify no "Load More" button (all fit on one page)
- Navigate to a recipe with 20+ comments — verify "Load More" button appears
- Click "Load More" — verify new comments append to the list, old comments remain
- Verify the comment count heading shows the actual total, not just page 1 count
- Verify "Load More" disappears when all comments are loaded

## Risk Assessment

- **Low**: Simple fix — just correcting the response parsing
- **Low**: API response shape is well-defined and already returns pagination metadata
- **Low**: No database or backend changes needed

## Dependencies

- None (standalone frontend fix)
