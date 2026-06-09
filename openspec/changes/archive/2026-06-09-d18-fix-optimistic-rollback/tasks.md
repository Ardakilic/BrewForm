## 1. Fix like.ts action

- [x] 1.1 Read `apps/web/src/routes/like.ts` — confirm current state: `throw new Response(...)` on line 10, `return null` on line 18, `throw err` on line 21, existing `createLogger('like')` and `logger.debug` calls present
- [x] 1.2 Replace line 10 (`throw new Response('Missing or invalid route parameter: id', { status: 400 })`) with `return { ok: false, error: 'Missing or invalid route parameter: id' }`
- [x] 1.3 In the try block (line 17-18), replace `return null` with `return { ok: true }`
- [x] 1.4 In the catch block (line 19-22), replace `throw err` with `return { ok: false, error: err instanceof Error ? err.message : 'Like failed' }`
- [x] 1.5 Verify: `make check-web` (type-check) — no errors

**Expected final like.ts (for reference):**

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

## 2. Fix favourite.ts action

- [x] 2.1 Read `apps/web/src/routes/favourite.ts` — confirm current state: `throw new Response(...)` on line 7, no `createLogger` import, no try/catch, bare `await recipeApi.favourite(id)` on line 9, `return null` on line 10
- [x] 2.2 Add `import { createLogger } from '@/utils/logger.ts'` after the `import type { ActionFunctionArgs }` line
- [x] 2.3 Add `const logger = createLogger('favourite')` before the exported function
- [x] 2.4 Replace line 7 (`throw new Response(...)`) with `return { ok: false, error: 'Missing route parameter: id' }`
- [x] 2.5 Add `logger.debug({ id }, 'favouriteAction started')` after the parameter validation
- [x] 2.6 Wrap lines 9-10 (`await recipeApi.favourite(id); return null;`) in a try/catch block
- [x] 2.7 In the try block: keep the API call, add `logger.debug({ id }, 'favouriteAction completed')` before `return { ok: true }` (replacing `return null`)
- [x] 2.8 In the catch block: add `logger.error({ err, id }, 'favouriteAction failed')` then `return { ok: false, error: err instanceof Error ? err.message : 'Favourite failed' }`
- [x] 2.9 Verify: `make check-web` — no errors

**Expected final favourite.ts (for reference):**

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

## 3. Fix follow.ts action

- [x] 3.1 Read `apps/web/src/routes/follow.ts` — confirm current state: `throw new Response(...)` on line 7, no `createLogger`, no try/catch, bare `await followApi.unfollow/follow()` on lines 9-13, `return null` on line 14
- [x] 3.2 Add `import { createLogger } from '@/utils/logger.ts'` after the `import type { ActionFunctionArgs }` line
- [x] 3.3 Add `const logger = createLogger('follow')` before the exported function
- [x] 3.4 Replace line 7 (`throw new Response(...)`) with `return { ok: false, error: 'Missing or invalid userId' }`
- [x] 3.5 Add `logger.debug({ userId, method: request.method }, 'followAction started')` after the parameter validation
- [x] 3.6 Wrap lines 9-14 (the `if (request.method === 'DELETE')` block + `return null`) in a try/catch block
- [x] 3.7 In the try block: keep the method branch, add `logger.debug({ userId }, 'followAction completed')` before `return { ok: true }` (replacing `return null`)
- [x] 3.8 In the catch block: add `logger.error({ err, userId }, 'followAction failed')` then `return { ok: false, error: err instanceof Error ? err.message : 'Follow action failed' }`
- [x] 3.9 Verify: `make check-web` — no errors

**Expected final follow.ts (for reference):**

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

## 4. Add error + success rollback tests to LikeButton

