# D10 — Server State Layer via React Router 7 Data Loading

> **Status (2026-07-04): ✅ Done (pilot scope)** — 6 pages export loaders, 4 components use `useFetcher`; `static-cache.ts`, `recipe-filters.ts`, and `routes/{like,favourite,rate,follow,comments}.ts` all exist.

> **Plan revised after codebase analysis — June 2026**
> The original plan proposed adding `@tanstack/react-query`. Analysis confirmed that
> **`react-router@7.15.1`** (already in `apps/web/package.json:8`) provides
> `loader` / `action` / `useFetcher` APIs that address every D10 concern without
> adding a new dependency. This revision incorporates all corrections from
> the second-pass investigation and the resolved design decisions.
>
> **Companion document**: `pr_description.md` (at the repo root) is the
> PR-ready summary of this plan. Use the two together: this file is the
> implementation spec; the PR description is the human-facing summary.

---

## Severity

**High**

---

## Issue Description

The frontend has no data-fetching abstraction layer. Every page independently
implements raw `useEffect` + `useState` + `fetch` patterns, resulting in:

- No automatic cache invalidation after mutations
- No skeleton-to-content transitions on navigation
- Manual loading/error state management duplicated across ~38 files
- No shared mutation handling
- No optimistic update support with automatic rollback
- Latent bugs (e.g. `CommentSection` misreads the paginated comments envelope
  as a flat array)

---

## Impact

- **UX**: Data goes stale immediately after mutations in other pages. Pages
  flash empty during fetch. Optimistic UI is "best-effort" with silent
  rollback failures.
- **DX**: Every page re-implements the same 5-line
  `.then().catch().finally()` pattern. New pages must copy boilerplate.
- **Performance**: Identical GETs may fire on every component mount
  (no route-level deduplication).

---

## Root Cause

The app was built with raw `useEffect` + `useState` + `fetch` before React
Router's data APIs were wired up. Each page independently manages its data
lifecycle.

---

## URL Param Convention (confirmed by server-side investigation)

BrewForm uses a strict convention on recipe routes. **Follow this exact
convention in the new resource routes.**

| Route kind | Path param | Rationale |
|---|---|---|
| Display / read routes (detail, versions, focus, compare) | `:slug` | SEO + URL-shareability |
| Mutation routes (like, favourite, rate, edit, fork) | `:id` | Stable internal UUID |
| Cross-entity lookups (comments on a recipe, follow a user) | `:recipeId` / `:userId` | Entity **id**, not slug |

The server's `GET /:slugOrId` endpoint (`apps/api/src/modules/recipe/index.ts:149-217`)
resolves id-first via UUID regex, then falls through to slug lookup. Every
mutation controller (`POST /:id/like`, etc.) only calls `model.findById` and
404s on a slug.

**Consequence**: the detail page URL is `/recipes/:slug` (e.g.
`/recipes/bobs-morning-v60`). The detail loader receives `params.slug` and
calls `recipeApi.get(slug)`. The mutation resource routes use `:id`, and
components pass `recipe.id` (already in `useLoaderData()` data) when
constructing action URLs.

**Existing recipe routes (`apps/web/src/router.tsx`)**:

```
/recipes                          list
/recipes/starred                  list (auth)
/recipes/unavailable              static
/recipes/new                      create (auth, lazy)
/recipes/compare/:slug1/:slug2    compare (lazy)
/recipes/:slug/versions           versions
/recipes/:slug                    detail         ← :slug
/recipes/:slug/focus              focus
/recipes/:id/edit                 edit (auth, lazy)
/recipes/:id/fork                 fork (auth, lazy)
```

**New resource routes (this PR)**:

```
/recipes/:id/like                 like           ← :id   (NEW)
/recipes/:id/favourite            favourite      ← :id   (NEW)
/recipes/:id/rate                 rate           ← :id   (NEW)

/follow/:userId                   follow/unfollow        (NEW, reuses server route)
/comments/recipe/:recipeId        create comment         (NEW, reuses server route)
/comments/:id                     delete comment         (NEW, reuses server route)
```

These coexist with the display routes because of differing segment counts
(3 segments vs 2) and RR7's path-based matching.

---

## Affected Files (in scope)

| File | Lines | Current pattern |
|---|---|---|
| `apps/web/src/pages/recipes/RecipeListPage.tsx` | 102–229 | 6 `useEffect`s (1 list, 1 static data, 1 debounced variety search, 1 click-outside, 1 variety-name lookup, 1 mount log) |
| `apps/web/src/pages/recipes/StarredRecipesPage.tsx` | 97–175 | 2 `useEffect`s (1 static data, 1 starred fetch) |
| `apps/web/src/pages/recipes/RecipeDetailPage.tsx` | 42–87 | 3 `useEffect`s (1 mount log, 1 taste-notes 5-retry loop, 1 recipe fetch with QR redirect) + inline `recipeApi.rate` call at line 345 |
| `apps/web/src/pages/HomePage.tsx` | 25–37 | 2 `useEffect`s (1 mount log, 1 parallel fetch) |
| `apps/web/src/pages/users/UserProfilePage.tsx` | 44–51, 227–233 | 2 `useEffect`s (1 profile, 1 follow list) |
| `apps/web/src/pages/settings/SettingsPage.tsx` | 30–34 | 1 `useEffect` (preferences) |
| `apps/web/src/components/recipe/LikeButton.tsx` | 10–28 | Manual optimistic toggle (no rollback) |
| `apps/web/src/components/recipe/FavouriteButton.tsx` | 10–28 | Manual optimistic toggle (no rollback) |
| `apps/web/src/components/user/FollowButton.tsx` | 10–31 | Manual toggle with hardcoded English error string |
| `apps/web/src/components/recipe/CommentSection.tsx` | 104–111 | `useEffect` → `api.get()` (also has 2 UI-only effects: status-message auto-dismiss, focus textarea) |

