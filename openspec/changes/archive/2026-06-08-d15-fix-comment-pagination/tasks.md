> **Note on code examples:** Code snippets in this task list are illustrative references only. They reflect the intent and structure of each task but may not match the current codebase exactly. All code examples, file paths, and line numbers MUST be double-checked against the actual source files before implementation.

## 1. Add `listCommentsLoader` to `apps/web/src/routes/comments.ts`

- [x] 1.1 **Update the type import** on line 1. Change:
  ```ts
  import type { ActionFunctionArgs } from 'react-router';
  ```
  to:
  ```ts
  import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
  ```

- [x] 1.2 **Add `listCommentsLoader` function** after the `const logger = createLogger('comments');` line (line 4) and before `export const createCommentAction` (line 6). Insert this code:
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

- [x] 1.3 **Verify** by reading the file — the structure should be:
  ```ts
  import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
  import { commentApi } from '../api/index.ts';
  import { createLogger } from '@/utils/logger.ts';

  const logger = createLogger('comments');

  export const listCommentsLoader = async (...) => { ... };   // NEW

  export const createCommentAction = async (...) => { ... };   // UNCHANGED
  export const deleteCommentAction = async (...) => { ... };   // UNCHANGED
  ```

## 2. Wire `listCommentsLoader` into `apps/web/src/router.tsx`

- [x] 2.1 **Update the import** on the line that imports from `'./routes/comments.ts'` (currently around line 39):
  **Before:**
  ```ts
  import { createCommentAction, deleteCommentAction } from './routes/comments.ts';
  ```
  **After:**
  ```ts
  import { createCommentAction, deleteCommentAction, listCommentsLoader } from './routes/comments.ts';
  ```

- [x] 2.2 **Add `loader` to the route object** on the `comments/recipe/:recipeId` route (currently around line 231):
  **Before:**
  ```ts
  { path: 'comments/recipe/:recipeId', action: createCommentAction },
  ```
  **After:**
  ```ts
  { path: 'comments/recipe/:recipeId', loader: listCommentsLoader, action: createCommentAction },
  ```

- [x] 2.3 **Verify** the `comments/:id` route on the following line is unchanged:
  ```ts
  { path: 'comments/:id', action: deleteCommentAction },
  ```
  (It should NOT have a `loader`.)

- [x] 2.4 Run `make check-web` to confirm TypeScript and lint pass for the entire web workspace.

## 3. Add "Load More" test coverage to `apps/web/src/components/recipe/CommentSection.test.tsx`

### 3.1 Update `renderCommentSection()` test helper

