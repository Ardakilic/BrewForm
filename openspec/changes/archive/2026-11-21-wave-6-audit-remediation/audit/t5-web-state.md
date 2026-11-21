# t5-web-state: providers, shareable URL state, and the data-loading standard

Track owner notes for `wave-6-audit-remediation`. Covers audit findings
`web-architecture/admin-toast-provider-missing` (dup `ui-visual-design/admin-pages-crash-no-toast-provider`),
`web-architecture/recipe-list-pagination-reset`, `web-architecture/search-per-keystroke-navigation`,
`web-architecture/split-data-layer-no-cancellation`, `web-architecture/loader-auth-interplay`,
`web-architecture/comment-action-error-contract`, `web-architecture/api-client-robustness`
(signal + single-flight + parsing), `web-architecture/static-cache-crosstab-loop` (in-flight dedup part),
and the data-loading parts of `web-architecture/inconsistent-mutation-error-feedback` and
`ui-visual-design/errors-rendered-as-empty`.

All file:line references were re-read on 2026-11-18 against `main` @ `ada9f6e`.

---

## 1. Validation of the audit claims

| # | Claim | Verdict | Evidence (re-read) |
|---|---|---|---|
| V1 | `/admin` is a sibling of `/`, so it is not rendered inside `Layout` | confirmed | `apps/web/src/router.tsx:69-73` (`path: '/'`, `element: <Layout />`) and `:351-363` (`path: '/admin'`, `<RequireAuth requireAdmin><AdminLayout/></RequireAuth>`, `errorElement: <RootErrorBoundary />`) |
| V2 | `ToastProvider`/`ConfirmProvider` are mounted only in `Layout` | confirmed | `components/layout/Layout.tsx:23-24`; its JSDoc at `:16-17` wrongly claims "all routed pages can use `useToast()`"; `App.tsx:17-27` stacks only Theme/I18n/Auth; `pages/admin/AdminLayout.tsx:6-51` has no providers |
| V3 | `useToast()` throws outside the provider | confirmed | `components/ui/Toast.tsx:99-102` |
| V4 | Five admin pages call `useToast()` during render and crash | confirmed | `AdminRecipesPage.tsx:26`, `AdminUserDetailPage.tsx:25`, `AdminCompatibilityPage.tsx:21`, `AdminVendorsPage.tsx:18`, `AdminCoffeeVarietiesPage.tsx:124` |
| V5 | Two more admin pages show a raw i18n key in a native confirm | confirmed | `components/ui/Modal.tsx:161-167` falls back to `window.confirm(opts.bodyKey)`; callers outside any provider: `AdminEquipmentPage.tsx:17`, `AdminTasteNotesPage.tsx:17` (plus the five above, which crash before they get there) |
| V6 | Tests hide the crash | confirmed | 9 page tests wrap themselves in `ToastProvider`/`ConfirmProvider` (e.g. `AdminCoffeeVarietiesPage.test.tsx`, `AdminRecipesPage.test.tsx`, `AdminVendorsPage.test.tsx`, `AdminCompatibilityPage.test.tsx`, `AdminUserDetailPage.test.tsx`); `router.test.tsx:63-68` only asserts the `/admin` route object exists and never renders it |
| V7 | `updateFilter('page', n)` deletes `page` immediately, so Next/Prev always land on page 1 | confirmed | `components/recipe-list/useRecipeFilters.ts:78-93` (`params.delete('page')` at `:91` runs for every key); wired at `RecipeListView.tsx:431` |
| V8 | A test codifies the bug | confirmed | `useRecipeFilters.test.tsx:148-157` ("should always clear the page param…"); the `setPage` button at `:69` is never clicked |
| V9 | The recipe list loader reads `page` from the URL correctly | confirmed (bug is UI-only) | `pages/recipes/RecipeListPage.tsx:31-40` → `utils/recipe-filters.ts:28-64` (`extractListParams` clamps `page`) |
| V10 | Search/author inputs navigate (push + loader + API call) on every keystroke | confirmed | `RecipeListView.tsx:275`, `:362`; `useRecipeFilters.ts:92` (`setSearchParams(params)` = push); catalog pages debounce the fetch but still push per keystroke: `EquipmentCatalogPage.tsx:125`, `CoffeeVarietiesPage.tsx:116`; `AdminCoffeeVarietiesPage.tsx:393` refetches per keystroke with no debounce |
| V11 | ~30 `useEffect` fetchers, no cancellation, 4 stale guards | confirmed, slightly understated | a block-level scan finds **42 `useEffect` blocks in 39 files** that call the API client (direct or through a local fetch function); only **4** have any stale/cancel guard (`BrewHistorySection.tsx:25`, `RecipeBrewStats.tsx:20`, `NotificationDropdown.tsx:32`, `useCoffeeVarietyFilter.tsx:40`). Full inventory in section 4 |
| V12 | 13 routes use loaders | confirmed | 13 page modules export `loader` (Home, Recipes, Starred, RecipeDetail, Collections x4, BrewLogs x2, Profile, Settings, Notifications) plus one resource loader (`routes/comments.ts:24`); 5 resource actions |
| V13 | API client has no `AbortSignal`, no single-flight refresh, unguarded `response.json()` | confirmed | `api/client.ts:124-140` (verb helpers take no options), `:47-62` (each 401 does its own `POST /auth/refresh`), `:64` (`await response.json()` unguarded); aborted requests would also be logged at `error` level by `:77-79` |
| V14 | Auth-guarded loaders show the error page instead of redirecting | confirmed | `SettingsPage.tsx:39-42` and `CollectionListPage.tsx:22-32`/`CollectionEditPage.tsx:30-38` rethrow 401; `ErrorBoundary.tsx:28-33` maps only 404/5xx, so a 401 renders "Oops!" + raw API message. Starred/BrewLogs/Notifications redirect to `/login` with no return path; `BrewLogFormPage.tsx:49-55` redirects a 401 to `/brew-logs` |
| V15 | No return-to after login; back-button trap | confirmed | `RequireAuth.tsx:21` `<Navigate to="/login" />` (no `replace`, no origin); `LoginPage.tsx:39` and `RegisterPage.tsx:71` always `navigate('/')` |
| V16 | Comment actions rethrow, so the rollback branch is dead code | confirmed | `routes/comments.ts:69-72`, `:92-95` rethrow; `CommentSection.tsx:131-150` only rolls back on `'error' in deleteFetcher.data`; compare `routes/like.ts:24-33` which returns `{ ok:false }`. A thrown fetcher-action error bubbles to the `recipes/:slug` `errorElement` (`router.tsx:131-136`) |
| V17 | Every social fetcher action re-runs the whole detail loader and collapses loaded comment pages | confirmed | no `shouldRevalidate` anywhere in `apps/web/src`; `RecipeDetailPage.tsx` loader issues recipe + comments + collections GETs (plus cached taste notes); `CommentSection.tsx:124-129` resets `comments`/`page` whenever `initialComments` changes |
| V18 | Static cache: cross-tab ping-pong + no in-flight dedup | confirmed | `hooks/useStaticCacheSync.ts:20-27` calls `invalidateStaticCache()` on receipt, which re-writes the marker (`api/static-cache.ts:40-47`) and fires `storage` in the other tab again; `static-cache.ts:18-21`/`28-31` memoise the result, not the promise. NOTE: the existing `static-cache` spec ("Cache invalidation propagates across browser tabs") literally requires the listener to call `invalidateStaticCache()` — see section 7 |
| V19 | Other list pages keep navigation selections out of the URL | confirmed | `AdminUsersPage.tsx:27-33` (search + page in `useState`), `AdminAuditLogPage.tsx:28-29`, `AdminCoffeeVarietiesPage.tsx:135-137`, `TasteNotesPage.tsx:206` (search); `CollectionsBrowsePage`/`CollectionListPage` loaders take no `page` and render only the first API page; profile collections tab renders only the first page (`UserProfilePage.tsx:245-253`) |