**Out of scope (same pattern, follow-up PRs)**: 28 other pages and 5 other
components. See "Out of Scope" section below.

---

## Why Not TanStack Query

1. **React Router 7 already installed.** `apps/web/package.json:8` declares
   `react-router: ^7.5.0`, resolved in `deno.lock:46` to `7.15.1`. The
   `loader` / `action` / `useFetcher` APIs directly address every D10 concern.

2. **Architectural alignment.** The app already uses
   `<RouterProvider router={router} />` (`apps/web/src/App.tsx:15`) in library
   mode. Colocating data fetching with routes is the idiomatic pattern.

3. **Provider anti-pattern.** Wrapping `<QueryClientProvider>` around
   `<RouterProvider>` would create two competing cache systems. Route
   `loader` functions execute outside the React tree, so they cannot access
   the query client anyway — any cache priming would require passing the
   client around manually.

4. **Zero new dependency.** No changes to `deno.lock`,
   `apps/web/package.json`, or any import map.

### What React Router 7 Covers

| D10 concern | RR7 solution |
|---|---|
| Eliminate `useEffect` + `fetch` boilerplate | Route `loader` (client-side, runs before render) |
| Loading state per page | `useNavigation().state === 'loading'` |
| Error state per page | Route-level `errorElement` |
| Cache invalidation after mutation | `action` → automatic revalidation of all active loaders |
| Optimistic updates with rollback | `useFetcher` + `fetcher.formData` (reverts on action error) |
| Request deduplication at route level | Loader called once per route, not per mounted component |
| Parallel data loading | `Promise.all([...])` inside a single loader |

### What React Router 7 Does Not Cover (vs TanStack Query)

| TanStack Query feature | Status |
|---|---|
| `staleTime` / background refetch on focus | Not built-in. Add a module-level memo for static data (`equipment`, `tasteNotes`). |
| Cross-tab state sync | Neither library provides this without polling/WebSockets. Out of scope. |
| Per-query cache TTL | Not needed. RR7 revalidates on every navigation and after every action. |

---

## Plan Corrections (vs original D10 plan)

| # | Original claim | Issue | Correction |
|---|---|---|---|
| 1 | Install `@tanstack/react-query` | Not needed — `react-router@7.15.1` already in `deno.lock` | No install |
| 2 | `QueryClientProvider` in `App.tsx` | Anti-pattern | No provider changes |
| 3 | Dependency in `apps/web/deno.json` | Dep is in `apps/web/package.json:8` (npm-pinned) | `deno.json` has no `imports` block |
| 4 | API functions auto-attach JWT from `localStorage` | **Wrong** — auth is HTTP-only cookies + `credentials: 'include'` (`client.ts:23`) | Loaders still work; browser sends cookies automatically |
| 5 | `<RouteError />` component | Does not exist | Use existing `RootErrorBoundary` (`apps/web/src/components/ErrorBoundary.tsx:3`) |
| 6 | `recipeApi.toggleLike(slug, formData?)` | Function is `recipeApi.like(id)` — `(id: string) => Promise<...>`, no formData | `apps/web/src/api/index.ts:51` |
| 7 | `recipeApi.toggleFavourite` | Function is `recipeApi.favourite(id)` | `apps/web/src/api/index.ts:52` |
| 8 | Follow: `users/:username/follow` | Server route is `POST /follow/:userId` + `DELETE /follow/:userId` | `apps/api/src/modules/follow/index.ts:11, 29` |
| 9 | Comments: `recipes/:slug/comments` | Server route is `/comments/recipe/:recipeId` (uses **id**) | `apps/api/src/modules/comment/index.ts:11, 59` |
| 10 | Comment delete endpoint exists on client | Server endpoint exists; no client wrapper | Add `commentApi.delete(id)` |
| 11 | Comments response is `Comment[]` flat | Server returns `{ data, meta: { pagination: { total, page, perPage, totalPages } } }`; client was misreading meta as array | Use `api.getWithMeta` (also closes D15) |
| 12 | `tasteNotes` only for `RecipeDetailPage` | List pages also need `equipment` + `tasteNotes` for filter sidebar | Loader `Promise.all`s all three |
| 13 | Module-level memo shared between list pages | Each list page declared its **own** module-level `cachedEquipment` / `cachedTasteNotes` | New `static-cache.ts` is shared |
| 14 | Resource route param `:slug` for like/favourite | Server mutations only accept `:id` | Resource routes use `:id`; components pass `recipe.id` |
| 15 | `recipeApi.rate` (inline in `StarRating`) | Not in plan | Migrate to `useFetcher` action (5th resource route) |
| 16 | `FollowButton` error UI: keep | **Drop** (per resolved design decision) | Silent revert on action error |
| 17 | `SettingsPage` save: `useFetcher` action | **Keep `api.patch`** (per resolved design decision) | Single button, no URL nav |
| 18 | Loaders inline in `router.tsx` | **Hoist to named exports** for `useLoaderData<typeof loader>()` type inference (per resolved design decision) | New `apps/web/src/routes/*.ts` for actions; loaders colocated with pages |

