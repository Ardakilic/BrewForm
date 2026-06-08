# comment-pagination Specification

> **Note on code examples:** Code snippets in this specification are **illustrative references** only. They reflect the intent and structure of the implementation but may not match the current codebase exactly. All code examples, file paths, and line numbers MUST be double-checked against the actual source files before implementation. When in doubt, the written requirement text takes precedence over any code snippet.

## Purpose

Client-side pagination for recipe comments via React Router `useFetcher().load()`. This specification defines the behavior of:

1. The `listCommentsLoader` route loader in `apps/web/src/routes/comments.ts` that handles GET requests for paginated comments.
2. The route registration in `apps/web/src/router.tsx` that supports both GET (loader) and POST (action) on the `comments/recipe/:recipeId` path.
3. The "Load More" button lifecycle in `apps/web/src/components/recipe/CommentSection.tsx` (already implemented, verified correct — no changes needed).
4. Test coverage in `apps/web/src/components/recipe/CommentSection.test.tsx` for "Load More" pagination behavior.

## Data Types

The following types are referenced throughout this spec. They already exist in the codebase and are not changed by this work.

### PaginatedResponse<T> (`apps/web/src/api/types.ts:174`)

```ts
interface PaginatedResponse<T> {
  data: T[];
  meta: {
    pagination: {
      page: number;
      perPage: number;
      total: number;
      totalPages: number;
    };
  };
}
```

### CommentData (`apps/web/src/api/types.ts:162`)

```ts
interface CommentData {
  id: string;
  content: string;
  authorId: string;
  author?: CommentAuthor;
  createdAt: string;
  isOp?: boolean;
  replies?: CommentData[];
}
```

### Loader return type

The `listCommentsLoader` returns `Promise<PaginatedResponse<CommentData>>` — the same type returned by `commentApi.list()`.

### Fetcher processing contract

The `useEffect` at `CommentSection.tsx:171` expects `loadMoreFetcher.data` to be `PaginatedResponse<CommentData>`. It destructures `result.data` and `result.meta.pagination`. Any deviation from this shape (e.g., returning just `CommentData[]`) would break the component and is prohibited by this spec.

## ADDED Requirements

### Requirement: Route loader for listing comments

The `comments/recipe/:recipeId` resource route in `apps/web/src/router.tsx` SHALL expose a `loader` function named `listCommentsLoader`, exported from `apps/web/src/routes/comments.ts`. The loader SHALL handle GET requests by extracting `recipeId` (path param) and `page` (query param) and returning a `PaginatedResponse<CommentData>`.

The loader implementation SHALL:

1. Accept `LoaderFunctionArgs` from `'react-router'` as its parameter type.
2. Extract `recipeId` from `params.recipeId`.
3. Return a 400 error response (`throw new Response('Missing recipe id', { status: 400 })`) when `recipeId` is not a non-empty string.
4. Extract `page` from `request.url` query string parameter `?page=N`.
5. Default `page` to `1` when the parameter is absent.
6. Default `page` to `1` when the parameter is present but non-numeric (`isNaN(page) === true`).
7. Default `page` to `1` when the parsed value is less than 1 (the loader does not need to specially handle `page < 1` because `commentApi.list()` passes it to the backend, which treats out-of-range pages as empty results — however, the upstream `CommentSection` only passes `page + 1` starting from 1, so `page` is always ≥ 2 in practice).
8. Call `commentApi.list(recipeId, page)` and return its result directly.
9. Emit `logger.debug({ recipeId, page }, 'listCommentsLoader started')` before making the API call, using the existing `const logger = createLogger('comments')` at the top of the file.

The `loader` SHALL be registered on the route object alongside the existing `action: createCommentAction`. React Router's method-based dispatch SHALL route GET requests to the `loader` and POST requests to the `action`.

#### Scenario: Loader returns first page when no page query param

- **WHEN** `fetcher.load('/comments/recipe/abc-123')` is called with no `?page=` query parameter
- **THEN** the loader extracts `recipeId = 'abc-123'` and `page = 1`
- **AND** calls `commentApi.list('abc-123', 1)`
- **AND** returns the full `{ data: CommentData[], meta: { pagination: ... } }` response

#### Scenario: Loader returns requested page

