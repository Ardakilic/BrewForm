## 1. Extend `static-cache.ts` with the cross-tab bust and JSDoc

- [x] 1.1 Open `apps/web/src/api/static-cache.ts` and confirm the
  current state matches the snippet quoted in the proposal
  (`getEquipmentCached`, `getTasteNotesCached`, `invalidateStaticCache`,
  plus the two private module-level cache slots).

- [x] 1.2 Add a module-level constant for the cache-bust key
  immediately after the imports:

  ```ts
  const CACHE_BUST_KEY = 'brewform-static-cache-bust';
  ```

- [x] 1.3 Add a JSDoc block to each of the two private module-level
  cache slots (`_equipment`, `_tasteNotes`) describing what they
  hold and that they are nulled by `invalidateStaticCache()`.

- [x] 1.4 Add a JSDoc block to `getEquipmentCached()` describing
  that it lazy-fetches via `equipmentApi.list()` on first call and
  returns the same memoised array on every subsequent call until
  `invalidateStaticCache()` is invoked.

- [x] 1.5 Add a JSDoc block to `getTasteNotesCached()` with the
  same shape, referencing `tasteApi.flat()`.

- [x] 1.6 Replace the body of `invalidateStaticCache()` with the
  cross-tab-aware version. The function still nulls both cache
  slots first, then broadcasts via `localStorage` inside a
  `try/catch`:

  ```ts
  /**
   * Null both cache slots so the next get*Cached() call re-fetches,
   * and broadcast a cache-bust marker to other browser tabs via
   * localStorage. Same-tab consumers are unaffected by the
   * `storage` event (it fires only in other tabs). The setItem is
   * wrapped in try/catch to tolerate private-mode browsers.
   */
  export function invalidateStaticCache(): void {
    _equipment = null;
    _tasteNotes = null;
    try {
      localStorage.setItem(CACHE_BUST_KEY, String(Date.now()));
    } catch {
      // Private mode or storage quota — cross-tab broadcast is best-effort.
    }
  }
  ```

- [x] 1.7 Run `make check-web` — must pass with zero new errors.

## 2. Add `useStaticCacheSync` hook

- [x] 2.1 Create `apps/web/src/hooks/useStaticCacheSync.ts` with the
  following content (matches the `useDebounce` / `useUnitSystem`
  style in `apps/web/src/hooks/`):

  ```ts
  // deno-lint-ignore-file require-await
  import { useEffect } from 'react';
  import { invalidateStaticCache } from '../api/static-cache.ts';

  const CACHE_BUST_KEY = 'brewform-static-cache-bust';

  /**
   * Subscribes to the browser `storage` event and calls
   * `invalidateStaticCache()` when another tab writes the
   * `brewform-static-cache-bust` marker. The `storage` event does
   * not fire in the tab that wrote the key, so the same-tab flow
   * (mutation page calls `invalidateStaticCache()` directly) is
   * unaffected.
   *
   * Mount exactly once at the app root (see `App.tsx`).
   */
  export function useStaticCacheSync(): void {
    useEffect(() => {
      function onStorage(e: StorageEvent) {
        if (e.key === CACHE_BUST_KEY) invalidateStaticCache();
      }
      globalThis.addEventListener('storage', onStorage);
      return () => globalThis.removeEventListener('storage', onStorage);
    }, []);
  }
  ```

- [x] 2.2 Run `make check-web` — must pass.

## 3. Wire `useStaticCacheSync` into `App.tsx`

- [x] 3.1 Open `apps/web/src/App.tsx`.

- [x] 3.2 Add `import { useStaticCacheSync } from './hooks/useStaticCacheSync.ts';`
  next to the existing imports.

- [x] 3.3 Add a single `useStaticCacheSync();` call as the first
  statement inside the `App()` function body, before the `return`.

- [x] 3.4 Run `make check-web` — must pass.

## 4. Add `invalidateStaticCache` calls + logger + JSDoc to `EquipmentListPage`

- [x] 4.1 Open `apps/web/src/pages/equipment/EquipmentListPage.tsx`.