---

## Fix Approach

Use React Router 7's built-in data layer: **route loaders** for all data
fetching and **route actions + `useFetcher`** for all mutations.

### Technical Approach

1. **No new dependencies** — `react-router` is already installed.
2. **No provider changes** — `App.tsx` provider tree remains unchanged.
3. **Hoist every loader and action to a named export.** Loaders colocate
   with their page component; resource route actions live in
   `apps/web/src/routes/*.ts`. This enables
   `useLoaderData<typeof loader>()` for end-to-end type inference.
4. Attach a `loader` function to every migrated page route.
5. Remove `useEffect`, `useState` loading/error boilerplate from pages; read
   data via `useLoaderData`.
6. Add **resource routes** (action-only, no `element`) for each mutation.
7. Replace manual optimistic toggles with `useFetcher` + `fetcher.formData`.
8. Add `errorElement: <RootErrorBoundary />` to routes that benefit from
   per-route error UI.
9. For static data (`equipment`, `tasteNotes`), use a module-level memo
   inside the loader to avoid redundant API calls across navigations.

### App.tsx Provider Tree — No Changes Required

```tsx
// apps/web/src/App.tsx — stays exactly as-is
<ThemeProvider>
  <I18nProvider>
    <AuthProvider>
      <Suspense fallback={<PageSkeleton />}>
        <RouterProvider router={router} />
      </Suspense>
    </AuthProvider>
  </I18nProvider>
</ThemeProvider>
```

---

## File Structure (after migration)

```
apps/web/src/
├─ router.tsx                          # imports loaders + actions, wires routes
├─ api/
│   ├─ static-cache.ts                 # NEW — module-level memo for equipment + tasteNotes
│   └─ index.ts                        # + commentApi, tighter types on equipmentApi.list / tasteApi.flat
├─ routes/                             # NEW — resource route actions only
│   ├─ like.ts                         # likeAction
│   ├─ favourite.ts                    # favouriteAction
│   ├─ rate.ts                         # rateAction
│   ├─ follow.ts                       # followAction (method-aware)
│   └─ comments.ts                     # createCommentAction, deleteCommentAction
├─ pages/
│   ├─ HomePage.tsx                    # exports HomePage + loader
│   ├─ recipes/
│   │   ├─ RecipeListPage.tsx          # exports RecipeListPage + loader
│   │   ├─ StarredRecipesPage.tsx      # exports StarredRecipesPage + loader
│   │   └─ RecipeDetailPage.tsx        # exports RecipeDetailPage + loader
│   ├─ users/
│   │   └─ UserProfilePage.tsx         # exports UserProfilePage + loader
│   └─ settings/
│       └─ SettingsPage.tsx            # exports SettingsPage + loader
└─ components/
    └─ recipe/
        ├─ LikeButton.tsx              # useFetcher, no error UI
        ├─ FavouriteButton.tsx         # useFetcher, no error UI
        ├─ FollowButton.tsx            # useFetcher + fetcher.submit, no error UI
        └─ CommentSection.tsx          # useLoaderData for initial; useFetcher for mutations
```

---

## Implementation Spec

### Step 1: `apps/web/src/api/static-cache.ts` (new)

```ts
import { equipmentApi, tasteApi } from './index.ts';
import type { EquipmentListItem, TasteNoteFlatItem } from './types.ts';

let _equipment: EquipmentListItem[] | null = null;
let _tasteNotes: TasteNoteFlatItem[] | null = null;

export async function getEquipmentCached(): Promise<EquipmentListItem[]> {
  if (!_equipment) _equipment = (await equipmentApi.list()) as EquipmentListItem[];
  return _equipment;
}

export async function getTasteNotesCached(): Promise<TasteNoteFlatItem[]> {
  if (!_tasteNotes) _tasteNotes = (await tasteApi.flat()) as TasteNoteFlatItem[];
  return _tasteNotes;
}

export function invalidateStaticCache(): void {
  _equipment = null;
  _tasteNotes = null;
}
```

### Step 2: `apps/web/src/api/index.ts` (modify)

- Add `commentApi` module:
  ```ts
  export const commentApi = {
    list: (recipeId: string, page: number) =>
      api.getWithMeta<Comment[]>(`/comments/recipe/${recipeId}?page=${page}`),
    create: (recipeId: string, payload: { content: string; parentCommentId?: string }) =>
      api.post<Comment>(`/comments/recipe/${recipeId}`, payload),
    delete: (id: string) => api.delete<{ message: string }>(`/comments/${id}`),
  };
  ```
  Import `Comment` from `./types.ts` (already exists; if not, add it).