- **WHEN** `fetcher.load('/comments/recipe/abc-123?page=3')` is called
- **THEN** the loader extracts `recipeId = 'abc-123'` and `page = 3`
- **AND** calls `commentApi.list('abc-123', 3)`
- **AND** returns the paginated response for page 3

#### Scenario: Loader returns 400 for empty recipeId

- **WHEN** `fetcher.load('/comments/recipe/?page=1')` is called with an empty `recipeId` path segment
- **THEN** the loader throws `new Response('Missing recipe id', { status: 400 })`
- **AND** the fetcher receives a 400 error (React Router error boundary may catch it, which is acceptable)

#### Scenario: Loader returns 400 for missing recipeId path param entirely

- **WHEN** a request reaches the loader with `params.recipeId` being `undefined`
- **THEN** the check `typeof recipeId !== 'string'` catches it and throws a 400 response

#### Scenario: Loader handles non-numeric page gracefully

- **WHEN** `fetcher.load('/comments/recipe/abc-123?page=foo')` is called
- **THEN** `parseInt('foo', 10)` returns `NaN`, `isNaN(page)` is `true`
- **AND** the loader defaults `page` to `1` and returns the first page

#### Scenario: Loader handles negative page gracefully

- **WHEN** `fetcher.load('/comments/recipe/abc-123?page=-5')` is called
- **THEN** the loader passes `page = -5` to `commentApi.list()`
- **AND** the backend's offset calculation `(page - 1) * perPage` becomes `(-6) * 10 = -60`, which Drizzle handles by returning empty results
- **NOTE**: This is acceptable because the upstream `CommentSection` always passes `page + 1` (where page starts at 1), so negative values never occur in practice

#### Scenario: Loader handles page=0 gracefully

- **WHEN** `fetcher.load('/comments/recipe/abc-123?page=0')` is called
- **THEN** the loader passes `page = 0` to `commentApi.list()`
- **AND** the backend offset becomes `(0 - 1) * 10 = -10`, returning empty results
- **NOTE**: Same reasoning as above — upstream callers never pass page=0

### Requirement: Loader import and route registration

The `apps/web/src/router.tsx` file SHALL be modified in exactly two places:

**Import addition (currently around line 39):**

The existing import:
```ts
import { createCommentAction, deleteCommentAction } from './routes/comments.ts';
```
SHALL be changed to:
```ts
import { createCommentAction, deleteCommentAction, listCommentsLoader } from './routes/comments.ts';
```

**Route definition (currently around line 231):**

The existing route:
```ts
{ path: 'comments/recipe/:recipeId', action: createCommentAction },
```
SHALL be changed to:
```ts
{ path: 'comments/recipe/:recipeId', loader: listCommentsLoader, action: createCommentAction },
```

The `comments/:id` route (action-only, for DELETE at approximately line 232) SHALL remain unchanged:
```ts
{ path: 'comments/:id', action: deleteCommentAction },
```
It does not need a loader — `deleteFetcher.submit(null, { method: 'delete', action: '/comments/:id' })` dispatches a DELETE which reaches the `action`. No fetcher sends a GET to this route.

#### Scenario: Router imports listCommentsLoader

- **WHEN** the router file is inspected after the change
- **THEN** the import line for `'./routes/comments.ts'` includes `listCommentsLoader` alongside the existing `createCommentAction` and `deleteCommentAction`

#### Scenario: Route object includes both loader and action

- **WHEN** the route definition for `comments/recipe/:recipeId` is inspected after the change
- **THEN** the object literal has properties `loader: listCommentsLoader` and `action: createCommentAction`

#### Scenario: Delete route unchanged

- **WHEN** the route definition for `comments/:id` is inspected
- **THEN** it has only `action: deleteCommentAction` (no `loader` property)

### Requirement: TypeScript and lint compliance

After all code changes, `make check-web` SHALL pass with zero TypeScript errors and zero lint warnings. The `listCommentsLoader` function SHALL use the correct type `LoaderFunctionArgs` imported from `'react-router'`.

#### Scenario: TypeScript compilation succeeds

- **WHEN** `make check-web` is run after all code changes
- **THEN** the command exits with code 0 and no TypeScript errors

#### Scenario: Lint passes

- **WHEN** `make check-web` is run after all code changes
- **THEN** the command exits with code 0 and no lint warnings

