## Why

`apps/web/src/api/static-cache.ts` centralises the module-level equipment
and taste-notes caches that `RecipeListPage`, `StarredRecipesPage`, and
`RecipeDetailPage` consume in their React Router loaders. The file
already exports `invalidateStaticCache()` to null both caches
(`apps/web/src/api/static-cache.ts:17-20`), but a search of the entire
web workspace shows the function is **never called** — every successful
mutation in `EquipmentListPage`, `AdminEquipmentPage`, and
`AdminTasteNotesPage` updates local React state and leaves the module
cache populated with the pre-mutation snapshot. The result is stale
filter dropdowns and stale taste-note lists on every subsequent
navigation to the consuming routes, plus a misleading user-facing
message ("Creating taste notes will flush the taste note cache.") in
`AdminTasteNotesPage.tsx:104-106` that is currently false. The fix is
mechanical: call `invalidateStaticCache()` at the end of every
successful mutation handler. The corrected plan (`plans/D13-fix-module-cache.md`)
captures the same-tab fix path; this change additionally includes a
cross-tab `storage`-event broadcast so the existing UI promise holds
when the mutation happens in another tab.

## What Changes

- Modify `apps/web/src/api/static-cache.ts` to broadcast a cache-bust
  signal to other tabs from `invalidateStaticCache()` via
  `localStorage.setItem('brewform-static-cache-bust', String(Date.now()))`
  (wrapped in `try/catch` for private-mode tolerance), and to add JSDoc
  to the three exported functions plus the two private module-level
  cache slots.
- Add `apps/web/src/hooks/useStaticCacheSync.ts`: a small `useEffect`-based
  hook that subscribes to the browser `storage` event and calls
  `invalidateStaticCache()` when the bust key is written by another
  tab. The `storage` event only fires in *other* tabs, which is the
  correct cross-tab invalidation semantics.
- Wire `useStaticCacheSync()` into `apps/web/src/App.tsx` so the
  listener is installed once for the lifetime of the app.
- Modify `apps/web/src/pages/equipment/EquipmentListPage.tsx` to (a)
  import `invalidateStaticCache` and `createLogger`, (b) add a
  module-scoped logger, (c) add a `useEffect` mount/unmount pair with
  debug logs, (d) add JSDoc to `handleCreate` and `handleDelete`,
  (e) add `invalidateStaticCache()` at the end of each handler's `try`
  block (after the existing local state update), and (f) add debug /
  error logs on the handlers.
- Modify `apps/web/src/pages/admin/AdminEquipmentPage.tsx` with the
  same set of changes; `invalidateStaticCache()` is called once in
  `handleSubmit` (which covers both the create and edit branches
  before the single `resetForm()` call) and once in `handleDelete`.
- Modify `apps/web/src/pages/admin/AdminTasteNotesPage.tsx` with the
  same set of changes; `invalidateStaticCache()` is called once in
  `handleCreate` and once in `handleDelete`. The existing
  "flush the taste note cache" notice at `AdminTasteNotesPage.tsx:104-106`
  is kept and becomes accurate.
- Add `apps/web/src/api/static-cache.test.ts`: a Vitest unit suite that
  verifies (i) `getEquipmentCached` and `getTasteNotesCached` each
  fetch exactly once and memoise, (ii) `invalidateStaticCache` nulls
  both caches so the next call re-fetches, (iii) the cache-bust key is
  written to `localStorage` on invalidate, and (iv) a `setItem` throw
  is swallowed.
- Add `apps/web/src/hooks/useStaticCacheSync.test.ts`: a Vitest unit
  suite that verifies the hook registers a `storage` listener on mount,
  removes it on unmount, and calls `invalidateStaticCache()` only when
  the event's `key` matches the bust key.