- Tighten the return types on `equipmentApi.list()` (line 85) and
  `tasteApi.flat()` (line 63) from `Record<string, unknown>[]` to
  `EquipmentListItem[]` / `TasteNoteFlatItem[]` (interfaces already in
  `apps/web/src/api/types.ts:130-135, :147-152`).

### Step 3: `apps/web/src/routes/*.ts` (new — resource route actions)

One file per action. Each exports a named `action` function:

```ts
// apps/web/src/routes/like.ts
import { recipeApi } from '../api/index.ts';

export const likeAction = async ({ params }: { params: { id: string } }) => {
  await recipeApi.like(params.id);
  return null;
};
```

```ts
// apps/web/src/routes/favourite.ts
import { recipeApi } from '../api/index.ts';

export const favouriteAction = async ({ params }: { params: { id: string } }) => {
  await recipeApi.favourite(params.id);
  return null;
};
```

```ts
// apps/web/src/routes/rate.ts
import { recipeApi } from '../api/index.ts';

export const rateAction = async ({ params, request }: { params: { id: string }; request: Request }) => {
  const form = await request.formData();
  const rating = Number(form.get('rating'));
  return recipeApi.rate(params.id, rating);
};
```

```ts
// apps/web/src/routes/follow.ts
import { api } from '../api/index.ts';

export const followAction = async ({ params, request }: { params: { userId: string }; request: Request }) => {
  if (request.method === 'DELETE') {
    await api.delete(`/follow/${params.userId}`);
  } else {
    await api.post(`/follow/${params.userId}`, {});
  }
  return null;
};
```

```ts
// apps/web/src/routes/comments.ts
import { commentApi } from '../api/index.ts';

export const createCommentAction = async ({ params, request }: { params: { recipeId: string }; request: Request }) => {
  const form = await request.formData();
  const content = form.get('content') as string;
  const parentCommentId = form.get('parentCommentId') as string | null;
  return commentApi.create(params.recipeId, {
    content,
    ...(parentCommentId ? { parentCommentId } : {}),
  });
};

export const deleteCommentAction = async ({ params }: { params: { id: string } }) => {
  await commentApi.delete(params.id);
  return null;
};
```

### Step 4: Page migrations (hoist loaders, remove useEffect/useState)

For every page, follow this template (shown for `RecipeListPage`):

**Before** (current code at `RecipeListPage.tsx:102-229`):
```tsx
const [recipes, setRecipes] = useState<RecipeListItem[]>([]);
const [total, setTotal] = useState(0);
const [loading, setLoading] = useState(true);
// ...more state

useEffect(() => {
  setLoading(true);
  recipeApi.list(params).then((res) => {
    setRecipes(res.data);
    setTotal(res.meta.pagination.total);
  }).catch(() => {}).finally(() => setLoading(false));
}, [/* many deps */]);
```

**After (page file exports the loader as a named export)**:
```ts
// apps/web/src/pages/recipes/RecipeListPage.tsx

import { recipeApi } from '../../api/index.ts';
import { getEquipmentCached, getTasteNotesCached } from '../../api/static-cache.ts';
import { extractListParams } from '../../utils/recipe-filters.ts';
import type { RecipeListItem, EquipmentListItem, TasteNoteFlatItem } from '../../api/types.ts';

export interface RecipeListLoaderData {
  recipesResponse: { data: RecipeListItem[]; meta: { pagination?: { total?: number } } };
  equipment: EquipmentListItem[];
  tasteNotes: TasteNoteFlatItem[];
}

export const loader = async ({ request }: { request: Request }): Promise<RecipeListLoaderData> => {
  const url = new URL(request.url);
  const params = extractListParams(url.searchParams);
  const [recipesResponse, equipment, tasteNotes] = await Promise.all([
    recipeApi.list(params),
    getEquipmentCached(),
    getTasteNotesCached(),
  ]);
  return { recipesResponse, equipment, tasteNotes };
};

export function RecipeListPage() {
  const { recipesResponse, equipment, tasteNotes } = useLoaderData() as RecipeListLoaderData;
  const navigation = useNavigation();
  // ...no useState for data, no useEffect for fetch
  // ...useNavigation().state === 'loading' for skeleton
}
```

**`apps/web/src/utils/recipe-filters.ts` (new)** — extract the URL-parsing
logic currently inline in `RecipeListPage.tsx:140-186` and
`StarredRecipesPage.tsx:114-126`:

```ts
export interface ListFilterParams {
  page: string;
  perPage: string;
  sortBy: string;
  brewMethod?: string;
  drinkType?: string;
  visibility?: string;
  search?: string;
  equipmentId?: string;
  mainBrewer?: string;
  tasteNoteIds?: string;
  coffeeVarietyId?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function extractListParams(sp: URLSearchParams): Record<string, string> {
  const params: Record<string, string> = {
    page: sp.get('page') ?? '1',
    perPage: '12',
    sortBy: sp.get('sortBy') ?? 'createdAt',
  };
  const map: Record<string, string | undefined> = {
    brewMethod: sp.get('brewMethod') ?? undefined,
    drinkType: sp.get('drinkType') ?? undefined,
    visibility: sp.get('visibility') ?? undefined,
    search: sp.get('search') ?? undefined,
    equipmentId: sp.get('equipmentId') ?? undefined,
    mainBrewer: sp.get('mainBrewer') ?? undefined,
    tasteNoteIds: sp.get('tasteNoteIds') ?? undefined,
    coffeeVarietyId: sp.get('coffeeVarietyId') ?? undefined,
  };
  for (const [k, v] of Object.entries(map)) {
    if (v && v.length > 0) {
      // UUID validation for ids
      if ((k === 'equipmentId' || k === 'coffeeVarietyId') && !UUID_RE.test(v)) continue;
      params[k] = v;
    }
  }
  return params;
}
```