### Requirement: Comment submission (POST) not affected by adding loader

The existing `createCommentAction` SHALL continue to work correctly after the `loader` is added to the route. When `CommentSection` submits a form via `submitFetcher.submit(formData, { method: 'post', action: '/comments/recipe/${recipeId}' })`, React Router SHALL dispatch to `createCommentAction` (the `action` handler), not to `listCommentsLoader` (the `loader` handler).

The path `comments/recipe/:recipeId` is a resource route — the router dispatches based on HTTP method. Adding `loader` alongside `action` is standard React Router practice and does not affect method routing.

#### Scenario: POST reaches action, not loader

- **WHEN** `fetcher.submit(formData, { method: 'post', action: '/comments/recipe/abc-123' })` is called after the loader is registered
- **THEN** React Router dispatches to `createCommentAction`
- **AND** the `listCommentsLoader` is NOT called
- **AND** the created comment object is returned and processed by the `submitFetcher` `useEffect` at `CommentSection.tsx:130`

#### Scenario: DELETE on comments/:id still works

- **WHEN** `fetcher.submit(null, { method: 'delete', action: '/comments/cmt-456' })` is called after the loader is registered
- **THEN** React Router dispatches to `deleteCommentAction`
- **AND** the action returns `null` (success)

### Requirement: "Load More" button visibility

The "Load More" button in `CommentSection.tsx` SHALL be rendered when `total > comments.length` and SHALL NOT be rendered when `total <= comments.length`. This is already implemented at `CommentSection.tsx:454` as `{total > comments.length && (...)}` — this requirement verifies that the existing behavior is correct and SHALL NOT be changed.

#### Scenario: Button visible when more pages exist

- **WHEN** `CommentSection` renders with `initialComments.meta.pagination.total = 25` and `initialComments.data` contains 10 comments (page 1, `perPage = 10`)
- **THEN** the "Load More" button is visible (`total = 25 > comments.length = 10`)

#### Scenario: Button hidden when all comments are initially visible

- **WHEN** `CommentSection` renders with `initialComments.meta.pagination.total = 5` and `initialComments.data` contains 5 comments
- **THEN** the "Load More" button is NOT visible (`total = 5 === comments.length = 5`)

#### Scenario: Button hidden when zero comments

- **WHEN** `CommentSection` renders with `initialComments.meta.pagination.total = 0` and `initialComments.data` is an empty array
- **THEN** the "Load More" button is NOT visible (`total = 0 === comments.length = 0`)

### Requirement: "Load More" button click behavior

When the "Load More" button is clicked, the component SHALL call `loadMoreFetcher.load('/comments/recipe/${recipeId}?page=${page + 1}')` (already implemented at `CommentSection.tsx:460`). For this to work correctly, the `comments/recipe/:recipeId` route MUST have a `loader` (provided by the `listCommentsLoader` requirement above).

Upon successful fetcher completion (`state` returns to `'idle'` with valid `data`), the processing `useEffect` at `CommentSection.tsx:171-181` SHALL:

1. Cast `loadMoreFetcher.data` to `PaginatedResponse<CommentData>`.
2. Check that `result.data` is an array via `Array.isArray(result.data)`.
3. Append all items from `result.data` to the existing `comments` state (`setComments((prev) => [...prev, ...result.data])`).
4. Update `page` state to `result.meta.pagination.page`.
5. Update `total` state to `result.meta.pagination.total`.

The button SHALL be disabled while `loadMoreFetcher.state !== 'idle'` to prevent double-clicks (already implemented at `CommentSection.tsx:466`).

The click handler SHALL guard against concurrent requests with `if (loadMoreFetcher.state !== 'idle') return` (already implemented at `CommentSection.tsx:459`).

#### Scenario: Clicking "Load More" appends second-page comments

- **WHEN** the user clicks "Load More" on a recipe with 25 total comments, `page = 1`, and 10 visible comments
- **THEN** `loadMoreFetcher.load('/comments/recipe/${recipeId}?page=2')` is called
- **AND** when the fetcher completes, `setComments` is called with `[...existing10Comments, ...new10Comments]`
- **AND** the total visible comments become 20
- **AND** the first 10 comments remain visible and are not replaced

#### Scenario: Clicking "Load More" updates the count heading