Nothing in this track's scope was found to be wrong. Two refinements: the fetch-in-effect
count is 42 blocks/39 files rather than "about 30", and the confirm fallback is a second,
quieter admin bug (raw key in a native dialog) on `/admin/equipment` and `/admin/taste-notes`.

---

## 2. Plain explanation: the admin "toast provider" crash

- **What a provider is.** In React, a *context provider* is a wrapper component that holds a
  shared object and makes it available to every component rendered *inside* it. BrewForm's
  `ToastProvider` holds the queue of pop-up messages ("Saved", "Delete failed"); any page can
  call `useToast()` to get `toast.success(...)` / `toast.error(...)`. If there is no provider
  above the page, `useToast()` deliberately throws `useToast must be used within ToastProvider`.
- **Why `/admin` is outside it.** The two providers are mounted inside `Layout` — the shell with
  the navbar and footer used by every route under `/`. The admin area is a *separate* top-level
  route (`/admin`, a sibling of `/`) with its own `AdminLayout` shell, so nothing above the admin
  pages ever mounts the providers. The providers were moved into `Layout` in wave 5 (commit
  `0c1ab8a`) and the admin tree was missed.
- **What the user sees.** Opening any of the five pages below throws during render; React
  Router catches it and replaces the whole admin screen (sidebar included) with the full-page
  error screen: "Oops! useToast must be used within ToastProvider" plus Go Home / Reload buttons.
  - `/admin/recipes` (`AdminRecipesPage`)
  - `/admin/vendors` (`AdminVendorsPage`)
  - `/admin/users/:id` (`AdminUserDetailPage`)
  - `/admin/compatibility` (`AdminCompatibilityPage`)
  - `/admin/coffee-varieties` (`AdminCoffeeVarietiesPage`)