### Step 5: Loaders per page

| Page | Loader behavior |
|---|---|
| `RecipeListPage` | `Promise.all([recipeApi.list(params), getEquipmentCached(), getTasteNotesCached()])` |
| `StarredRecipesPage` | Same shape, calls `recipeApi.starred(params)`. Throws `redirect('/login')` on 401. |
| `RecipeDetailPage` | `const recipe = await recipeApi.get(slug); if (fromQr && recipe.visibility !== 'public') throw redirect('/recipes/unavailable'); const [tasteNotes, comments] = await Promise.all([getTasteNotesCached(), api.getWithMeta<Comment[]>(`/comments/recipe/${recipe.id}?page=1`)]);` (Note: `slug` param, but the comment fetch uses `recipe.id`.) |
| `HomePage` | `Promise.all([recipeApi.list({ perPage: '6', sortBy: 'createdAt' }), recipeApi.list({ perPage: '6', sortBy: 'likeCount' })])` |
| `UserProfilePage` | `const profile = (await api.get(`/users/${username}`)) as UserProfile; if (tab !== 'recipes' && tab !== 'badges') { followData = await api.get(`/follow/${profile.id}/${tab}`); }` (tab from `?tab=...` URL param; defaults to `'recipes'`) |
| `SettingsPage` | `api.get<Preferences>('/preferences')` |

### Step 6: Component migrations (remove useEffect, use useLoaderData)

For every page:

1. **Remove** `useState` for data fields (`recipes`, `total`, `loading`,
   `allEquipment`, `allTasteNotes`, etc.). Keep `useState` for UI-only
   fields (sidebar open, dropdowns, etc.).
2. **Remove** `useEffect` for data fetching. Keep `useEffect` for UI-only
   concerns (click-outside listeners, focus, mount/unmount logs).
3. **Replace** `loading` checks with
   `useNavigation().state === 'loading'`. To avoid showing skeleton on
   unrelated navigations, gate on
   `navigation.location?.pathname === '/recipes'` (or current path).
4. **Remove** `.catch(() => {})` patterns; let errors bubble to
   `errorElement`.

For `RecipeDetailPage` specifically:

- The 5-retry `tasteApi.flat()` loop (lines 49-71) is **dropped** — the
  static cache supersedes it.
- The QR-private redirect (lines 78, 84) **moves into the loader** — throw
  `redirect('/recipes/unavailable')` before the component renders.
- The "Not Found" branch (lines 93-101) is replaced by throwing
  `Response('Not Found', { status: 404 })` in the loader when
  `recipeApi.get` 404s. `isRouteErrorResponse(error)` in the
  `errorElement` handles it.

For `SettingsPage` specifically:

- **Add** a loading skeleton (currently the page renders empty before
  `prefs` arrives).
- **Keep** the `api.patch('/preferences', payload)` call for save — no
  fetcher action. The save UX is form-submit + toast; no URL nav.

### Step 7: Button components (use useFetcher + optimistic pattern)

**`LikeButton.tsx`** — replace lines 10-28 with:

```tsx
import { useFetcher } from 'react-router';

interface Props {
  recipeId: string;
  liked: boolean;       // server value from useLoaderData
  initialCount?: number;
}

export function LikeButton({ recipeId, liked: serverLiked, initialCount }: Props) {
  const fetcher = useFetcher();
  const optimisticLiked = fetcher.formData?.get('liked') === 'true';
  const liked = optimisticLiked ?? serverLiked;
  const pendingDelta = fetcher.formData
    ? (fetcher.formData.get('liked') === 'true' ? 1 : -1)
    : 0;
  const count = (initialCount ?? 0) + pendingDelta;

  return (
    <fetcher.Form method="post" action={`/recipes/${recipeId}/like`}>
      <input type="hidden" name="liked" value={String(!liked)} />
      <button
        type="submit"
        disabled={fetcher.state !== 'idle'}
        aria-label={liked ? 'Unlike' : 'Like'}
      >
        {liked ? '❤️' : '🤍'} {count}
      </button>
    </fetcher.Form>
  );
}
```

`FavouriteButton.tsx` is structurally identical — same template, action
URL `/recipes/${recipeId}/favourite`, prop name `favourited`.

**`FollowButton.tsx`** — drop the `error` state, use `fetcher.submit` for
DELETE (since `<fetcher.Form>` only supports GET/POST):