- **WHEN** the user clicks "Load More" on a recipe with 25 total comments
- **THEN** the count heading (`t('comment.count').replace('{count}', String(total))`) continues to show `25` throughout the operation
- **AND** the heading does not flicker or change to an incorrect value

#### Scenario: "Load More" disappears after the last page

- **WHEN** the user has loaded all available pages such that `total === comments.length`
- **THEN** the condition `total > comments.length` evaluates to `false`
- **AND** the "Load More" button is removed from the DOM

#### Scenario: Button is disabled while loading

- **WHEN** the user clicks "Load More" and the fetch is in flight (`loadMoreFetcher.state === 'loading'`)
- **THEN** the button has the `disabled` attribute set to `true`
- **AND** clicking the button during this state has no effect (both the `onClick` guard and the `disabled` attribute prevent action)

#### Scenario: Existing comments preserved after loading more

- **WHEN** the user has 10 visible comments and clicks "Load More"
- **THEN** after the new comments are appended, the original 10 comments remain in the DOM with their original content, author names, and timestamps
- **AND** the comment list contains 20 items in total

#### Scenario: Rapid double-click is prevented

- **WHEN** the user clicks "Load More" twice in rapid succession before the first fetch completes
- **THEN** only one `loadMoreFetcher.load()` call is made
- **AND** the second click is a no-op because `loadMoreFetcher.state !== 'idle'`

### Requirement: Pagination test coverage in CommentSection.test.tsx

The test suite in `apps/web/src/components/recipe/CommentSection.test.tsx` SHALL include new test cases for "Load More" pagination behavior. The test helper `renderCommentSection()` SHALL be updated to include a `loader` on the `comments/recipe/:recipeId` test route.

#### Test router update

The `renderCommentSection()` function (currently around line 172) creates a `createMemoryRouter` with route children. The `comments/recipe/:recipeId` route SHALL be updated from:
```ts
{
  path: 'comments/recipe/:recipeId',
  action: async ({ request }: { request: Request }) => {
    // existing mock action...
  },
  element: null,
}
```
to include a `loader` property:
```ts
{
  path: 'comments/recipe/:recipeId',
  loader: async ({ request }: { request: Request }) => {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') ?? '1', 10);
    // return mock paginated data based on page number
  },
  action: async ({ request }: { request: Request }) => {
    // existing mock action — unchanged
  },
  element: null,
}
```

The mock loader SHALL return different data depending on the `page` query parameter so tests can verify that clicking "Load More" requests the correct page and appends distinct data. The mock SHALL return at minimum:
- For page 2: `{ data: [2 mock comments], meta: { pagination: { total: 25, page: 2, perPage: 10, totalPages: 3 } } }`
- For page 3: `{ data: [1 mock comment], meta: { pagination: { total: 25, page: 3, perPage: 10, totalPages: 3 } } }`
- Default (page 1 or any other): `{ data: [], meta: { pagination: { total: 25, page: 1, perPage: 10, totalPages: 3 } } }`

The existing `action` handler SHALL remain unchanged.

#### New test case: "Load More" button appears when total exceeds visible comments

- **WHEN** the test renders `CommentSection` with `initialComments` having `meta: { pagination: { total: 25, page: 1, perPage: 10, totalPages: 3 } }` and `data` containing 10 mock comments
- **THEN** `screen.getByRole('button', { name: /load more/i })` succeeds (returns an element)

#### New test case: "Load More" button does not appear when all comments are visible

- **WHEN** the test renders `CommentSection` with `initialComments` having `meta: { pagination: { total: 5, page: 1, perPage: 10, totalPages: 1 } }` and `data` containing 5 mock comments
- **THEN** `screen.queryByRole('button', { name: /load more/i })` returns `null`

#### New test case: Clicking "Load More" appends comments

- **WHEN** the test renders `CommentSection` with 10 initial comments and `total: 25, perPage: 10`
- **AND** the user clicks the "Load More" button
- **WHEN** the fetcher completes (the mock loader returns page 2 data)
- **THEN** both the original 10 comments and the page 2 comments appear in the document
- **AND** the total visible comments are 20

#### New test case: "Load More" updates count heading correctly

- **WHEN** the test renders `CommentSection` with `total: 25` and 10 initial comments
- **AND** the user clicks "Load More"
- **WHEN** the fetcher completes
- **THEN** the count heading still shows "25" (the total from the most recent pagination metadata)