- **Related, quieter bug.** `/admin/equipment` and `/admin/taste-notes` do not crash, but their
  delete confirmation falls back to the browser's native `confirm()` and shows the raw
  translation key (`admin.equipment.deleteConfirm`) instead of a translated sentence.
- **Why tests missed it.** Each admin page test wraps the page in `ToastProvider` itself, and the
  router test only checks the route config exists — nothing renders `/admin/*` the way the real
  app does.
- **Fix.** Mount both providers once at the application root (above `RouterProvider`) so every
  route tree, including `/admin`, is inside them; remove them from `Layout`; make `useConfirm()`
  fail loudly like `useToast()` instead of silently showing a raw key; and add a router smoke test
  that renders every route through `createMemoryRouter` with the real provider stack and no
  per-test wrappers, so a missing provider fails CI.

---

## 3. React Router loaders/actions vs `useEffect` fetching

| Concern | react-router loaders / actions / fetchers | `useEffect` + `useState` fetching |
|---|---|---|
| When the request starts | Before render, as soon as the navigation starts; runs in parallel with lazy route code | After the component has rendered and committed; nested components fetch one after another (waterfalls) |
| Cancellation | Automatic: the router aborts `request.signal` when a navigation is interrupted or superseded | Manual `AbortController` per effect; **0 of 42** current sites abort |
| Out-of-order responses | Router discards stale navigation/fetcher results; a fetcher's new `load()` cancels its previous one | Manual "ignore" flag per effect; only 4 of 42 sites have one (detail pages can show the previous `:id`'s data) |
| Loading / pending UI | `useNavigation().state`, `fetcher.state` built in | Hand-rolled `loading` state on every page |
| Errors | `errorElement` boundaries; loaders `throw data(null, { status: 404 })` | Hand-rolled; many pages render failures as "No results" |
| After a mutation | Loaders on the page revalidate automatically after an action; opt out per route with `shouldRevalidate` | Manual refetch/`setState`, easy to forget or to get wrong |
| URL-driven state (filters, page, tab) | Loader receives `request.url`, so the URL is naturally the input | Must mirror search params into state and back |
| Auth redirects | `throw redirect('/login?next=…')` before anything renders (no flash) | Render first, then `<Navigate>` (flash, back-button trap) |
| Component-level data (typeahead, badge counts) | `useFetcher().load('/resources/…')` against a resource-route loader, with the same cancellation | Simple, but racy |
| Testing | Loaders/actions are plain async functions (unit-test without rendering); `createMemoryRouter` for integration | Must render and mock around the component |
| Code-splitting | Granular `lazy: { loader, Component }` loads data and code in parallel | Data waits for the chunk, then for render |
| Cost / learning curve | Route config wiring and a separate data module per page; must think about revalidation | Familiar, fully co-located |
| Caching / dedup across navigations | None built in (re-runs on navigation); acceptable here, plus small single-flight caches for static lookups | None |
| New dependency | None — `react-router@8.5.1` is already the router | None |

**Recommendation: standardise the whole web app on React Router data APIs; no mixing.**

- Route data: a `loader` per route, reading params/search params from `request`, passing
  `request.signal` to the API client.