- Add `apps/web/src/pages/equipment/EquipmentListPage.test.tsx`,
  `apps/web/src/pages/admin/AdminEquipmentPage.test.tsx`, and
  `apps/web/src/pages/admin/AdminTasteNotesPage.test.tsx`: three new
  Vitest suites following the canonical template in
  `apps/web/src/pages/recipes/RecipeListPage.test.tsx`. Each suite
  asserts that `invalidateStaticCache()` is called exactly once per
  successful mutation handler and is **not** called when the
  underlying API call rejects.
- No changes to `RecipeListPage.tsx`, `StarredRecipesPage.tsx`, or
  `RecipeDetailPage.tsx` — they remain read-only consumers of the
  cache and automatically benefit from the next-navigation refresh.
- No changes to `RecipeListPage.test.tsx`, `StarredRecipesPage.test.tsx`,
  or `RecipeDetailPage.test.tsx` — they mock the two `get*Cached`
  functions only, do not import the mutation pages, and do not import
  `invalidateStaticCache` anywhere in their source, so no mock
  surface change is needed.

## Capabilities

### New Capabilities

- `static-cache`: covers the contract that the equipment and taste-notes
  lookups exposed to React Router loaders via
  `getEquipmentCached` / `getTasteNotesCached` are invalidated after
  every successful mutation, and that the invalidation propagates
  across browser tabs via the `storage` event.

### Modified Capabilities

- _None._ No existing spec's REQUIREMENTS change. This is a pure
  implementation bug fix that adds behaviour to a previously-unused
  function and a new cross-tab sync hook. The existing
  `recipe-filter` and `lint-style` specs are unaffected.

## Impact

- **Code (modified, 4 files)**: `apps/web/src/api/static-cache.ts`,
  `apps/web/src/App.tsx`,
  `apps/web/src/pages/equipment/EquipmentListPage.tsx`,
  `apps/web/src/pages/admin/AdminEquipmentPage.tsx`,
  `apps/web/src/pages/admin/AdminTasteNotesPage.tsx`.
- **Code (new, 5 files)**: `apps/web/src/hooks/useStaticCacheSync.ts`,
  `apps/web/src/api/static-cache.test.ts`,
  `apps/web/src/hooks/useStaticCacheSync.test.ts`,
  `apps/web/src/pages/equipment/EquipmentListPage.test.tsx`,
  `apps/web/src/pages/admin/AdminEquipmentPage.test.tsx`,
  `apps/web/src/pages/admin/AdminTasteNotesPage.test.tsx`.
- **APIs**: no backend, schema, OpenAPI, or breaking frontend API
  changes. The existing `equipmentApi`, `tasteApi`, `recipeApi`
  surface in `apps/web/src/api/index.ts` is untouched.
- **Dependencies**: none. The `storage` event and `localStorage` are
  standard browser APIs already used elsewhere in the workspace (e.g.
  `useUnitSystem` in `apps/web/src/hooks/useUnitSystem.ts`).
- **Behavioural surface**:
  - **Same-tab**: navigating from any mutation page to
    `/recipes`, `/recipes/starred`, or `/recipes/:slug` after a
    successful equipment or taste-note mutation now returns the
    fresh list on the next loader run (the loader fires
    `getEquipmentCached()` / `getTasteNotesCached()`, both of which
    see `null` cache slots and re-fetch).
  - **Cross-tab**: when a mutation happens in Tab A, the bust key
    written by `invalidateStaticCache` triggers a `storage` event
    in Tab B. Tab B's `useStaticCacheSync` clears its own cache;
    the next loader run in Tab B re-fetches. A page already rendered
    in Tab B does **not** auto-revalidate (a known React Router
    loader limitation that is out of scope).
  - **Existing UI notice**: the line "Creating taste notes will
    flush the taste note cache." in `AdminTasteNotesPage.tsx` becomes
    accurate.
- **Risk**: **Low.** No abstractions change, no new files outside
  the web app, no migrations, no new dependencies. The one behaviour
  change (calling `invalidateStaticCache()` after mutations) is the
  intended fix.