- [x] 4.1 Read `apps/web/src/components/recipe/LikeButton.test.tsx` — note existing patterns: `vi.mock('@/utils/logger.ts')`, `renderWithRouter` helper with hanging action (`() => new Promise(() => {})`), test structure with `describe`/`it`/`userEvent.setup()`/`waitFor`
- [x] 4.2 Add new `import { vi }` at top if not already imported (it is — `vi` is imported from vitest)
- [x] 4.3 **Error path test**: Add a new `describe('LikeButton — action failure rollback', ...)` block at the end of the file (before the last closing) containing one test:

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

    await waitFor(() => {
      expect(button).not.toBeDisabled();
      expect(button.textContent).toContain('3');
    });
  });
});
```

- [x] 4.4 **Success path test**: In the same `describe` block, add a second test:

```tsx
  it('completes normally when action returns ok', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <LikeButton recipeId='recipe-1' initialLiked={false} initialCount={3} />,
          children: [
            {
              path: 'recipes/:id/like',
              action: () => ({ ok: true }),
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

    await waitFor(() => {
      expect(button).not.toBeDisabled();
      expect(button.textContent).toContain('3');
    });
  });
```

- [x] 4.5 Run tests: `make test-specific filter=apps/web/src/components/recipe/LikeButton.test.tsx` — all tests pass

## 5. Add error + success rollback tests to FavouriteButton

- [x] 5.1 Read `apps/web/src/components/recipe/FavouriteButton.test.tsx` — note same patterns as LikeButton test
- [x] 5.2 **Error path test**: Add a new `describe('FavouriteButton — action failure rollback', ...)` block at the end of the file containing:

```tsx
describe('FavouriteButton — action failure rollback', () => {
  it('reverts to initial state when action returns an error', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <FavouriteButton recipeId='recipe-1' initialFavourited={false} initialCount={5} />,
          children: [
            {
              path: 'recipes/:id/favourite',
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

    await waitFor(() => {
      expect(button).not.toBeDisabled();
      expect(button.textContent).toContain('5');
    });
  });
});
```

- [x] 5.3 **Success path test**: In the same `describe` block, add a second test:

```tsx
  it('completes normally when action returns ok', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <FavouriteButton recipeId='recipe-1' initialFavourited={false} initialCount={5} />,
          children: [
            {
              path: 'recipes/:id/favourite',
              action: () => ({ ok: true }),
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

    await waitFor(() => {
      expect(button).not.toBeDisabled();
      expect(button.textContent).toContain('5');
    });
  });
```

- [x] 5.4 Run tests: `make test-specific filter=apps/web/src/components/recipe/FavouriteButton.test.tsx` — all tests pass

## 6. Add error + success + callback rollback tests to FollowButton

- [x] 6.1 Read `apps/web/src/components/user/FollowButton.test.tsx` — note existing patterns, the shared `renderWithRouter` with hanging action, and existing test structure
- [x] 6.2 **Error path test (visual)**: Add a new `describe('FollowButton — action failure rollback', ...)` block at the end of the file containing:

```tsx
describe('FollowButton — action failure rollback', () => {
  it('reverts to initial state when action returns an error', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <FollowButton userId='user-1' initialFollowing={false} />,
          children: [
            {
              path: 'follow/:userId',
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

    await waitFor(() => {
      expect(button).not.toBeDisabled();
      expect(button.textContent).toBe('Follow');
    });
  });
});
```

- [x] 6.3 **Success path test (visual)**: In the same `describe` block, add:

```tsx
  it('completes normally when action returns ok', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <FollowButton userId='user-1' initialFollowing={false} />,
          children: [
            {
              path: 'follow/:userId',
              action: () => ({ ok: true }),
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

    await waitFor(() => {
      expect(button).not.toBeDisabled();
      expect(button.textContent).toBe('Follow');
    });
  });
```

- [x] 6.4 **onToggle callback test (successful follow)**: Add `describe('FollowButton — callback contracts', ...)` block:

```tsx
describe('FollowButton — callback contracts', () => {
  it('calls onToggle with true on successful follow', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const onToggleRollback = vi.fn();
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: (
            <FollowButton
              userId='user-1'
              initialFollowing={false}
              onToggle={onToggle}
              onToggleRollback={onToggleRollback}
            />
          ),
          children: [
            {
              path: 'follow/:userId',
              action: () => ({ ok: true }),
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

    await waitFor(() => {
      expect(onToggle).toHaveBeenCalledWith(true);
      expect(onToggleRollback).not.toHaveBeenCalled();
    });
  });
});
```

- [x] 6.5 **onToggle callback test (successful unfollow)**: Add a second test in the callback contracts block:

```tsx
  it('calls onToggle with false on successful unfollow', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const onToggleRollback = vi.fn();
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: (
            <FollowButton
              userId='user-1'
              initialFollowing={true}
              onToggle={onToggle}
              onToggleRollback={onToggleRollback}
            />
          ),
          children: [
            {
              path: 'follow/:userId',
              action: () => ({ ok: true }),
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

    await waitFor(() => {
      expect(onToggle).toHaveBeenCalledWith(false);
      expect(onToggleRollback).not.toHaveBeenCalled();
      expect(button.textContent).toBe('Following');
    });
  });
```

- [x] 6.6 **onToggleRollback callback test (error)**: Add a third test in the callback contracts block:

```tsx
  it('calls onToggleRollback with initialFollowing on error, does not call onToggle', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const onToggleRollback = vi.fn();
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: (
            <FollowButton
              userId='user-1'
              initialFollowing={false}
              onToggle={onToggle}
              onToggleRollback={onToggleRollback}
            />
          ),
          children: [
            {
              path: 'follow/:userId',
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

    await waitFor(() => {
      expect(onToggleRollback).toHaveBeenCalledWith(false);
      expect(onToggle).not.toHaveBeenCalled();
    });
  });
```

- [x] 6.7 Run tests: `make test-specific filter=apps/web/src/components/user/FollowButton.test.tsx` — all tests pass (both existing and new)

## 7. Validation

- [x] 7.1 Run full type check: `make check-web` — passes
- [x] 7.2 Run full lint: `make lint` — passes
- [x] 7.3 Run all web tests: `make test` (or `make test-web` if a separate target exists) — 805 tests pass
- [ ] 7.4 Manual smoke test (DevTools): Open a recipe → click Like → set Network to Offline → click Like again → verify button reverts (not stuck, no page crash) → restore Network → click Like → verify normal flow works
- [ ] 7.5 Repeat manual test for Favourite button on recipe detail page
- [ ] 7.6 Repeat manual test for Follow button on user profile page

## 8. PR Description

- [x] 8.1 Create `pr_description.md` at the project root (`/Users/arda.kilicdagi/projects/personal/BrewForm/pr_description.md`) with the following content:

```markdown
# D18: Fix Optimistic UI Rollback — Prevent Page Crashes on Like/Favourite/Follow API Failures

## Problem

D10 (React Router 7 migration) introduced a regression: when a Like, Favourite, or Follow API call fails (network error, server 500, rate limit), the resource route actions **throw** the error instead of **returning** it. React Router 7 routes thrown errors from fetcher-accessed resource routes to the nearest `errorElement` in the route tree — the root Layout's `<RootErrorBoundary />`. This replaces the **entire page** with a full-screen "Oops" / "Go Home" error UI, rather than letting the optimistic UI roll back gracefully.

## Solution

Convert all three resource route actions to **return** a `{ ok: false, error: string }` object on failure instead of throwing. This preserves the automatic optimistic UI rollback mechanism (`fetcher.formData` clears → component falls back to loader data → loader revalidation restores correct state). The root error boundary is never triggered.

### What changed

| File | Changes |
|------|---------|
| `apps/web/src/routes/like.ts` | Replace `throw new Response(...)` with `return { ok: false, ... }`; replace `throw err` with `return { ok: false, error: ... }`; replace `return null` with `return { ok: true }` |
| `apps/web/src/routes/favourite.ts` | Add `createLogger` + structured logging; wrap API call in try/catch; apply same return pattern |
| `apps/web/src/routes/follow.ts` | Add `createLogger` + structured logging; wrap API calls in try/catch; apply same return pattern |

### What did NOT change

- **Components**: `LikeButton.tsx`, `FavouriteButton.tsx`, `FollowButton.tsx` — no changes needed; the `optimistic ?? initial` pattern was already correct
- **Router**: `router.tsx` — no route changes, no `errorElement` additions
- **No new dependencies**, no schema changes, no API changes

### Testing

- **3 new error-path tests** (one per button component): verify buttons revert to initial state when action returns `{ ok: false }` (button not disabled, count/state not stuck in optimistic mode)
- **3 new success-path tests** (one per button component): verify buttons complete normally when action returns `{ ok: true }`
- **3 new FollowButton callback tests**: verify `onToggle` fires with correct value on success; `onToggleRollback` fires on error; `onToggle` does NOT fire on error
- **Manual test**: Network → Offline → click Like/Favourite/Follow → verify button reverts and page is fully usable (navbar, layout visible)

### Risk

**Low** — fix is entirely within 3 action files. The `{ ok: false }` return is a plain JS object treated by React Router as a normal action completion. Components, router config, and loader wiring are unchanged. Loader revalidation still proceeds normally after action completion.
```