```tsx
import { useFetcher } from 'react-router';

interface Props {
  userId: string;
  following: boolean;   // server value from useLoaderData
  onToggle?: (next: boolean) => void;
}

export function FollowButton({ userId, following: serverFollowing, onToggle }: Props) {
  const fetcher = useFetcher();
  const optimistic = fetcher.formData?.get('following') === 'true';
  const following = optimistic ?? serverFollowing;

  const handleClick = () => {
    fetcher.submit(
      { following: String(!following) },
      {
        method: following ? 'delete' : 'post',
        action: `/follow/${userId}`,
      },
    );
    onToggle?.(!following);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={fetcher.state !== 'idle'}
      aria-pressed={following}
    >
      {following ? 'Unfollow' : 'Follow'}
    </button>
  );
}
```

**Inline `StarRating` call in `RecipeDetailPage.tsx:345`** — replace the
inline `recipeApi.rate(recipe.id, rating)` with a fetcher action. Move the
`StarRating` component out of the inline closure into its own component
file (optional, but cleaner) or keep it inline:

```tsx
const ratingFetcher = useFetcher();

<ratingFetcher.Form method="post" action={`/recipes/${recipe.id}/rate`}>
  <input type="hidden" name="rating" value={String(rating)} />
  <StarRating
    value={rating}
    onChange={setRating}
    pending={ratingFetcher.state !== 'idle'}
  />
</ratingFetcher.Form>
```

### Step 8: `CommentSection.tsx`

Initial comment list moves to the recipe detail loader. Mutations
(add/reply/delete) use `useFetcher` against the resource routes. The
"Load more" pagination becomes `useFetcher().load(...)` accumulating into
local state.

```tsx
interface Props {
  recipeId: string;     // from parent (recipe loader)
  initialComments: { data: Comment[]; meta: { pagination: { total: number; page: number; perPage: number; totalPages: number } } };
}

export function CommentSection({ recipeId, initialComments }: Props) {
  const [comments, setComments] = useState<Comment[]>(initialComments.data);
  const [page, setPage] = useState(1);
  const total = initialComments.meta.pagination.total;
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  // ...remaining UI state

  const loadMoreFetcher = useFetcher();
  // When loadMoreFetcher.data arrives, append to comments and increment page.

  const submitFetcher = useFetcher();
  // On submit, optimistically prepend; replace with submitFetcher.data on success.

  const deleteFetcher = useFetcher();
  // On delete, optimistically remove; on success, just rely on the
  // automatic revalidation (loader re-runs and re-populates).

  // Keep the 2 UI-only useEffects (status-message auto-dismiss,
  // focus textarea on reply). Drop the data-fetching useEffect at
  // lines 104-111.
}
```

**Note**: the "total is set from `data.length`" bug at line 108 is fixed
because the loader now returns the proper `meta.pagination.total`.

### Step 9: `apps/web/src/router.tsx` (wire it all up)

```ts
import { loader as homeLoader, HomePage } from './pages/HomePage.tsx';
import { loader as recipeListLoader, RecipeListPage } from './pages/recipes/RecipeListPage.tsx';
import { loader as starredLoader, StarredRecipesPage } from './pages/recipes/StarredRecipesPage.tsx';
import { loader as detailLoader, RecipeDetailPage } from './pages/recipes/RecipeDetailPage.tsx';
import { loader as profileLoader, UserProfilePage } from './pages/users/UserProfilePage.tsx';
import { loader as settingsLoader, SettingsPage } from './pages/settings/SettingsPage.tsx';

import { likeAction } from './routes/like.ts';
import { favouriteAction } from './routes/favourite.ts';
import { rateAction } from './routes/rate.ts';
import { followAction } from './routes/follow.ts';
import { createCommentAction, deleteCommentAction } from './routes/comments.ts';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    errorElement: <RootErrorBoundary />,
    children: [
      { index: true, element: <HomePage />, loader: homeLoader, errorElement: <RootErrorBoundary /> },
      { path: 'recipes', element: <RecipeListPage />, loader: recipeListLoader, errorElement: <RootErrorBoundary /> },
      { path: 'recipes/starred', element: <RequireAuth><StarredRecipesPage /></RequireAuth>, loader: starredLoader, errorElement: <RootErrorBoundary /> },
      // ...other unchanged routes
      { path: 'recipes/:slug', element: <RecipeDetailPage />, loader: detailLoader, errorElement: <RootErrorBoundary /> },
      { path: 'u/:username', element: <UserProfilePage />, loader: profileLoader, errorElement: <RootErrorBoundary /> },
      { path: 'settings', element: <RequireAuth><SettingsPage /></RequireAuth>, loader: settingsLoader, errorElement: <RootErrorBoundary /> },
      // ...other unchanged routes

      // Resource routes (no element):
      { path: 'recipes/:id/like', action: likeAction },
      { path: 'recipes/:id/favourite', action: favouriteAction },
      { path: 'recipes/:id/rate', action: rateAction },
      { path: 'follow/:userId', action: followAction },
      { path: 'comments/recipe/:recipeId', action: createCommentAction },
      { path: 'comments/:id', action: deleteCommentAction },
    ],
  },
  // ...admin subtree unchanged
]);
```

### Step 10: Cleanup

- Grep for `useEffect` in the 6 migrated pages; confirm only UI-only
  effects remain (mount logs, click-outside, focus).