- Mutations: route `action`s submitted with `<Form>` / `useFetcher().submit()`, returning
  `{ ok: true, … } | { ok: false, error }` for expected failures.
- Component-level data that is not tied to a page (typeaheads, the unread badge, the
  add-to-collection list, recipe brew stats): resource-route loaders under `/resources/*`, read
  with `useFetcher().load()`.
- No new dependency.

**Why not TanStack Query.** D10 (`plans/D10-tanstack-query-migration.md:5-9`) already evaluated
it and chose loaders. Adding it now would (a) create a *second* paradigm next to the loaders we
keep, or require loaders to call `queryClient.ensureQueryData`, i.e. two libraries doing one job;
(b) add a dependency and a second cache that must be invalidated alongside router revalidation;
(c) buy features this app does not need: background refetch, stale-while-revalidate, a shared
cache across many components. Cancellation, race handling, pending/error states and
revalidation-after-mutation, which are the actual audit problems, are already provided by the
router. If cross-navigation caching is ever needed, TanStack Query can be layered *inside*
loaders later without changing component APIs.

**When `useEffect` is still fine.** Only for non-fetch side effects: subscribing to browser
events (`storage`, `focus`, media queries), DOM focus management, timers, mount/unmount debug
logging, document-head sync (`SEOHead`), and *triggering* router primitives
(`fetcher.load(...)`, `revalidator.revalidate()`) in response to an external event. It must never
call the API client or `fetch`, or store network results in state. The single allowlisted
exception is the session store `contexts/AuthContext.tsx` (it lives above the router and
bootstraps the session with `userApi.me()`).

---

## 4. Inventory: every `useEffect` fetch site to migrate

Method: a block-level scan of every non-test `.ts/.tsx` file in `apps/web/src` for
`useEffect(...)` bodies that call `api.*`, `*Api.*`, `fetch(` or the static-cache getters,
directly or through a local function they invoke. 42 blocks in 39 files.
"Guard" = has a cancel/stale guard today. Targets name the route/resource that will own the read.

### 4.1 Admin pages (`apps/web/src/pages/admin/`)

| File:line | Loads today | Guard | Target |
|---|---|---|---|
| `AdminDashboard.tsx:33` | `GET /admin/stats` | no | `/admin` index loader (`AdminDashboard.data.ts`, `requireAdmin`) |
| `AdminUsersPage.tsx:79` (`fetchUsers`) | `adminApi.getUsers({ page, q })` | no | `/admin/users` loader reading `?page&q` (URL state); `toggleAdmin`, ban/unban via the route action |
| `AdminUserDetailPage.tsx:50` | `adminApi.getUserDetail(id)` | no | `/admin/users/:id` loader (404 → `data(null,{status:404})`); delete via action |
| `AdminUserEditPage.tsx:46` | `adminApi.getUserDetail(id)` | no | `/admin/users/:id/edit` loader + action (`updateUser`) |
| `AdminRecipesPage.tsx:37` | `GET /admin/recipes?perPage=50` | no | `/admin/recipes` loader reading `?page` (pagination itself owned by the catalog/pagination track) + action (patch/delete) |
| `AdminEquipmentPage.tsx:32` | `GET /admin/equipment` | no | `/admin/equipment` loader + action (create/update/delete; calls `invalidateStaticCache()`) |
| `AdminVendorsPage.tsx:33` | `GET /admin/vendors` | no | `/admin/vendors` loader + action |
| `AdminTasteNotesPage.tsx:31` | `GET /taste-notes/flat` (bypasses static cache) | no | `/admin/taste-notes` loader via `getTasteNotesCached({ signal })` + action |
| `AdminCoffeeVarietiesPage.tsx:173` (`fetchData`) | `GET /admin/coffee-varieties?page&category&search` (per keystroke) | no | `/admin/coffee-varieties` loader reading `?page&category&q` + action |
| `AdminCompatibilityPage.tsx:33` | `GET /admin/compatibility` | no | `/admin/compatibility` loader + action |
| `AdminBadgesPage.tsx:22` | `GET /badges` | no | `/admin/badges` loader |
| `AdminAuditLogPage.tsx:38` | `GET /admin/audit-log?page&entityType` | no | `/admin/audit-log` loader reading `?page&entityType` |