- [x] 4.2 Add two imports at the top of the file (alphabetically
  positioned with the other imports):

  ```ts
  import { createLogger } from '../../utils/logger.ts';
  import { invalidateStaticCache } from '../../api/static-cache.ts';
  ```

- [x] 4.3 Add a module-scoped logger immediately after the imports:

  ```ts
  const log = createLogger('EquipmentListPage');
  ```

- [x] 4.4 Add a mount/unmount `useEffect` pair inside the
  `EquipmentListPage()` function, after the existing state hooks
  and before the `useEffect` that loads `/equipment`:

  ```ts
  useEffect(() => {
    log.debug({}, 'EquipmentListPage mounted');
    return () => { log.debug({}, 'EquipmentListPage unmounted'); };
  }, []);
  ```

- [x] 4.5 Add a JSDoc block to `handleCreate` describing what it
  does (POST `/equipment`, append to local state, invalidate the
  static cache) and listing its side effects.

- [x] 4.6 Add a `log.debug({}, 'handleCreate started')` line as the
  first statement inside `handleCreate`, and a
  `log.debug({ equipmentId: newEq.id }, 'handleCreate completed')`
  line immediately after the successful `setEquipment((prev) => [...prev, ...])`
  call.

- [x] 4.7 Inside the `try` block of `handleCreate`, immediately
  after the existing `setShowForm(false);` line (last statement in
  the try block), add:

  ```ts
  invalidateStaticCache();
  ```

- [x] 4.8 Add a JSDoc block to `handleDelete` describing the
  delete + local state update + cache invalidation flow.

- [x] 4.9 Add a `log.debug({ equipmentId: id }, 'handleDelete started')`
  line as the first statement inside `handleDelete`, and a
  `log.debug({ equipmentId: id }, 'handleDelete completed')` line
  after the `setEquipment((prev) => prev.filter(...))` call.

- [x] 4.10 Inside the `try` block of `handleDelete`, immediately
  after the existing `setEquipment((prev) => prev.filter((e) => e.id !== id));`
  line, add:

  ```ts
  invalidateStaticCache();
  ```

- [x] 4.11 Run `make check-web` — must pass.

## 5. Add `invalidateStaticCache` calls + logger + JSDoc to `AdminEquipmentPage`

- [x] 5.1 Open `apps/web/src/pages/admin/AdminEquipmentPage.tsx`.

- [x] 5.2 Add the same two imports as task 4.2
  (`createLogger` from `../../utils/logger.ts`,
  `invalidateStaticCache` from `../../api/static-cache.ts`).

- [x] 5.3 Add `const log = createLogger('AdminEquipmentPage');` after
  the imports.

- [x] 5.4 Add a mount/unmount `useEffect` pair identical in shape
  to task 4.4 but with the `'AdminEquipmentPage mounted'` /
  `'AdminEquipmentPage unmounted'` messages.

- [x] 5.5 Add a JSDoc block to `handleSubmit` describing the
  dual-branch (create vs. edit), `resetForm()` call, and cache
  invalidation. Note in the docblock that both branches share a
  single `invalidateStaticCache()` call after `resetForm()`.

- [x] 5.6 Add `log.debug({ editId }, 'handleSubmit started')` as
  the first statement of `handleSubmit` and
  `log.debug({ editId }, 'handleSubmit completed')` after
  `resetForm()`.

- [x] 5.7 Inside the `try` block of `handleSubmit`, immediately
  after the existing `resetForm();` line (last statement in the
  try block), add:

  ```ts
  invalidateStaticCache();
  ```

- [x] 5.8 Add a JSDoc block to `handleDelete` describing the
  delete + local state update + cache invalidation flow.

- [x] 5.9 Add `log.debug({ equipmentId: id }, 'handleDelete started')`
  and `log.debug({ equipmentId: id }, 'handleDelete completed')`
  in the same positions as task 4.9.

- [x] 5.10 Inside the `try` block of `handleDelete`, immediately
  after the existing `setEquipment(...)` line, add:

  ```ts
  invalidateStaticCache();
  ```

- [x] 5.11 Run `make check-web` — must pass.