- Remove the now-dead `useState` for cached data in the list pages.
- Remove the `_resetStaticCache()` test escape hatch in
  `RecipeListPage.tsx:98` (replaced by `invalidateStaticCache()` from
  `static-cache.ts`).
- Run `make check-web` and `make lint`.

---

## Migration Order

Execute in this order (each step is independently mergeable):

1. **Create `apps/web/src/api/static-cache.ts`** (Step 1).
2. **Add `commentApi` + tighten types in `apps/web/src/api/index.ts`** (Step 2).
3. **Create `apps/web/src/utils/recipe-filters.ts`** (extracted helper).
4. **Create `apps/web/src/routes/*.ts`** — all 5 resource action files (Step 3).
5. **Migrate `RecipeListPage`** (pilot) — hoist loader, remove useEffect/useState, wire to router (Steps 4-6, 9).
6. **Migrate `StarredRecipesPage`** — same shape, calls `recipeApi.starred`.
7. **Migrate `HomePage`** — two parallel list loaders.
8. **Migrate `UserProfilePage`** — profile + optional followers/following.
9. **Migrate `SettingsPage`** — preferences loader, add loading skeleton.
10. **Migrate `RecipeDetailPage`** — biggest change (parallel loader, QR redirect, comments, rate).
11. **Migrate `LikeButton`** (Step 7).
12. **Migrate `FavouriteButton`** — same as LikeButton.
13. **Migrate `FollowButton`** — same with `fetcher.submit` for DELETE.
14. **Migrate `StarRating` (inline in `RecipeDetailPage`)** — fetcher action.
15. **Migrate `CommentSection`** — initial via loader, mutations via fetcher (Step 8).
16. **Wire all new routes into `router.tsx`** (Step 9).
17. **Cleanup pass** (Step 10).
18. **Run `make check-web && make lint && make test`**.

---

## Testing Strategy

Per `AGENTS.md`, run after every edit:
- `make check-web` — type-check
- `deno task lint:web` (or `make lint`) — lint

End-to-end verification in browser (against `make dev`):

1. **List page skeleton** — hard reload `/recipes`. Verify
   `RecipeCardSkeletonGrid` renders during initial load.
2. **Filter navigation** — change a filter in the URL. Verify skeleton
   appears briefly and the list re-fetches.
3. **Cross-route revalidation** — on `/recipes/:slug`, click the like
   button. Verify the detail page's `likeCount` updates immediately
   (optimistic) and persists on refresh.
4. **Optimistic update** — click the like button on the list. Verify the
   heart fills instantly. Refresh — verify persistence.
5. **Optimistic rollback** — DevTools → Network → "Offline", then click
   the like button. Verify the heart reverts (no manual state management).
6. **Module memo hit** — DevTools Network on `/recipes/coffee-101`,
   navigate away, navigate back. Verify `tasteNotes` is not re-fetched.
7. **Deduplication at route level** — DevTools Network on `/recipes`.
   Verify the list loader fires **once per navigation**, not once per
   `<RecipeCard>`.
8. **Comments pagination** — open a recipe with >10 comments. Click "Load
   more". Verify more comments appear, `total` is correct (this also
   verifies D15 is fixed).
9. **Comments delete** — click delete on a comment. Verify it disappears
   without a page reload.
10. **Follow / unfollow** — toggle on a user profile. Verify the count
    updates optimistically. Verify silent revert on offline.
11. **Rating** — click stars on a recipe. Verify `avgRating` and
    `ratingCount` update in the loader data after the fetcher returns.
12. **Error boundary** — temporarily set the API to 500. Verify
    `<RootErrorBoundary />` renders, page layout is intact.
13. **Settings save** — change unit system, save, navigate away, navigate
    back. Verify the new value persists.
14. **Type inference** — open `RecipeListPage.tsx` in an IDE. Hover over
    `useLoaderData()` — should resolve to `RecipeListLoaderData` without
    manual `as` cast on the hook result (the `as` cast on the right-hand
    side is still there to satisfy the return-type assertion).

---

## Risk Assessment

- **Low**: Incremental migration — each file is independent. Each step is
  independently mergeable.
- **Low**: React Router 7 is battle-tested and already in the dep graph.
- **Medium**: `useFetcher` + resource routes is a paradigm shift. Take care
  to validate automatic revalidation for each mutation (DevTools Network:
  confirm the route loader re-fires after each action).
- **Medium**: The recipe detail loader now does 2-3 sequential/parallel
  fetches. If `recipeApi.get(slug)` fails, the loader throws and the
  `errorElement` renders — no silent swallow. Verify the error UX is
  acceptable for each failure mode.
- **Note**: The recipe detail page's `from=qr` redirect now happens at
  loader time (before render), not after. This is a behavior change: the
  QR redirect will fire faster, but if the recipe load is slow, users
  may briefly see the loading skeleton before the redirect. Acceptable.
- **Note**: `SettingsPage` previously had **no loading state at all** — the
  page rendered empty before `prefs` arrived. The migration adds a
  skeleton; verify this doesn't cause a visible flash on quick loads.

---

## Design Decisions (resolved)

