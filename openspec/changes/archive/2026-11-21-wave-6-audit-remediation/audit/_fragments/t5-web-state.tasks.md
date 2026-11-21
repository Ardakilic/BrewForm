### t5 — App-wide providers and router smoke test

- [ ] Write a failing router smoke test `apps/web/src/router.smoke.test.tsx` that renders `/admin/recipes`, `/admin/vendors`, `/admin/users/<uuid>`, `/admin/compatibility`, `/admin/coffee-varieties` through `createMemoryRouter` with the real providers and no per-test wrappers, asserting no `error.boundary.oops` text (fails today with "useToast must be used within ToastProvider")
- [ ] Refactor `apps/web/src/router.tsx` to export `routes: RouteObject[]` and `createAppRouter()` instead of a module-scope `createBrowserRouter`; update `apps/web/src/App.tsx` to create the router once and `apps/web/src/router.test.tsx` to read `routes`
- [ ] Create `apps/web/src/AppProviders.tsx` (`ThemeProvider` → `I18nProvider` → `ToastProvider` → `ConfirmProvider` → `AuthProvider`) and render it in `App.tsx` around `RouterProvider`; remove `ToastProvider`/`ConfirmProvider` and the stale JSDoc claim from `apps/web/src/components/layout/Layout.tsx`
- [ ] Make `useConfirm()` in `apps/web/src/components/ui/Modal.tsx` throw `useConfirm must be used within ConfirmProvider` (delete the `window.confirm(opts.bodyKey)` fallback); update `Modal.test.tsx`
- [ ] Add `apps/web/src/test-utils/render.tsx` (`renderWithAppProviders(ui | routes, { initialEntries, auth })` using `AppProviders` + `createMemoryRouter`) and migrate the self-wrapping tests: `AdminRecipesPage`, `AdminUserDetailPage`, `AdminCoffeeVarietiesPage`, `AdminVendorsPage`, `AdminCompatibilityPage`, `BeanListPage`, `SetupListPage`, `BrewLogFormPage`, `RecipeQRCode`, and `SettingsPage.test.tsx` (drop its `window.confirm` mock)
- [ ] Extend `router.smoke.test.tsx` to derive every path from `routes` (fixture values for `:slug`, `:id`, `:username`, `:slug1/:slug2`), stub `fetch` with an empty-success-envelope factory, render public routes signed-out and guarded/admin routes as an admin, and assert no error boundary; confirm it fails when `ToastProvider` is removed from `AppProviders.tsx`, then restore
- [ ] Add a mount/unmount debug log to `AppProviders` per `web-page-logging` conventions

### t5 — Recipe list pagination fix (regression first)

- [ ] Replace the bug-codifying test at `apps/web/src/components/recipe-list/useRecipeFilters.test.tsx:148-157` with failing tests: filter change clears `page`; `updateFilter('page','3')` and `setPage(3)` keep `page=3` plus filters; `setPage(1)` removes `page`
- [ ] Add a failing `RecipeListView.test.tsx` case that clicks Next on a 2-page result under `createMemoryRouter` and asserts the URL has `page=2` and the loader receives `page: '2'` with filters intact
- [ ] Fix `apps/web/src/components/recipe-list/useRecipeFilters.ts`: delete `page` only when `key !== 'page'`, add `setPage(n)`, parse `page` with `extractListParams` rules; wire `RecipeListView.tsx:431` to `setPage`; update the hook JSDoc

### t5 — API client: cancellation, single-flight refresh, defensive parsing