## 6. Add `invalidateStaticCache` calls + logger + JSDoc to `AdminTasteNotesPage`

- [x] 6.1 Open `apps/web/src/pages/admin/AdminTasteNotesPage.tsx`.

- [x] 6.2 Add the same two imports as task 4.2
  (`createLogger`, `invalidateStaticCache`).

- [x] 6.3 Add `const log = createLogger('AdminTasteNotesPage');`
  after the imports.

- [x] 6.4 Add a mount/unmount `useEffect` pair with
  `'AdminTasteNotesPage mounted'` / `'AdminTasteNotesPage unmounted'`
  messages.

- [x] 6.5 Add a JSDoc block to `handleCreate` describing the
  POST + local state update + cache invalidation.

- [x] 6.6 Add `log.debug({}, 'handleCreate started')` as the
  first statement of `handleCreate` and
  `log.debug({ tasteNoteId: created.id }, 'handleCreate completed')`
  after the `setNotes((prev) => [...prev, ...])` call.

- [x] 6.7 Inside the `try` block of `handleCreate`, immediately
  after the existing `setShowForm(false);` line, add:

  ```ts
  invalidateStaticCache();
  ```

- [x] 6.8 Add a JSDoc block to `handleDelete` describing the
  delete + local state update + cache invalidation flow.

- [x] 6.9 Add `log.debug({ tasteNoteId: id }, 'handleDelete started')`
  and `log.debug({ tasteNoteId: id }, 'handleDelete completed')`.

- [x] 6.10 Inside the `try` block of `handleDelete`, immediately
  after the existing `setNotes((prev) => prev.filter(...))` line,
  add:

  ```ts
  invalidateStaticCache();
  ```

- [x] 6.11 **Keep** the existing "Note: Creating taste notes
  will flush the taste note cache." notice at line 104-106 — it
  becomes accurate after this change.

- [x] 6.12 Run `make check-web` — must pass.

## 7. Add `static-cache.test.ts`

- [x] 7.1 Create `apps/web/src/api/static-cache.test.ts` mirroring
  the structure of `apps/web/src/api/client.test.ts:1-48` (vitest,
  `describe`/`it`/`vi` from `vitest`).