- [x] 3.1.1 **Locate** the `comments/recipe/:recipeId` route definition inside `renderCommentSection()` (currently around lines 191–203). It currently looks like:
  ```ts
  {
    path: 'comments/recipe/:recipeId',
    action: async ({ request }: { request: Request }) => {
      const formData = await request.formData();
      const content = formData.get('content') as string;
      return {
        id: `new-${Date.now()}`,
        content,
        authorId: testCurrentUserId,
        createdAt: new Date().toISOString(),
      };
    },
    element: null,
  },
  ```
  **Add a `loader` property before the `action`** so the route becomes:
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
          meta: {
            pagination: { total: 25, page: 2, perPage: 10, totalPages: 3 },
          },
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
          meta: {
            pagination: { total: 25, page: 3, perPage: 10, totalPages: 3 },
          },
        };
      }
      return {
        data: [],
        meta: {
          pagination: { total: 25, page: 1, perPage: 10, totalPages: 3 },
        },
      };
    },
    action: async ({ request }: { request: Request }) => {
      const formData = await request.formData();
      const content = formData.get('content') as string;
      return {
        id: `new-${Date.now()}`,
        content,
        authorId: testCurrentUserId,
        createdAt: new Date().toISOString(),
      };
    },
    element: null,
  },
  ```

### 3.2 Add a test helper to create multi-page initial data

- [x] 3.2.1 **Add a helper function** near the top of the test file (after the existing `defaultComments` constant, around line 91) to generate initial comments for pagination tests:
  ```ts
  function makePaginationInitialData(options: {
    total: number;
    page: number;
    perPage: number;
    commentCount: number;
  }) {
    const comments = Array.from({ length: options.commentCount }, (_, i) => ({
      id: `comment-init-${i + 1}`,
      content: `Initial comment ${i + 1}`,
      authorId: 'user-1',
      createdAt: new Date(Date.now() - i * 60000).toISOString(),
      replies: [],
    }));
    return {
      data: comments,
      meta: {
        pagination: {
          total: options.total,
          page: options.page,
          perPage: options.perPage,
          totalPages: Math.ceil(options.total / options.perPage),
        },
      },
    };
  }
  ```

### 3.3 Add "Load More" test cases

Add these tests **after the existing `'CommentSection — comment form'` describe block** (after line 765), in a new `describe` block. Place it before the final closing of the file.

- [x] 3.3.1 **Create the test block** with:
  ```ts
  describe('CommentSection — Load More pagination', () => {
  ```

- [x] 3.3.2 **Test: "Load More" button appears when total exceeds visible comments**
  ```ts
  it('shows "Load More" button when total exceeds visible comments', async () => {
    mockUseAuth.mockReturnValue({
      ...guestAuth,
      user: regularUser,
      isAuthenticated: true,
    } as ReturnType<typeof useAuth>);

    const initialData = makePaginationInitialData({
      total: 25,
      page: 1,
      perPage: 10,
      commentCount: 10,
    });
    renderCommentSection({ initialComments: initialData });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument();
    });
  });
  ```

- [x] 3.3.3 **Test: "Load More" button does not appear when all comments are visible**
  ```ts
  it('does not show "Load More" button when all comments are visible', async () => {
    mockUseAuth.mockReturnValue({
      ...guestAuth,
      user: regularUser,
      isAuthenticated: true,
    } as ReturnType<typeof useAuth>);

    const initialData = makePaginationInitialData({
      total: 5,
      page: 1,
      perPage: 10,
      commentCount: 5,
    });
    renderCommentSection({ initialComments: initialData });

    await waitFor(() => {
      expect(screen.getByText(/comments/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
  });
  ```

- [x] 3.3.4 **Test: "Load More" button does not appear with zero comments**
  ```ts
  it('does not show "Load More" button when there are zero comments', async () => {
    mockUseAuth.mockReturnValue({
      ...guestAuth,
      user: regularUser,
      isAuthenticated: true,
    } as ReturnType<typeof useAuth>);

    const initialData = makePaginationInitialData({
      total: 0,
      page: 1,
      perPage: 10,
      commentCount: 0,
    });
    renderCommentSection({ initialComments: initialData });

    await waitFor(() => {
      expect(screen.getByText(/0 comments|Comments \(0\)/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
  });
  ```

- [x] 3.3.5 **Test: Clicking "Load More" appends second-page comments**
  ```ts
  it('appends second-page comments when "Load More" is clicked', async () => {
    mockUseAuth.mockReturnValue({
      ...guestAuth,
      user: regularUser,
      isAuthenticated: true,
    } as ReturnType<typeof useAuth>);

    const initialData = makePaginationInitialData({
      total: 25,
      page: 1,
      perPage: 10,
      commentCount: 10,
    });
    renderCommentSection({ initialComments: initialData });

    // Wait for initial render
    await waitFor(() => {
      expect(screen.getByText('Initial comment 1')).toBeInTheDocument();
    });

    // Verify first page comments are present
    expect(screen.getByText('Initial comment 1')).toBeInTheDocument();
    expect(screen.getByText('Initial comment 10')).toBeInTheDocument();

    // Click "Load More"
    const loadMoreBtn = screen.getByRole('button', { name: /load more/i });
    await userEvent.click(loadMoreBtn);

    // Wait for page 2 comments to appear
    await waitFor(() => {
      expect(screen.getByText('Second page comment 1')).toBeInTheDocument();
    });

    // First page comments still present
    expect(screen.getByText('Initial comment 1')).toBeInTheDocument();
    expect(screen.getByText('Initial comment 10')).toBeInTheDocument();

    // Page 2 comments are present
    expect(screen.getByText('Second page comment 1')).toBeInTheDocument();
    expect(screen.getByText('Second page comment 2')).toBeInTheDocument();
  });
  ```

- [x] 3.3.6 **Test: Count heading shows correct total after loading more**
  ```ts
  it('shows correct total in count heading after loading more', async () => {
    mockUseAuth.mockReturnValue({
      ...guestAuth,
      user: regularUser,
      isAuthenticated: true,
    } as ReturnType<typeof useAuth>);

    const initialData = makePaginationInitialData({
      total: 25,
      page: 1,
      perPage: 10,
      commentCount: 10,
    });
    renderCommentSection({ initialComments: initialData });

    // Initially shows 25 total (the heading should show "25" somewhere)
    await waitFor(() => {
      expect(screen.getByText(/25/)).toBeInTheDocument();
    });

    // Click "Load More"
    const loadMoreBtn = screen.getByRole('button', { name: /load more/i });
    await userEvent.click(loadMoreBtn);

    // After loading more, total should still be 25
    await waitFor(() => {
      expect(screen.getByText('Second page comment 1')).toBeInTheDocument();
    });
    // The heading still shows 25
    expect(screen.getByText(/25/)).toBeInTheDocument();
  });
  ```

- [x] 3.3.7 **Test: "Load More" disappears after loading all pages**
  ```ts
  it('hides "Load More" button after loading all pages', async () => {
    mockUseAuth.mockReturnValue({
      ...guestAuth,
      user: regularUser,
      isAuthenticated: true,
    } as ReturnType<typeof useAuth>);

    const initialData = makePaginationInitialData({
      total: 25,
      page: 1,
      perPage: 10,
      commentCount: 10,
    });
    renderCommentSection({ initialComments: initialData });

    await waitFor(() => {
      expect(screen.getByText('Initial comment 1')).toBeInTheDocument();
    });

    // Load page 2 (10 more comments, now 20 visible)
    const loadMoreBtn = screen.getByRole('button', { name: /load more/i });
    await userEvent.click(loadMoreBtn);

    await waitFor(() => {
      expect(screen.getByText('Second page comment 1')).toBeInTheDocument();
    });

    // "Load More" still visible (20 < 25)
    expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument();

    // Load page 3 (5 more comments, now 25 visible = total)
    await userEvent.click(screen.getByRole('button', { name: /load more/i }));

    await waitFor(() => {
      expect(screen.getByText('Third page comment 1')).toBeInTheDocument();
    });

    // "Load More" should be gone now (25 === 25)
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
    });
  });
  ```

- [x] 3.3.8 **Test: Submitting a comment still works with loader present**
  ```ts
  it('allows comment submission after loader is added to the route', async () => {
    mockUseAuth.mockReturnValue({
      ...guestAuth,
      user: regularUser,
      isAuthenticated: true,
    } as ReturnType<typeof useAuth>);

    const initialData = makePaginationInitialData({
      total: 25,
      page: 1,
      perPage: 10,
      commentCount: 10,
    });
    renderCommentSection({ initialComments: initialData });

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/write a comment/i)).toBeInTheDocument();
    });

    // Submit a new comment
    await userEvent.type(screen.getByPlaceholderText(/write a comment/i), 'New comment during pagination');
    await userEvent.click(screen.getByRole('button', { name: /post comment/i }));

    // Comment should appear
    await waitFor(() => {
      expect(screen.getByText('New comment during pagination')).toBeInTheDocument();
    });

    // "Load More" should still be visible (we have 10 initial + 1 new = 11, total = 25)
    expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument();
  });
  ```

- [x] 3.3.9 **Close the describe block:**
  ```ts
  });
  ```

## 4. Verification

- [x] 4.1 Run `make check-web` — must pass with zero TypeScript errors and zero lint warnings.
- [x] 4.2 Run `make test-specific filter=apps/web/src/components/recipe/CommentSection.test.tsx` — all existing tests AND new "Load More" tests must pass.
- [x] 4.3 Run `make test-web` (or `make test`) to confirm the full test suite is not broken.

### Manual smoke test checklist

- [x] 4.4 Navigate to a recipe with **0 comments** — verify no "Load More" button, count heading shows "0 comments".
- [x] 4.5 Navigate to a recipe with **1–9 comments** — verify no "Load More" button (all on one page, `total <= perPage`).
- [x] 4.6 Navigate to a recipe with **10+ comments** — verify "Load More" button appears.
- [x] 4.7 Click "Load More" — verify:
  - New comments are appended (not replacing existing ones).
  - Count heading remains accurate.
  - Button is disabled during loading (shows loading state text if any).
- [x] 4.8 Click "Load More" until exhausted — verify the button disappears when all comments are loaded.
- [x] 4.9 Submit a new top-level comment while pagination is active — verify it appears immediately and the count updates.
- [x] 4.10 Reply to a comment — verify reply submission still works.
- [x] 4.11 Delete a comment — verify deletion still works.
