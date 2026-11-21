### Web providers, shareable URL state & data-loading standard (t5-web-state)

**Context**

- *Admin crash.* `apps/web/src/router.tsx:69-73` mounts `Layout` for `/`; `/admin`
  (`router.tsx:351-363`) is a separate top-level route rendering `AdminLayout`. `ToastProvider` and
  `ConfirmProvider` exist only in `components/layout/Layout.tsx:23-24`; `App.tsx:17-27` stacks only
  Theme/I18n/Auth. `useToast()` throws outside a provider (`components/ui/Toast.tsx:99-102`), so
  `AdminRecipesPage.tsx:26`, `AdminVendorsPage.tsx:18`, `AdminUserDetailPage.tsx:25`,
  `AdminCompatibilityPage.tsx:21` and `AdminCoffeeVarietiesPage.tsx:124` crash to the full-page
  `RootErrorBoundary`. `useConfirm()` silently falls back to `window.confirm(opts.bodyKey)`
  (`Modal.tsx:161-167`), showing raw keys on `/admin/equipment` and `/admin/taste-notes`. Page tests
  wrap themselves in the providers and `router.test.tsx:63-68` never renders `/admin`. Validated:
  confirmed.
- *Pagination.* `components/recipe-list/useRecipeFilters.ts:91` deletes `page` for every key,
  including `page` itself (`RecipeListView.tsx:431`), and `useRecipeFilters.test.tsx:148-157`
  asserts that behaviour. The loader already reads `page` correctly (`RecipeListPage.tsx:31-40`,
  `utils/recipe-filters.ts:28-64`). Search/author inputs push a history entry and run the loader per
  keystroke (`RecipeListView.tsx:275,362`); the catalog pages push per keystroke too
  (`EquipmentCatalogPage.tsx:125`, `CoffeeVarietiesPage.tsx:116`). Selections on `/taste-notes`,
  `/admin/users`, `/admin/audit-log`, `/admin/coffee-varieties` live in `useState`;
  `/collections` and `/collections/browse` cannot page at all. Validated: confirmed.
- *Split data layer.* 13 page loaders + 1 resource loader + 5 resource actions coexist with
  **42 `useEffect` fetch blocks in 39 files**, of which only 4 have a stale/cancel guard and none
  aborts (full inventory: `audit/t5-web-state.md` section 4). About 35 files mutate by calling the
  client directly from event handlers. The client (`api/client.ts:124-140`) takes no
  signal, refreshes per 401 (`:47-62`) and parses bodies unguarded (`:64`). Guarded loaders rethrow
  401 into "Oops!" (`SettingsPage.tsx:39-42`, `CollectionListPage.tsx:22-32`); `RequireAuth.tsx:21`
  navigates without `replace` or a return path; `LoginPage.tsx:39` always goes to `/`. Comment
  actions rethrow (`routes/comments.ts:69-72,92-95`), which replaces the recipe page and makes the
  rollback branch (`CommentSection.tsx:131-150`) dead; with no `shouldRevalidate` anywhere, every
  like re-runs the 3-request detail loader and collapses loaded comment pages
  (`CommentSection.tsx:124-129`). The static cache memoises results, not promises
  (`api/static-cache.ts:18-31`). Validated: confirmed; the effect count is higher than the audit's
  "about 30".

**Decisions**

- *D1 — Providers live once at the root, in a shared `AppProviders` component.* Choice: create
  `apps/web/src/AppProviders.tsx` (`ThemeProvider` → `I18nProvider` → `ToastProvider` →
  `ConfirmProvider` → `AuthProvider`), render it in `App.tsx` around `RouterProvider`, delete the
  providers from `Layout.tsx`. Alternatives: wrap `AdminLayout`'s `<Outlet>` as well (two toast
  queues and two confirm dialogs, and the next new top-level route repeats the bug); a pathless root
  route element holding the providers (works, but couples the providers to the route tree and the
  error boundary then sits above them). Rationale: one mount point covers every present and future
  route tree; `ToastProvider` needs only `I18nProvider`, and `Modal` has no router dependency
  (`Modal.tsx:1-10`), so both can sit above the router. Tests import the same `AppProviders`.
- *D2 — `useConfirm()` throws outside a provider.* Choice: replace the `window.confirm` fallback with
  a throw, mirroring `useToast()`. Alternative: keep the fallback but translate the key (still masks a
  missing provider). Rationale: fail-fast is what the smoke test relies on; affected tests (one uses
  the fallback, `SettingsPage.test.tsx`) move to `renderWithAppProviders`.