- [ ] Write failing tests in `apps/web/src/api/client.test.ts`: three parallel 401s trigger one `POST /auth/refresh` and each request retries once; an aborted signal rejects with `AbortError` and logs no `error`; a 502 HTML body throws `ApiError` with status 502
- [ ] Implement in `apps/web/src/api/client.ts`: `RequestOptions { signal? }` on every verb helper, module-level `refreshPromise` (cleared on settle, not bound to a caller's signal), `text()` + guarded `JSON.parse` mapping to `ApiError('INVALID_RESPONSE', …, status)`, `AbortError` rethrown and logged at `debug`
- [ ] Move `ApiError` (and an `isApiError` helper) to `apps/web/src/api/errors.ts`, re-export from `api/index.ts`; update component imports of `ApiError` to `api/errors.ts`
- [ ] Thread an optional trailing `opts?: RequestOptions` through every domain client method in `apps/web/src/api/index.ts` (auth, user, recipe, taste, setup, bean, equipment, coffeeVariety, admin, follow, comment, notification, collection, brewLog) and add typed methods for the raw `api.*` reads being migrated (admin stats/recipes/equipment/vendors/compatibility/audit-log/coffee-varieties, preferences, catalog equipment/varieties with pagination, recipe versions); extend `api/index.test.ts`
- [ ] Make `apps/web/src/api/static-cache.ts` single-flight (memoise the in-flight promise, drop it on rejection, accept `{ signal }` for the caller's wait only) with tests in `static-cache.test.ts` for shared request and retry-after-failure

### t5 — Auth guards and return path

- [ ] Write failing tests `apps/web/src/routes/auth-guards.test.ts` and `apps/web/src/utils/safe-next.test.ts`: 401 → `redirect('/login?next=<encoded path+search>')`, admin 403 → `redirect('/')`, other errors rethrown; `isSafeNextPath` accepts `/collections?page=2`, rejects `//evil.example`, `/\evil`, `https://x`
- [ ] Implement `requireAuth(fn)` / `requireAdmin(fn)` in `apps/web/src/routes/auth-guards.ts` and `isSafeNextPath` in `apps/web/src/utils/safe-next.ts` with debug logging of redirects (ids only)
- [ ] Update `apps/web/src/components/auth/RequireAuth.tsx` to `<Navigate to={`/login?next=…`} replace />` and `RequireAuth.test.tsx`; update `LoginPage.tsx` and `RegisterPage.tsx` to `navigate(safeNext ?? '/', { replace: true })` with tests
- [ ] Wrap existing guarded loaders with `requireAuth`: `SettingsPage`, `CollectionListPage`, `CollectionEditPage`, `StarredRecipesPage`, `BrewLogListPage`, `NotificationListPage`, `BrewLogFormPage` (401 now goes to login, 404 stays `/brew-logs`); add a loader test per page for the 401 redirect

### t5 — Shared URL-state hook and list-page adoption

- [ ] Create `apps/web/src/hooks/useListUrlState.ts` (`setFilter` resets page, `setPage` keeps filters and omits 1, `clearAll`, `useDebouncedUrlText(key, 300)` with `replace: true` + `preventScrollReset` and external re-sync, defaults omitted) plus parser helpers in `apps/web/src/utils/list-params.ts`; Vitest suite `useListUrlState.test.tsx` covering every `web-url-state` scenario
- [ ] Refactor `useRecipeFilters.ts` to delegate to `useListUrlState`; make the `/recipes` search and author inputs in `RecipeListView.tsx` use `useDebouncedUrlText`; test one loader call per typing pause and input re-sync on Back/Clear Filters/badge removal
- [ ] Migrate `/equipments` (`EquipmentCatalogPage`) and `/coffee-varieties` (`CoffeeVarietiesPage`) search to debounced replace with param `q` (accept legacy `search` on read) and canonical `page`
- [ ] Canonicalise `/notifications` (omit `page=1`/`unreadOnly=false`) and `/brew-logs` through the shared helpers
- [ ] Add URL pagination to `/collections` and `/collections/browse` (loaders read `?page`, render `PaginationControls`) and a `collectionsPage` param for the profile collections tab in `UserProfilePage`; tests per page
- [ ] Move `/taste-notes` search to `?q=` via `useDebouncedUrlText`
- [ ] Move `/admin/users` (`q`, `page`), `/admin/audit-log` (`entityType`, `page`) and `/admin/coffee-varieties` (`category`, `q`, `page`) selections into the URL (done together with their loader migration below)

### t5 — Data-loading migration: admin pages (inventory §4.1)

- [ ] Add `requireAdmin` loaders in co-located `*.data.ts` files and switch routes to `lazy: { loader, action, Component }` with an `errorElement` that renders inside `AdminLayout`: `AdminDashboard`, `AdminBadgesPage`, `AdminAuditLogPage` (URL `entityType`/`page`), and `AdminCompatibilityPage` (plus its patch/flush intent action)
- [ ] Migrate `AdminUsersPage` (URL `q`/`page`, `toggleAdmin` intent) and `AdminUserCreatePage` (create action) to loaders/actions
- [ ] Migrate `AdminUserDetailPage` and `AdminUserEditPage` to `/admin/users/:id` and `/admin/users/:id/edit` loaders (404 → not-found) + delete/update intent actions; move `hooks/useBanUser.ts` ban/unban onto `useFetcher().submit` to the user route action, keeping the `BanDialog` contract; update `useBanUser.test.ts`
- [ ] Migrate `AdminRecipesPage` and `AdminVendorsPage` to loaders + intent actions returning `{ ok, error }` with toasts on failure
- [ ] Migrate `AdminEquipmentPage` and `AdminTasteNotesPage` to loaders + intent actions that call `invalidateStaticCache()` on success; replace the log-only catches (`AdminEquipmentPage.tsx:77-79,103-105`, `AdminTasteNotesPage.tsx:63-64,89-90`) with toasts
- [ ] Migrate `AdminCoffeeVarietiesPage` (URL `category`/`q`/`page`, debounced search) and `AdminCachePage` (flush action) to loaders/actions
- [ ] Update each admin page test to drive loaders/actions through `renderWithAppProviders`, including one failure-path toast assertion per page

### t5 — Data-loading migration: settings, account and auth (inventory §4.2)

- [ ] Add a root route `id: 'root'` loader returning `{ registrationEnabled }` with `shouldRevalidate: () => false`; read it with `useRouteLoaderData('root')` in `Navbar.tsx` and `RegisterPage.tsx`, removing both effects
- [ ] Move `VerifyEmailPage` token verification into a `/verify-email` loader (`shouldRevalidate: () => false`); the component only calls `refreshUser()` on success; test that StrictMode no longer verifies twice
- [ ] Convert `SettingsPage` mutations to an intent action (`save-preferences`, `delete-account` via `userApi.deleteAccount`); convert `ContactPage`, `ForgotPasswordPage`, `ResetPasswordPage` submits to actions; move `EmailVerificationBanner` `sendVerification` to a `resources/auth/send-verification` action
- [ ] Give `/onboarding` a `requireAuth` loader (setups list) and an action for `PATCH /preferences` and the bean step in `OnboardingWizard.tsx`; add an `AbortController` to the allowlisted `AuthContext` bootstrap effect

### t5 — Data-loading migration: catalogs and personal lists (inventory §4.3)

- [ ] Loaders for `/equipments`, `/equipment/:id`, `/coffee-varieties`, `/coffee-varieties/:id` (404 → not-found page; drop the `Array.isArray(r?.data)` envelope guessing) using granular `lazy`; add loader tests including abort-signal forwarding
- [ ] Loader for `/taste-notes` (`tasteApi.hierarchy`); failures render the route error state instead of `taste.noResults`
- [ ] `requireAuth` loaders + intent actions for `/beans`, `/setups`, `/equipment` (personal); equipment actions call `invalidateStaticCache()`; replace log-only catches (`EquipmentListPage.tsx:72-74,98-100`) with toasts

### t5 — Data-loading migration: recipes (inventory §4.4)

- [ ] `/recipes/new` loader (equipment, setups, optional `?beanId` bean) + create action; `/recipes/:id/edit` and `/recipes/:id/fork` loaders + update/fork actions, all via granular `lazy` with `requireAuth`
- [ ] Loaders for `/recipes/compare/:slug1/:slug2` (+ merge action), `/recipes/:slug/focus` (via `getTasteNotesCached`), `/recipes/:slug/versions`, `/recipes/:slug/versions/diff` (`?v1&v2`); failures render error states, not `compare.notFound`/`common.noResults`
- [ ] Add `resources/coffee-varieties/search` loader and switch `useCoffeeVarietyFilter.tsx` to `useFetcher().load()`; resolve the selected variety name in the `/recipes` loader when `?coffeeVarietyId` is set
- [ ] Move `BrewLogFormPage` create/update from the submit handler into the `brew-logs/new` and `brew-logs/:id/edit` route action (toast on `{ ok:false }`); move its loader to `BrewLogFormPage.data.ts`
- [ ] Pass `request.signal` in the existing loaders: `HomePage`, `RecipeListPage`, `StarredRecipesPage`, `RecipeDetailPage`, `UserProfilePage`, `routes/comments.ts`; switch their components to `useLoaderData<typeof loader>()` and move loaders to `*.data.ts`

### t5 — Data-loading migration: collections (inventory §4.5)

- [ ] Add `resources/collections/mine` loader + add/remove/create action; rewrite `AddToCollectionModal.tsx` on `useFetcher()` with toasts on failure and keep membership on a 409 during add
- [ ] Move `CollectionRecipeList.tsx` reorder/remove and `CollectionCreatePage`/`CollectionEditPage` submits to route actions; serialise reorders by disabling while a reorder fetcher is pending; move collection loaders to `*.data.ts` with `request.signal`

### t5 — Data-loading migration: notifications (inventory §4.6)

- [ ] Add `resources/notifications/unread-count`, `resources/notifications` (page) loaders and `resources/notifications/:id/read`, `resources/notifications/read-all` actions
- [ ] Rewrite `NotificationBell.tsx` (effect subscribes to `focus`/`brewform:notifications-changed` and calls `fetcher.load`), `NotificationDropdown.tsx`, `NotificationItem.tsx`, and `NotificationListPage` mark-all-read on fetchers; update their tests

### t5 — Data-loading migration: shared components (inventory §4.7)

- [ ] Add `resources/brew-logs/recipe/:recipeId`, `resources/brew-logs/stats/:recipeId` and `resources/taste-notes` loaders; switch `BrewHistorySection.tsx`, `RecipeBrewStats.tsx`, `TasteAutocomplete.tsx` to `useFetcher().load()`
- [ ] Move `RecipeNotesSection.tsx` `saveNotes` and `PhotoUpload.tsx` upload (`encType: 'multipart/form-data'`) to resource actions returning `{ ok, error }`

### t5 — Comment contract and revalidation

- [ ] Write failing tests in `routes/comments.test.ts` and `CommentSection.test.tsx`: create/delete API failures return `{ ok:false, error }`, the page stays rendered, delete rolls back, typed text is preserved, an error toast shows
- [ ] Change `createCommentAction`/`deleteCommentAction` in `apps/web/src/routes/comments.ts` to return `{ ok:true, comment } | { ok:true } | { ok:false, error }`; branch on `ok` in `CommentSection.tsx` for submit and delete
- [ ] Add `shouldRevalidate` to the `recipes/:slug` route (skip on successful like/favourite/follow/comment actions; keep for rate) and `defaultShouldRevalidate: false` on social submits in `LikeButton`, `FavouriteButton`, `FollowButton`; make `CommentSection` merge revalidated data instead of resetting loaded pages; test that a like sends exactly one request and loaded comment pages survive

### t5 — Guards against new useEffect fetching

- [ ] Add `apps/web/src/architecture.test.ts` scanning non-test `apps/web/src/**/*.{ts,tsx}` for `useEffect` bodies that reference `api.`, `*Api.`, `fetch(` or `get*Cached(` (allowlist: `contexts/AuthContext.tsx`), reporting file:line; start it with the not-yet-migrated files in a temporary pending list that the migration tasks shrink to empty
- [ ] Add the Biome override in `biome.json` (`style/noRestrictedImports` `patterns` for `**/api/client.ts`, `**/api/index.ts`, `**/api/static-cache.ts` on `apps/web/src/**`, re-allowed for `apps/web/src/api/**`, `apps/web/src/routes/**`, `apps/web/src/**/*.data.ts`, `apps/web/src/contexts/AuthContext.tsx`, tests) at level `warn`; verify it fires on a `../../api/index.ts` import
- [ ] After all migration tasks: empty the architecture test's pending list and raise the Biome rule to `error`

### t5 — Docs

- [ ] Add a "Web data loading" section to `AGENTS.md` (loaders/actions/fetchers standard, `*.data.ts` + `resources/*` conventions, `request.signal`, `requireAuth`/`requireAdmin`, `useEffect` allowlist, URL-state rules: URL is the source of truth, filter resets page, 300 ms debounced replace for text) and a new ADR in `docs/decisions.md` (next free number) recording the choice over TanStack Query
- [ ] Update `docs/architecture.md` (web data flow), mark `plans/D10-tanstack-query-migration.md` as superseded by this change, and fix stale JSDoc in `Layout.tsx`, `useRecipeFilters.ts` and `routes/comments.ts`

### t5 — Verification

- [ ] Run `make check`, `make lint`, `make test-web` (including `router.smoke.test.tsx` and `architecture.test.ts`) and `make fmt`; confirm `make fmt-check` is clean and that no new keys were needed in `packages/shared/src/i18n/{en,tr}.json` (add any new user-visible strings to both files)
- [ ] Manually verify in `make dev`: each of the five admin pages opens; `/recipes` Next/Prev keeps filters and Back/Forward works; typing in search produces one history entry; `/settings` while signed out redirects to `/login?next=%2Fsettings` and returns after login
