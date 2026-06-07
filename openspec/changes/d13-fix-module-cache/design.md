## Context

The frontend caches two lookup collections — the equipment list
(`EquipmentListItem[]`) and the flat taste-note tree
(`TasteNoteFlatItem[]`) — in module-level variables inside
`apps/web/src/api/static-cache.ts`. The module exports three functions
and a `null`-initialised cache for each collection. The two readers
(`getEquipmentCached` and `getTasteNotesCached`) lazily populate the
slots on first call. The writer (`invalidateStaticCache`) exists but
is never called from anywhere in the web workspace.

The cache is consumed by three React Router 7 data loaders:

- `RecipeListPage.tsx:31-32` — equipment + taste notes
- `StarredRecipesPage.tsx:31-32` — equipment + taste notes
- `RecipeDetailPage.tsx:65` — taste notes only

The cache is mutated (in the data-layer sense — the underlying API
records change) by three pages that manage their own local React
state and never call the existing `invalidateStaticCache()`:

- `EquipmentListPage.tsx:34, 52` — user create + delete
- `AdminEquipmentPage.tsx:31, 56` — admin create/edit (single
  `handleSubmit`) + delete
- `AdminTasteNotesPage.tsx:29, 43` — admin create + delete

The result: navigating from any of these three pages to a consuming
loader returns the pre-mutation snapshot until a hard reload.
`AdminTasteNotesPage.tsx:104-106` already shows the user a message
promising a flush that the current code never delivers.

A validated, line-accurate plan exists at `plans/D13-fix-module-cache.md`
(June 2026) with five corrections applied. This design adopts every
correction and adds the cross-tab enhancement and the test/logging
work that the plan calls out as optional or omits.

### Codebase facts (verified)

- `apps/web/src/api/static-cache.ts:1-20` matches the snippet shown in
  the validated plan verbatim.
- `grep -r "invalidateStaticCache" apps/web/src` returns only the
  export definition. Zero call sites.
- `RecipeListPage.tsx`, `StarredRecipesPage.tsx`, and
  `RecipeDetailPage.tsx` each declare `import` of the two `get*Cached`
  functions at the top of the file and call them in the loader.
- `EquipmentListPage.tsx`, `AdminEquipmentPage.tsx`, and
  `AdminTasteNotesPage.tsx` have no module logger, no
  `useEffect` mount/unmount pair, and no JSDoc on their handler
  functions. They are listed under P2 logging coverage in
  `TODO_logs.md:77-79, 99`.
- `apps/web/src/api/client.test.ts` exists as the precedent for
  colocated test files (`*.test.ts` next to the source `.ts`). No
  `static-cache.test.ts` exists.
- The Vitest config (`apps/web/vitest.config.ts:23-35`) sets up
  `jsdom`, registers `src/test-setup.ts`, and excludes Deno-native
  tests. Colocated `*.test.ts(x)` files are picked up automatically
  by `apps/web/deno.json:10` (`deno run -A npm:vitest run`).
- The web `ConsoleLogger` (`apps/web/src/utils/logger.ts:43-115`)
  implements the shared `ChildLogger` interface. Module-scoped
  loggers are created at the top of each file:
  `const log = createLogger('ModuleName');`.
- `apps/web/src/hooks/useUnitSystem.ts` already reads
  `localStorage` directly, which proves the workspace tolerates that
  API surface (the storage event in `useStaticCacheSync` is
  adjacent).
- The existing `RecipeListPage.test.tsx:26-29` mocks
  `'../../api/static-cache.ts'` with `getEquipmentCached: vi.fn()`
  and `getTasteNotesCached: vi.fn()` only. The new mutation-page
  tests will need to add `invalidateStaticCache: vi.fn()` to the
  same mock. The existing list-page and detail-page test files do
  not import the mutation pages, so no existing mock needs to grow
  to keep them passing.
- The store key `'brewform-static-cache-bust'` is not used anywhere
  else in the workspace (verified via grep). It is namespaced under
  the `brewform-` prefix to match `useUnitSystem`'s
  `'brewform-preferences'`.

### Stakeholders

- **Web app (`apps/web/`)** — affected (primary).
- **API, DB package, shared package** — not affected.
- **Product** — equipment and taste-note filter dropdowns on
  `/recipes` and `/recipes/starred` now reflect user and admin
  changes without a hard reload. Cross-tab consistency is gained
  for free as a UX bonus.