- *D3 — `router.tsx` exports `routes` + `createAppRouter()`.* Choice: stop calling
  `createBrowserRouter` at module scope; `App.tsx` creates it once. Rationale: `createBrowserRouter`
  initialises and starts loaders on import, which makes the tree untestable through
  `createMemoryRouter`. The smoke test derives its path list from `routes`, so new routes are covered
  without extra test code.
- *D4 — Standardise on React Router data APIs; no TanStack Query.* Choice: loaders for route reads,
  actions (via `<Form>`/`useFetcher().submit`) for writes, `useFetcher().load()` against
  `resources/*` loaders for component-level reads. Alternatives: (a) TanStack Query everywhere —
  new dependency, a second cache to invalidate next to router revalidation, and either a second
  paradigm beside loaders or loaders wrapping `ensureQueryData`; D10 already rejected it; (b) a
  homemade `useApiQuery` hook with `AbortController` — fixes races but keeps two paradigms, loses
  router pending/error/revalidation integration and is more code we own. Rationale: the router
  already gives cancellation (`request.signal`), stale-response discarding, pending state, error
  boundaries and revalidation after mutations; it is already a dependency (`react-router@8.5.1`).
  `useEffect` is kept only for non-fetch side effects and for triggering `fetcher.load()` /
  `revalidator.revalidate()` on external events. Sole exception: `contexts/AuthContext.tsx`
  (session store above the router).
- *D5 — Loaders/actions live in co-located `<Page>.data.ts` modules; lazy routes use the object
  form.* Choice: `pages/x/XPage.data.ts` exports `loader`/`action`; routes use
  `lazy: { loader, action, Component }`. Alternatives: keep loaders inside page `.tsx` files (cannot
  be lint-separated from UI code; loader waits for the component chunk); a central `routes/` folder
  for everything (far from the page it serves). Rationale: enables the import-boundary lint rule
  (D13) and parallel loading of data and code.
- *D6 — Component-level reads use `resources/*` resource routes.* Choice: new loaders under the
  `resources/` path prefix in `apps/web/src/routes/resources/*.ts` (unread count, notification
  dropdown page, my collections for a recipe, coffee-variety search, taste-note list, brew history,
  brew stats). Existing action routes keep their paths to avoid churn. Rationale: a fetcher's new
  `load()` cancels its previous one, which is exactly the typeahead/race behaviour needed; the prefix
  prevents collisions with page paths.
- *D7 — Actions return result objects; intent-based multi-mutation actions.* Choice: every action
  returns `{ ok: true, ... } | { ok: false, error }` for expected failures (generalising
  `routes/like.ts`); pages with several mutations use one route action keyed by an `intent` form
  field (`create`/`update`/`delete`). Components toast on `ok:false`. Alternative: throw and rely on
  error boundaries (current comments behaviour — destroys the page for a recoverable failure).
- *D8 — Auth guarding via loader wrappers, not middleware.* Choice: `requireAuth(fn)` and
  `requireAdmin(fn)` in `apps/web/src/routes/auth-guards.ts` wrap loaders/actions and map a final 401
  to `redirect('/login?next=…')` (403 → `/` for admin). Alternatives: v8 route `middleware` (always
  enabled since v8.0.0) — would need a router-reachable session store because `AuthProvider` lives
  above the router and loaders start before it resolves, and middleware only runs when a loader
  runs; `RequireAuth` alone — renders, then redirects (flash + back-button trap) and cannot stop
  loaders from erroring. Rationale: the client's refresh-and-retry already authenticates loader
  requests from cookies, so "the API said 401 after refresh" is the reliable signal. `RequireAuth`
  stays as the render guard for routes whose loaders hit only public endpoints, now with `replace`
  and `next`.