Mutation-only admin pages (no effect fetch, but direct client calls to move into actions):
`AdminCachePage.tsx` (`POST` flush), `AdminUserCreatePage.tsx` (`adminApi.createUser`),
`hooks/useBanUser.ts` (`adminApi.banUser/unbanUser`).

### 4.2 Settings, account and auth

| File:line | Loads today | Guard | Target |
|---|---|---|---|
| `components/onboarding/OnboardingWizard.tsx:106` | `GET /setups` (equipment step) | no | `/onboarding` loader (`requireAuth`); `PATCH /preferences` + bean `POST` via the route action |
| `pages/auth/RegisterPage.tsx:39` | `authApi.registrationStatus()` | no | root route loader (`id: 'root'`, `shouldRevalidate: () => false`) read with `useRouteLoaderData('root')` |
| `components/layout/Navbar.tsx:195` | `authApi.registrationStatus()` when logged out | no | same root loader (dedups the two calls) |
| `pages/auth/VerifyEmailPage.tsx:29` | `authApi.verifyEmail(token)` (a mutation on mount; runs twice under StrictMode in dev) | no | `/verify-email` loader (token from `?token`, `shouldRevalidate: () => false`); component effect only calls `refreshUser()` on success |
| `contexts/AuthContext.tsx:85` (`refreshUser`) | `userApi.me()` session bootstrap | no | **allowlisted exception** (session store above the router); gains an `AbortController` on unmount |

Mutation-only: `SettingsPage.tsx` (`PATCH /preferences`, raw `api.delete('/users/me')` → use
`userApi.deleteAccount`), `ContactPage.tsx`, `ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx`,
`components/EmailVerificationBanner.tsx` (`sendVerification`) → route/resource actions.

### 4.3 Catalogs and personal lists

| File:line | Loads today | Guard | Target |
|---|---|---|---|
| `pages/equipment/EquipmentCatalogPage.tsx:56` | `GET /equipment?page&type&search` | no | `/equipments` granular-lazy loader reading `?page&type&q` |
| `pages/equipment/EquipmentDetailPage.tsx:31` | `GET /equipment/:id` + `/equipment/:id/recipes?perPage=6` | no | `/equipment/:id` loader (404) |
| `pages/coffee-varieties/CoffeeVarietiesPage.tsx:52` | `GET /coffee-varieties?page&category&search` | no | `/coffee-varieties` loader reading `?page&category&q` |
| `pages/coffee-varieties/CoffeeVarietyDetailPage.tsx:37` | `GET /coffee-varieties/:id` + recipes | no | `/coffee-varieties/:id` loader (404) |
| `pages/TasteNotesPage.tsx:217` | `tasteApi.hierarchy()` | no | `/taste-notes` loader; client-side search moves to `?q=` |
| `pages/beans/BeanListPage.tsx:41` | `beanApi.list()` | no | `/beans` loader (`requireAuth`) + action |
| `pages/setups/SetupListPage.tsx:37` | `setupApi.list()` | no | `/setups` loader (`requireAuth`) + action |
| `pages/equipment/EquipmentListPage.tsx:38` | `equipmentApi.list()` | no | `/equipment` loader (`requireAuth`) + action (`invalidateStaticCache()`); errors now toast instead of log-only (`:72-74`, `:98-100`) |

### 4.4 Recipes