#### New test case: "Load More" disappears when all pages loaded

- **WHEN** the test renders `CommentSection` with `total: 25, perPage: 10, page: 1` and 10 initial comments
- **AND** the user clicks "Load More" (loads page 2, now 20 visible)
- **WHEN** the fetcher completes
- **AND** the user clicks "Load More" again (loads page 3, now 25 visible, `total === comments.length`)
- **WHEN** the second fetcher completes
- **THEN** `screen.queryByRole('button', { name: /load more/i })` returns `null`

#### New test case: Comment submission still works after loader is added

- **WHEN** the test renders `CommentSection` with the route having both `loader` and `action`
- **AND** the user submits a new top-level comment via the form
- **THEN** the comment is created (mock action returns the created comment)
- **AND** the new comment appears in the comment list
- **AND** the total count increments by 1

### Requirement: Initial page load not affected

The existing pattern where `RecipeDetailPage.loader` at `RecipeDetailPage.tsx:65` calls `commentApi.list(recipe.id, 1)` and passes the result as `initialComments` to `CommentSection` SHALL continue to work unchanged. The `CommentSection` SHALL initialize its `comments`, `page`, and `total` state from `initialComments` via the `useEffect` at `CommentSection.tsx:130-136`.

#### Scenario: Page 1 loads via RecipeDetailPage.loader

- **WHEN** a user navigates to a recipe detail page (`/recipes/:slug`)
- **THEN** `RecipeDetailPage.loader` calls `commentApi.list(recipe.id, 1)`
- **AND** returns the paginated response as part of `DetailLoaderData`
- **AND** `CommentSection` renders with `comments` initialized to `initialComments.data` (page 1 comments)
- **AND** `total` initialized to `initialComments.meta.pagination.total`
- **AND** `page` initialized to `1`

#### Scenario: Navigating between recipes resets comment state

- **WHEN** the user navigates from `/recipes/recipe-a` to `/recipes/recipe-b`
- **THEN** `CommentSection` receives new `initialComments` via props
- **AND** the `useEffect` at line 130 resets `comments`, `page`, and `total` to the new recipe's values
- **AND** any previously loaded pages from recipe A are discarded

### Requirement: Logging

The `listCommentsLoader` SHALL emit a structured `log.debug` event on function entry. The log SHALL use the existing logger instance `const logger = createLogger('comments')` at the top of `apps/web/src/routes/comments.ts`.

The log message SHALL follow the pattern: `logger.debug({ recipeId, page }, 'listCommentsLoader started')`.

Following AGENTS.md logging rules:
- Include traceable IDs (`recipeId`) in the log context.
- Exclude payload data (comment content, author info).
- Exclude PII (emails, IPs).
- Use `debug` level for function entry/exit.

#### Scenario: Loader logs on entry with recipeId and page

- **WHEN** `listCommentsLoader` is called with `recipeId = 'abc-123'` and `page = 2`
- **THEN** a `log.debug({ recipeId: 'abc-123', page: 2 }, 'listCommentsLoader started')` event is emitted

#### Scenario: Existing action loggers unchanged

- **WHEN** `createCommentAction` is called after the change
- **THEN** it continues to emit `logger.debug({ recipeId, ... }, 'createCommentAction started')` and `'createCommentAction completed'` as before

### Requirement: Non-regression — existing CommentSection tests pass

All 50+ existing test cases in `CommentSection.test.tsx` SHALL continue to pass after the test router is updated to include the `loader`. The existing tests cover comment display, comment form, i18n, markdown rendering, reply button visibility, reply form, and submission. Adding a `loader` to the test router is an additive change — it provides a handler for GET requests that previously had none, which previously would have caused the test router to throw if a GET was made to that route.

#### Scenario: All existing CommentSection tests pass

- **WHEN** `make test-specific filter=apps/web/src/components/recipe/CommentSection.test.tsx` is run after the change
- **THEN** all existing tests pass (zero failures, zero errors)
- **AND** the new "Load More" tests also pass

#### Scenario: Comment form test still submits correctly

- **WHEN** the existing "submits a top-level comment and shows it in the list" test runs
- **THEN** it passes — the `action` handler on the test route is reached, not the new `loader`