- *D9 — Return-path parameter is `next`, validated by `isSafeNextPath`.* Accept only paths starting
  with a single `/` (not `//`, not `/\`, no scheme); otherwise `/`. Login/Register navigate with
  `replace`. Rationale: matches the audit wording and prevents open redirects.
- *D10 — One URL-state hook.* Choice: `hooks/useListUrlState.ts` exposes parsed values from a
  per-page parser (shared with the loader), `setFilter(key, value)` (deletes `page`), `setPage(n)`
  (keeps everything; deletes `page` when 1), `clearAll()`, and `useDebouncedUrlText(key)` (local
  input state, 300 ms debounce via the existing `useDebounce`, commits with
  `{ replace: true, preventScrollReset: true }`, re-syncs on external URL change). Discrete controls
  push history. Defaults are omitted from written URLs. `useRecipeFilters` keeps its public API
  (plus `setPage`) and delegates to the hook. Alternatives: `nuqs` or another URL-state library
  (new dependency; the user prefers built-ins); per-page ad-hoc code (what produced the bug).
- *D11 — Revalidation policy.* Choice: social toggles submit with `defaultShouldRevalidate: false`;
  `recipes/:slug` declares `shouldRevalidate` returning `false` for successful
  like/favourite/follow/comment actions and `defaultShouldRevalidate` otherwise (rate keeps
  revalidating to refresh the average); `CommentSection` merges revalidated page-1 data into
  already-loaded pages rather than resetting; the root loader (registration status) never
  revalidates. Rationale: one request per like instead of four; loaded pages survive.
- *D12 — API client.* Choice: every verb helper and domain method takes an optional
  `RequestOptions = { signal?: AbortSignal }`; module-level `refreshPromise` shared by concurrent
  401s (not bound to any caller's signal; cleared on settle); bodies parsed via `response.text()` +
  guarded `JSON.parse`, mapping failures to `ApiError('INVALID_RESPONSE', …, status)`; `AbortError`
  rethrown untouched and logged at `debug`. `ApiError` moves to `api/errors.ts` (re-exported by
  `api/index.ts`).
- *D13 — Guards: Biome import boundary + Vitest architecture test.* Choice: a Biome override with
  `style/noRestrictedImports` `patterns` (`**/api/client.ts`, `**/api/index.ts`,
  `**/api/static-cache.ts`) for `apps/web/src/**`, with overrides re-allowing `api/**`, `routes/**`,
  `**/*.data.ts`, `contexts/AuthContext.tsx` and tests; plus `apps/web/src/architecture.test.ts`
  scanning `useEffect` bodies for `api.`/`*Api.`/`fetch(`/`get*Cached(` with an allowlist of
  `contexts/AuthContext.tsx`. Alternatives: lint only (misses global `fetch` and code that receives
  the client indirectly); test only (slower feedback, no editor squiggle). The Biome rule lands
  in "warn" while migration is in progress and flips to "error" in the last task.
- *D14 — Static cache single-flight.* Choice: memoise the in-flight promise per lookup, drop it on
  rejection, accept `{ signal }` only for the caller's wait (the shared request is not aborted by
  one caller). Route all taste-note/equipment lookups through it. The cross-tab re-broadcast fix
  needs a MODIFIED `static-cache` requirement owned outside t5 (see `audit/t5-web-state.md`
  section 7).

**Risks / Trade-offs**

- [Large migration touching ~40 files risks regressions] → Phase it (providers + pagination hotfix
  first, then client/guards, then area-by-area migration), keep each area in its own commit with its
  tests, and keep the Biome rule at "warn" until the final area lands.
- [Loaders run before `AuthProvider` resolves, so guarded loaders may fire for signed-out users] →
  `requireAuth` turns the resulting 401 into a redirect; `RequireAuth` still covers public-data
  routes.
- [Throwing `useConfirm()` breaks tests that relied on the native fallback] → ship
  `test-utils/render.tsx` first and migrate the affected tests in the same task.
- [Replace-while-typing means Back skips a search refinement] → intended (user decision); discrete
  selections still push, and the committed search is preserved under later entries.
- [Revalidation opt-outs can leave stale counts] → only opt out for actions whose UI is
  optimistic and whose result object carries the new state; rate keeps revalidating; tests assert
  request counts.
- [Smoke test brittleness from network stubs] → stub at the `fetch` boundary with a single
  envelope factory; derive paths from `routes`; assert only "no error boundary + page landmark".
- [Biome `patterns` matching on relative specifiers] → verify the rule fires on
  `../../api/index.ts` in a fixture during the guard task; fall back to the Vitest test as the hard
  gate if a pattern cannot express an exception.

**Migration / Rollout**

- No database migration, no new environment variables, no new dependencies.
- URL compatibility: existing `/recipes` parameter names (`search`, `author`, …) are kept; new
  pages use `q`. Old links with `page=1` still work (canonicalised on next write).
- Order: (1) `AppProviders` + smoke test + `useRecipeFilters` fix (ships the two user-visible bugs);
  (2) API client + auth guards + `isSafeNextPath`; (3) `useListUrlState` and list-page adoption;
  (4) area migrations (admin, settings/auth, catalogs, recipes, collections, notifications,
  components); (5) revalidation policy + comments contract; (6) flip guards to error; docs/ADR.
- Rollback: each phase is an independent revert; phase 1 has no dependency on later phases.