| File:line | Loads today | Guard | Target |
|---|---|---|---|
| `pages/recipes/RecipeEditPage.tsx:68` | `recipeApi.get(id)` | no | `/recipes/:id/edit` granular-lazy loader (`requireAuth`) + action (`recipeApi.update`) |
| `pages/recipes/RecipeForkPage.tsx:33` | `recipeApi.get(id)` | no | `/recipes/:id/fork` loader + action (`recipeApi.fork`) |
| `pages/recipes/RecipeCreatePage.tsx:74` | `equipmentApi.list()` + `setupApi.list()` | no | `/recipes/new` loader (`requireAuth`) + action (`recipeApi.create`) |
| `pages/recipes/RecipeCreatePage.tsx:~94` | `beanApi.get(beanId)` from `?beanId` | no | same loader reads `?beanId` |
| `pages/recipes/RecipeComparePage.tsx:52` | `recipeApi.get(slug1)`, `get(slug2)` | no | `/recipes/compare/:slug1/:slug2` loader + action (`recipeApi.merge`) |
| `pages/recipes/RecipeFocusModePage.tsx:36` | `tasteApi.flat()` (bypasses cache) | no | `/recipes/:slug/focus` loader via `getTasteNotesCached` |
| `pages/recipes/RecipeFocusModePage.tsx:47` | `recipeApi.get(slug)` (old recipe stays visible on slug change) | no | same loader |
| `pages/recipes/RecipeVersionsPage.tsx:48` | `GET /recipes/:slug/versions` (failure renders "no results") | no | `/recipes/:slug/versions` loader |
| `pages/recipes/VersionDiffPage.tsx:108` | `recipeApi.diffVersions(slug, v1, v2)` | no | `/recipes/:slug/versions/diff` loader reading `?v1&v2` |
| `pages/recipes/useCoffeeVarietyFilter.tsx:40` | `coffeeVarietyApi.search(debounced)` typeahead | yes | `useFetcher().load('/resources/coffee-varieties/search?q=')` |
| `pages/recipes/useCoffeeVarietyFilter.tsx:76` | `GET /coffee-varieties/:id` (selected name) | no | `/recipes` loader resolves the selected variety name when `?coffeeVarietyId` is set |

### 4.5 Collections

| File:line | Loads today | Guard | Target |
|---|---|---|---|
| `components/collections/AddToCollectionModal.tsx:34` | `collectionApi.list({ recipeId })` on open | no | `useFetcher().load('/resources/collections/mine?recipeId=')`; add/remove/create via `fetcher.submit` to the resource action (409-on-add keeps membership, per `errors-rendered-as-empty`) |

Mutation-only: `CollectionRecipeList.tsx` (reorder/remove), `CollectionCreatePage.tsx`,
`CollectionEditPage.tsx` → actions. `CollectionListPage`/`CollectionsBrowsePage` already have
loaders but ignore `?page` (see section 5).

### 4.6 Notifications

| File:line | Loads today | Guard | Target |
|---|---|---|---|
| `components/layout/NotificationBell.tsx:37` (`fetchCount`) | `notificationApi.unreadCount()` on mount, window focus, change event | no | `useFetcher().load('/resources/notifications/unread-count')`; the effect only subscribes to `focus`/`brewform:notifications-changed` and calls `fetcher.load` |
| `components/layout/NotificationDropdown.tsx:32` | `notificationApi.list(1)` on open | yes | `useFetcher().load('/resources/notifications?page=1')`; `markAllRead` via `fetcher.submit` |

Mutation-only: `NotificationItem.tsx` (`markRead`), `NotificationListPage.tsx` (`markAllRead`).

### 4.7 Shared components (recipe detail and elsewhere)

| File:line | Loads today | Guard | Target |
|---|---|---|---|
| `components/brew-log/BrewHistorySection.tsx:25` | `brewLogApi.listForRecipe(recipeId)` | yes | `useFetcher().load('/resources/brew-logs/recipe/:recipeId')` |
| `components/brew-log/RecipeBrewStats.tsx:20` | `brewLogApi.getRecipeStats(recipeId)` | yes | `useFetcher().load('/resources/brew-logs/stats/:recipeId')` |
| `components/taste/TasteAutocomplete.tsx:41` | `GET /taste-notes/flat` (bypasses cache) | no | `useFetcher().load('/resources/taste-notes')` backed by `getTasteNotesCached` |

Mutation-only: `components/recipe/RecipeNotesSection.tsx` (`saveNotes`),
`components/photos/PhotoUpload.tsx` (`api.upload`, multipart) → resource actions via
`fetcher.submit` (`encType: 'multipart/form-data'` for photos).

### 4.8 Already on loaders (only need `request.signal`, typed `useLoaderData`, auth wrapper)

`HomePage`, `RecipeListPage`, `StarredRecipesPage`, `RecipeDetailPage`, `CollectionListPage`,
`CollectionsBrowsePage`, `CollectionDetailPage`, `CollectionEditPage`, `BrewLogListPage`,
`BrewLogFormPage`, `UserProfilePage`, `SettingsPage`, `NotificationListPage`,
`routes/comments.ts` (`listCommentsLoader`), and the actions in `routes/{like,favourite,rate,follow,comments}.ts`.

---

## 5. Inventory: navigation selections per list page