- **Tests** — six new test files; no existing test file is modified.

## Goals / Non-Goals

**Goals:**

- Call `invalidateStaticCache()` at the end of every successful
  equipment or taste-note mutation handler in the three mutation
  pages.
- Extend `invalidateStaticCache()` to broadcast a cache-bust signal
  to other browser tabs via `localStorage`, so the same UX promise
  holds across tabs.
- Add a `useStaticCacheSync()` hook in `apps/web/src/hooks/` that
  listens for the bust signal and clears the local cache. Mount the
  hook once at the app root.
- Add a `static-cache.test.ts` that covers the cache module's
  actual behaviour (memoisation, null-on-invalidate, localStorage
  broadcast, localStorage throw tolerance).
- Add three new page test files
  (`EquipmentListPage.test.tsx`,
  `AdminEquipmentPage.test.tsx`,
  `AdminTasteNotesPage.test.tsx`) and a hook test
  (`useStaticCacheSync.test.ts`), each asserting
  `invalidateStaticCache()` is called exactly once per successful
  mutation and is **not** called when the underlying API call
  rejects.
- Add module-scoped loggers and a mount/unmount `useEffect` debug
  pair to each of the three mutation pages, per
  `AGENTS.md → Logging` and `TODO_logs.md P2`.
- Add JSDoc to every new and updated function (the four
  `static-cache.ts` functions plus the three `handle*` pairs and
  the two new hook exports).
- Keep `AdminTasteNotesPage.tsx:104-106` "flush the taste note
  cache" notice — it becomes accurate after this change.
- Pass `make fmt`, `make lint`, `make check`, and `make test` with
  zero new errors or warnings.

**Non-Goals:**

- No migration to TanStack Query, SWR, or any new data-fetching
  dependency. React Router 7 loaders remain the source of truth.
- No change to `RecipeListPage.tsx`, `StarredRecipesPage.tsx`, or
  `RecipeDetailPage.tsx` — they are read-only consumers of the
  cache.
- No change to `apps/web/src/api/index.ts` —
  `equipmentApi` / `tasteApi` / `recipeApi` surface is unchanged.
- No backend change. No OpenAPI delta. No DB migration.
- No live revalidation on a page already rendered. When Tab B is
  already showing `/recipes` and Tab A invalidates the cache, Tab B
  does not re-fetch until the next navigation. This is a known
  React Router loader limitation, not in scope.
- No fix for the pre-existing concurrent-call race in
  `getEquipmentCached()` and `getTasteNotesCached()` (both await
  `equipmentApi.list()` / `tasteApi.flat()` without re-checking the
  cache slot afterwards, so a second concurrent caller still fires
  the network). Flag as a follow-up.
- No removal of the deprecated singular `tasteNoteId` filter — that
  is a separate API deprecation cycle (already covered by D28).
- No new `getRevalidator` / `useRevalidator` calls. The plan
  correctly notes that loaders naturally re-run on the next
  navigation; no imperative revalidation is required.

## Decisions

### Decision 1: `invalidateStaticCache` broadcasts via `localStorage` (Option B in the plan)

**Rationale**: The plan labels cross-tab invalidation as optional
but `AdminTasteNotesPage.tsx:104-106` already advertises a
"cache flush" to the user. Delivering that promise in the same
change is cheap (≈10 lines) and removes the lie. The `storage`
event fires only in *other* tabs, which is exactly the desired
semantic — no need for an additional signalling layer.

The chosen transport is `localStorage.setItem('brewform-static-cache-bust', String(Date.now()))`
because (a) it is universally supported in jsdom and in every
target browser, (b) the value is irrelevant — only the write
event matters, and (c) the alternative `BroadcastChannel` is not
available in Safari < 15.4 and would require a polyfill or fallback.

`setItem` is wrapped in `try/catch` because Safari private mode
throws on writes, and the cross-tab enhancement must never break
the same-tab fix.

### Decision 2: A dedicated `useStaticCacheSync` hook (not inline in `App.tsx`)

**Rationale**: Putting the listener directly in `App.tsx` would
mix app-shell concerns with a reusable cache concern, and would
make testing awkward (the hook is the natural unit). A 15-line
hook file plus a colocated `useStaticCacheSync.test.ts` keeps
the responsibility narrow and follows the same `apps/web/src/hooks/`
pattern already used for `useDebounce` and `useUnitSystem`.