- [x] 7.2 At the top of the file, mock
  `../../api/index.ts` (relative to the test file's directory) to
  provide a stub `equipmentApi.list` and `tasteApi.flat` that
  return controllable mock values:

  ```ts
  vi.mock('../../api/index.ts', () => ({
    equipmentApi: { list: vi.fn() },
    tasteApi: { flat: vi.fn() },
  }));
  ```

- [x] 7.3 Add a `beforeEach` that resets the two mock API
  functions to a fresh `vi.fn()` per test and clears
  `localStorage` (`globalThis.localStorage.clear()`).

- [x] 7.4 Add the test suite. Each test imports the REAL
  `getEquipmentCached`, `getTasteNotesCached`, and
  `invalidateStaticCache` from `./static-cache.ts` (no module
  mock — the whole point is to test the real implementation).

  Required test cases:

  - `getEquipmentCached fetches once and memoises` — call twice,
    assert `equipmentApi.list` called once and both calls return
    the same reference.
  - `getTasteNotesCached fetches once and memoises` — call twice,
    assert `tasteApi.flat` called once and both calls return the
    same reference.
  - `invalidateStaticCache re-arms the equipment fetch` —
    populate, invalidate, get again, assert second fetch.
  - `invalidateStaticCache re-arms the taste-notes fetch` — same
    shape for taste notes.
  - `invalidateStaticCache writes the bust key` — assert
    `localStorage.getItem('brewform-static-cache-bust')` is a
    non-null string.
  - `invalidateStaticCache swallows setItem errors` — mock
    `localStorage.setItem` to throw, call
    `invalidateStaticCache()`, assert no exception escapes and
    the cache slots are still nulled.

- [x] 7.5 Run
  `make test-specific filter=apps/web/src/api/static-cache.test.ts`
  (or `cd apps/web && deno task test -- static-cache`) — all
  tests must pass.

## 8. Add `useStaticCacheSync.test.ts`

- [x] 8.1 Create `apps/web/src/hooks/useStaticCacheSync.test.ts`
  using the project's Vitest + `renderHook` from
  `@testing-library/react` pattern (mirror any existing hook test
  in the workspace; if none exists, use
  `renderHook` from `@testing-library/react` with a minimal
  wrapper).

- [x] 8.2 Mock `../api/static-cache.ts` (the relative path from
  the test file) with `invalidateStaticCache: vi.fn()` and import
  the REAL `useStaticCacheSync` from `./useStaticCacheSync.ts`.

- [x] 8.3 Add the test cases:

  - `registers a storage listener on mount` — assert
    `addEventListener` was called with `'storage'` and a function.
  - `removes the storage listener on unmount` — assert
    `removeEventListener` was called with `'storage'` and the
    same function reference.
  - `calls invalidateStaticCache when a matching storage event fires`
    — dispatch a `StorageEvent` with
    `key: 'brewform-static-cache-bust'`, assert
    `invalidateStaticCache` was called once.
  - `ignores storage events with a different key` — dispatch a
    `StorageEvent` with `key: 'brewform-preferences'`, assert
    `invalidateStaticCache` was NOT called.

- [x] 8.4 Run
  `cd apps/web && deno task test -- useStaticCacheSync` — all
  tests must pass.

## 9. Add `EquipmentListPage.test.tsx`

- [x] 9.1 Create
  `apps/web/src/pages/equipment/EquipmentListPage.test.tsx` using
  the canonical template in
  `apps/web/src/pages/recipes/RecipeListPage.test.tsx:1-234`.

- [x] 9.2 Mock `../../api/static-cache.ts` with all three
  exports:

  ```ts
  vi.mock('../../api/static-cache.ts', () => ({
    getEquipmentCached: vi.fn(),
    getTasteNotesCached: vi.fn(),
    invalidateStaticCache: vi.fn(),
  }));
  ```

- [x] 9.3 Mock `../../api/client.ts` with
  `api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() }`.

- [x] 9.4 Mock `../../contexts/I18nContext.tsx` to provide a
  minimal `useTranslation` returning a `t` that returns the key
  (or a small translation map matching the strings used in the
  page — `equipment.title`, `equipment.addEquipment`, etc.).

- [x] 9.5 Mock `../../utils/logger.ts` with the standard
  no-op-logger pattern (same as the recipe list tests).

- [x] 9.6 Mock `../../components/seo/SEOHead.tsx` as
  `SEOHead: () => null`.

- [x] 9.7 Add test cases:

  - `renders loading state on initial mount` — assert the
    `t('common.loading')` text is visible.
  - `renders the equipment list after initial fetch` — assert
    each equipment item's name appears.
  - `submits the create form, appends to local state, and
    invalidates the cache` — fill the form, submit, assert
    `api.post('/equipment', payload)` was called, the new
    equipment name appears in the list, and
    `invalidateStaticCache()` was called exactly once.
  - `does NOT invalidate the cache when create API rejects` —
    mock `api.post` to reject, submit, assert
    `invalidateStaticCache` was not called.
  - `clicks delete, calls api.delete, and invalidates the cache`
    — stub `globalThis.confirm` to return `true`, click delete,
    assert `api.delete('/equipment/:id')` was called, the item
    disappears from the list, and `invalidateStaticCache()` was
    called exactly once.
  - `does NOT invalidate the cache when delete API rejects` —
    mock `api.delete` to reject, click delete, assert
    `invalidateStaticCache` was not called.

- [x] 9.8 Run
  `cd apps/web && deno task test -- EquipmentListPage` — all
  tests must pass.

## 10. Add `AdminEquipmentPage.test.tsx`

- [x] 10.1 Create
  `apps/web/src/pages/admin/AdminEquipmentPage.test.tsx` using the
  same template as task 9.

- [x] 10.2 Mock `../../api/static-cache.ts` (the relative path
  from `apps/web/src/pages/admin/`) with all three exports.

- [x] 10.3 Mock `../../api/client.ts` with
  `api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }`.

- [x] 10.4 Mock `../../utils/logger.ts` with the no-op pattern.

- [x] 10.5 Add test cases:

  - `renders the equipment table after initial fetch`.
  - `create flow: post + invalidateStaticCache called once` —
    submit the create form, assert
    `api.post('/admin/equipment', payload)` and
    `invalidateStaticCache()` (exactly one call).
  - `edit flow: click Edit, modify form, submit, patch + invalidateStaticCache called once`
    — assert
    `api.patch('/admin/equipment/:id', payload)` and
    `invalidateStaticCache()` (exactly one call).
  - `delete flow: confirm, api.delete + invalidateStaticCache called once`
    — assert
    `api.delete('/admin/equipment/:id')` and
    `invalidateStaticCache()` (exactly one call).
  - `failed create / edit / delete does NOT call invalidateStaticCache`
    — for each branch, mock the API call to reject, perform the
    user action, assert `invalidateStaticCache` was not called.

- [x] 10.6 Run
  `cd apps/web && deno task test -- AdminEquipmentPage` — all
  tests must pass.

## 11. Add `AdminTasteNotesPage.test.tsx`

- [x] 11.1 Create
  `apps/web/src/pages/admin/AdminTasteNotesPage.test.tsx` using the
  same template as task 9.

- [x] 11.2 Mock `../../api/static-cache.ts` with all three
  exports.

- [x] 11.3 Mock `../../api/client.ts` with
  `api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() }`.

- [x] 11.4 Mock `../../utils/logger.ts` with the no-op pattern.

- [x] 11.5 Add test cases:

  - `renders the taste notes list after initial fetch`.
  - `create flow: post + invalidateStaticCache called once` —
    submit the create form, assert
    `api.post('/admin/taste-notes', payload)` and
    `invalidateStaticCache()` (exactly one call).
  - `delete flow: confirm, api.delete + invalidateStaticCache called once`
    — assert
    `api.delete('/admin/taste-notes/:id')` and
    `invalidateStaticCache()` (exactly one call).
  - `failed create / delete does NOT call invalidateStaticCache`
    — for each branch, mock the API call to reject, perform the
    user action, assert `invalidateStaticCache` was not called.

- [x] 11.6 Run
  `cd apps/web && deno task test -- AdminTasteNotesPage` — all
  tests must pass.

## 12. Final verification

- [x] 12.1 Run `make fmt` — must apply cleanly to all modified
  files.

- [x] 12.2 Run `make lint` — zero warnings on the affected files
  (`apps/web/src/api/static-cache.ts`,
  `apps/web/src/hooks/useStaticCacheSync.ts`,
  `apps/web/src/App.tsx`, the three mutation page `.tsx` files,
  and the five new test files).

- [x] 12.3 Run `make check` (or `make check-web` for a faster
  loop) — zero type errors.

- [x] 12.4 Run `make test` — every existing test continues to
  pass, and every new test added in tasks 7-11 passes.

- [x] 12.5 Confirm with a manual browser smoke test (no automation
  required, just a sanity check):
  1. Open `/equipment` in Tab A.
  2. Navigate Tab A to `/recipes` — confirm the equipment filter
     shows the current list.
  3. In Tab A, create a new piece of equipment on `/equipment`.
  4. Navigate Tab A to `/recipes` — the new equipment must
     appear in the filter dropdown.
  5. Open Tab B on `/recipes/starred`. In Tab A, delete the
     equipment. Click into Tab B — on the next navigation
     (refresh or back-forward), the equipment must be gone from
     the filter.
  6. In Tab A, create a new taste note on `/admin/taste-notes`.
     In Tab B, navigate to `/recipes/:some-slug` — the new taste
     note must appear in the detail-page tasting-notes selector.

- [x] 12.6 Confirm the existing
  `RecipeListPage.test.tsx`, `StarredRecipesPage.test.tsx`, and
  `RecipeDetailPage.test.tsx` mock surfaces for
  `../../api/static-cache.ts` do **not** need updating. They
  mock only the two `get*Cached` functions; the three mutation
  pages are not imported by those test files, so the
  `invalidateStaticCache` symbol is not resolved there. Running
  `make test` must show all three existing test files still
  green without any modification.