1. **Resource route param naming** — **`:id`** (not `:slug` or `:slugOrId`).
   URL is `/recipes/${recipe.id}/like`. The components pass `recipe.id`
   from `useLoaderData()` data. Matches the server's `model.findById`
   resolution. No slug→id resolver needed.

2. **FollowButton error UI** — **dropped**. Silent revert on action error,
   consistent with `LikeButton` / `FavouriteButton`. If a future UX review
   asks for visible errors on persistent failure, add a `fetcher.data`
   read — out of scope for this PR.

3. **Loader return-type inference** — **hoisted** as named exports per
   page. `useLoaderData<typeof loader>()` (cast to the explicit
   `*LoaderData` interface) gives end-to-end type safety from the loader
   return to the JSX. Resource route actions live in
   `apps/web/src/routes/*.ts` as named exports for the same reason.

4. **SettingsPage save** — **kept as `api.patch`** (no action). Single
   button with a toast result and no URL nav; converting to a fetcher
   would add complexity for no UX win.

---

## Dependencies

- **D11** (recipe list deduplication) — should be done **after** D10. The
  shared `useRecipeFilters()` hook will be built on `useSearchParams` +
  `useNavigation`, not on the old `useEffect`+`fetch` pattern.
- **D14** (useUnitSystem reactivity) — no coupling. Unit conversion
  happens in render, not in loaders. The D14 plan's "Option C — TanStack
  Query" is no longer applicable; "Option A — read from `AuthContext`" is
  the path.
- **D15** (comment pagination bug) — **resolved by this PR**. The fix is
  a natural side effect of moving comments to the route loader.
- **D18** (optimistic rollback) — **resolved by this PR**. `useFetcher` +
  `fetcher.formData` provides automatic rollback.
- **D27** (cursor pagination) — independent. If shipped in parallel, the
  recipe list migration should use `useFetcher` for "Load more" rather
  than route-segment pagination, to avoid rework.

---

## Out of Scope (intentional)

This PR is a **pilot** covering the 6 highest-traffic pages and 4 mutation
components. The same template applies to 28 other pages:

- `SetupListPage`, `EquipmentListPage`, `BeanListPage`
- `RecipeCreatePage`, `RecipeEditPage`, `RecipeComparePage`,
  `RecipeVersionsPage`, `RecipeFocusModePage`, `RecipeForkPage`
- All admin pages (`AdminDashboard`, `AdminUsersPage`, etc.)
- `TastingNotesPage`, `CoffeeVarietiesPage`, `CoffeeVarietyDetailPage`

And 5 other components: `TasteAutocomplete`, `Navbar` (search dropdown
already fetches), `OnboardingWizard`, `SEOHead`, `CookieConsent`.

These will be migrated in follow-up PRs using the same recipe. Document
the intent in the PR description.

---

## References

- React Router 7 — data loading: https://reactrouter.com/how-to/fetchers
- React Router 7 — SPA / client data: https://reactrouter.com/how-to/spa
- React Router 7 — pending UI: https://reactrouter.com/start/framework/pending-ui
- React Router 7 — resource routes: https://reactrouter.com/how-to/resource-routes
- React Router 7 — error boundaries: https://reactrouter.com/how-to/error-boundary
- React Router 7 — `useFetcher` optimistic UI:
  https://reactrouter.com/tutorials/address-book (Favourite section)

---

## Acceptance Criteria

This PR is **done** when:

- [ ] `apps/web/src/api/static-cache.ts` exists with the 3 exports above
- [ ] `apps/web/src/api/index.ts` has `commentApi` with `list` / `create` /
      `delete`, and tightened types on `equipmentApi.list` / `tasteApi.flat`
- [ ] `apps/web/src/utils/recipe-filters.ts` exists with `extractListParams`
- [ ] `apps/web/src/routes/{like,favourite,rate,follow,comments}.ts` exist
      with the named action exports above
- [ ] All 6 migrated pages export a named `loader` and read data via
      `useLoaderData`
- [ ] All 4 migrated components use `useFetcher` + `fetcher.formData` (or
      `fetcher.submit` for DELETE)
- [ ] `router.tsx` wires the new loaders and resource route actions
- [ ] All `useEffect` blocks for data fetching are removed from the 6
      migrated pages (UI-only effects may remain)
- [ ] All `useState` for data is removed from the 6 migrated pages
- [ ] `RootErrorBoundary` is reused (no new error component created)
- [ ] `RecipeDetailPage`'s 5-retry `tasteApi.flat()` loop is removed
- [ ] `RecipeDetailPage`'s QR redirect is in the loader, not the
      component
- [ ] `CommentSection` reads initial comments from a prop (passed by
      parent from `useLoaderData`), not from a `useEffect`
- [ ] `make check-web` passes
- [ ] `make lint` passes
- [ ] `make test` passes
- [ ] All 14 items in the Testing Strategy checklist pass manually
- [ ] `plans/D14-fix-use-unit-system.md` updated: Option C (TanStack
      Query) marked as N/A
- [ ] `plans/D15-fix-comment-pagination.md` marked as **resolved by D10**
- [ ] `plans/D18-fix-optimistic-rollback.md` marked as **resolved by D10**
- [ ] `TECHNICAL_DEBT.md` D10 entry updated to reference the React Router
      7 approach (not TanStack Query)