### Decision 3: `useStaticCacheSync` is mounted once in `App.tsx`, not in each loader consumer

**Rationale**: The hook only needs to run while the SPA is alive.
`App.tsx` is the only component guaranteed to mount exactly once
for the lifetime of the app. Mounting it from
`RecipeListPage` or `StarredRecipesPage` would re-attach and
detach the listener on every navigation, wasting cycles and
risking missed events.

### Decision 4: Test the real `static-cache` module in `static-cache.test.ts`, not just the mock

**Rationale**: The plan's risk assessment claims
"`invalidateStaticCache()` is already tested via the existing
mocks". It is not — the existing tests replace the module with
`vi.fn()`, which tests nothing about the real function. A
colocated `static-cache.test.ts` (mirroring
`client.test.ts`) is the only way to verify memoisation, the
null-on-invalidate contract, and the localStorage broadcast.

### Decision 5: `invalidateStaticCache` is called only on success, not on thrown API errors

**Rationale**: The mutation handlers already short-circuit on
`catch {}` (current behaviour preserved). Calling
`invalidateStaticCache()` in the `catch` would create a
false-positive invalidation: the cache is already correct (the
mutation failed), and a future successful get from another tab
would trigger an unnecessary network round-trip. The new tests
explicitly assert that `invalidateStaticCache` is **not** called
when the underlying `api.post` / `api.patch` / `api.delete`
rejects.

### Decision 6: No `useRevalidator` calls

**Rationale**: React Router 7 loaders naturally re-run when the
URL changes. The next time the user navigates to `/recipes`,
`/recipes/starred`, or `/recipes/:slug` after a mutation, the
loader fires and the nulled cache forces a fresh API fetch. There
is no user-facing scenario in this change where the current page
must re-fetch (the mutation page is a different route). Adding
`useRevalidator` would only help if we wanted the same
already-rendered list page to refresh after a cross-tab mutation,
which is a separate UX problem.

## Risks / Trade-offs

- **[The `storage` event does not fire in the originating tab]**
  → The cache is still nulled in the originating tab because the
  mutation handler itself calls `invalidateStaticCache()` before
  the `localStorage.setItem` broadcast. The `useStaticCacheSync`
  hook is a no-op in the writer tab and active in the reader
  tabs — exactly the correct division of labour.

- **[Safari private mode throws on `localStorage.setItem`]**
  → The setItem is wrapped in `try/catch`; the error is
  swallowed. The same-tab invalidation still works; only the
  cross-tab broadcast is suppressed. `static-cache.test.ts`
  asserts the swallow behaviour.

- **[`getEquipmentCached()` race condition: two concurrent callers
  during an in-flight fetch both fire `equipmentApi.list()`]**
  → Not addressed in this change. The mutation → invalidation
  flow does not exercise this scenario. The race is wasteful but
  not incorrect (both await the same data, second write wins,
  same data). Flag as a candidate for D30+; the new
  `static-cache.test.ts` will incidentally document the current
  behaviour.

- **[Already-rendered list pages do not auto-refresh after a
  cross-tab mutation until the next navigation]**
  → Documented as a known limitation in the proposal's Impact
  section. Not in scope. A future change could add a
  `useRevalidator` on the consuming pages, gated on a new
  "static cache dirty" event.

- **[Adding a logger to the three mutation pages increases
  per-page output noise in dev]**
  → Acceptable. The `VITE_LOG_LEVEL` env var defaults to `info`,
  so the new `debug` entries are silent in production. Mount /
  unmount pairs are exactly two extra `console.debug` calls per
  page lifetime.

- **[Test mocks for `static-cache.ts` need to grow to include
  `invalidateStaticCache`]**
  → Only in the three NEW page test files. The existing
  `RecipeListPage.test.tsx`, `StarredRecipesPage.test.tsx`, and
  `RecipeDetailPage.test.tsx` mocks stay unchanged because they
  do not import the mutation pages.

- **[The `useStaticCacheSync` hook installs a `storage` listener
  even when no other tab is ever open]**
  → Negligible. The listener fires only on `setItem` to the
  specific key, costs nothing at idle, and is removed on unmount.

- **[Three new page test files + one hook test + one module test =
  five new test files added in a single change]**
  → Slightly larger than the typical D-series change, but each
  test file is small and the coverage is necessary to prevent
  regression. All five follow established patterns; none
  introduces a new testing primitive.