| Route | Selections | Where they live today | Problems | Target |
|---|---|---|---|---|
| `/recipes` | page, sortBy, brewMethod, drinkType, visibility, search, equipmentId, mainBrewer, tasteNoteIds, coffeeVarietyId, author, dateFrom, dateTo, minRating, maxRating | URL | page reset bug (V7); search/author push per keystroke (V10) | fix + debounce/replace |
| `/recipes/starred` | same as above minus coffee variety | URL | same | same |
| `/equipments` | page, type, search | URL | search pushes per keystroke; data fetched in effect | loader + debounce/replace; param `q` |
| `/coffee-varieties` | page, category, search | URL | same | same |
| `/notifications` | page, unreadOnly | URL | filter writes `page=1` instead of omitting it | canonicalise |
| `/brew-logs` | page | URL | ok | adopt shared helper |
| `/u/:username` | tab, brewsPage | URL | collections tab renders first page only; followers/following unpaginated | add `collectionsPage`; keep tab-scoped params |
| `/collections/browse` | page | **none** | loader ignores `?page`; only first API page reachable | URL `page` + `PaginationControls` |
| `/collections` (mine) | page | **none** | same | same |
| `/taste-notes` | search | `useState` | not shareable | `?q=` (replace while typing) |
| `/admin/users` | page, q | `useState` | not shareable; reload resets | URL |
| `/admin/audit-log` | page, entityType | `useState` | same | URL |
| `/admin/coffee-varieties` | page, category, search | `useState` | same + per-keystroke fetch | URL + debounce |
| `/admin/recipes`, `/admin/equipment` | (page once paginated) | none | capped at 50 / unpaginated (owned by the pagination track) | URL `page` when added |
| comments "Load more" on `/recipes/:slug` | accumulated pages | component state | not a navigation selection | out of scope (stays local; must survive revalidation) |
| version selection on `/recipes/:slug/versions` | selected ids | component state | transient selection; the diff page already reads `?v1&v2` | out of scope |

---

## 6. React Router v8 facts used (Context7, `/remix-run/react-router`, `/websites/reactrouter`)

- Interrupted navigations and fetcher self-interruptions cancel in-flight requests; stale
  revalidations are discarded (docs: explanation/race-conditions).
- `request.signal` is the abort signal handed to loaders/actions; passing it to `fetch`
  preserves cancellation (docs: how-to/custom-fetch).
- `shouldRevalidate({ formAction, formMethod, actionResult, defaultShouldRevalidate, currentUrl, nextUrl })`
  controls only that route's loader; `fetcher.submit(..., { defaultShouldRevalidate: false })`
  skips revalidation for one submission (docs: how-to/optimize-revalidation, route-object).
- Data-mode `lazy` accepts an object (`lazy: { loader, action, Component }`) so loader and
  component chunks load in parallel (docs: start/data/custom).
- v8.0.0 removed `future.v8_middleware`; middleware is always enabled (changelog). Considered for
  auth guarding but not chosen (see design D8).

---

## 7. Cross-track hand-offs (not in t5's owned specs)

1. **`static-cache` spec conflicts with the loop fix.** Its requirement "Cache invalidation
   propagates across browser tabs" says the `storage` listener SHALL call
   `invalidateStaticCache()`, which is exactly the ping-pong. Proposed MODIFIED text for whoever
   owns `specs/static-cache/spec.md` (or for the orchestrator to add): split into
   `clearStaticCache()` (local, no broadcast — used by the listener) and
   `invalidateStaticCache()` (local clear + broadcast — used by mutation actions); add a scenario
   "WHEN Tab B receives the bust event THEN Tab B clears its slots AND does not write the marker".
   t5's `web-data-loading` spec only adds the single-flight (in-flight promise) behaviour, which
   does not conflict.
2. **`optimistic-rollback`** covers like/favourite/follow only. t5 adds the general rule (all
   actions, including comments) in `web-data-loading` as an ADDED requirement; no edit to
   `optimistic-rollback` is needed.
3. **Pagination of admin recipes/equipment and the equipment first-page cap** belong to the
   catalog/pagination track. t5 requires only that, once paginated, the page lives in the URL.
4. **Top-level error boundary above the providers / safe storage** (`provider-boot-robustness`)
   is not in t5's scope; the new `AppProviders` component is the natural place to add it.
