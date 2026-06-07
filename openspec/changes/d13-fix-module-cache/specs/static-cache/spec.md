## ADDED Requirements

### Requirement: Equipment and taste-notes lookup caches are invalidated on mutation

The system SHALL provide a centralised lookup cache for the
authenticated user's equipment list and the flat taste-note tree,
exposed via `getEquipmentCached()` and `getTasteNotesCached()` in
`apps/web/src/api/static-cache.ts`. Both functions SHALL return the
memoised result of the first call's underlying API request and
SHALL return the same memoised value for every subsequent call
until `invalidateStaticCache()` is invoked. `invalidateStaticCache()`
SHALL null both cache slots so the next call to either reader
re-fetches from the API.

Every page that performs a successful equipment or taste-note
mutation SHALL call `invalidateStaticCache()` at the end of its
mutation handler's `try` block, after the local React state update
and before the function returns. Specifically:

- `apps/web/src/pages/equipment/EquipmentListPage.tsx` —
  `handleCreate` and `handleDelete` each call
  `invalidateStaticCache()` once on success.
- `apps/web/src/pages/admin/AdminEquipmentPage.tsx` —
  `handleSubmit` (covering both the create branch and the edit
  branch) calls `invalidateStaticCache()` once on success;
  `handleDelete` calls it once on success.
- `apps/web/src/pages/admin/AdminTasteNotesPage.tsx` —
  `handleCreate` and `handleDelete` each call
  `invalidateStaticCache()` once on success.

The system SHALL NOT call `invalidateStaticCache()` when the
underlying API mutation rejects.

#### Scenario: User creates equipment on /equipment — same-tab refresh

- **WHEN** a user submits the create form on
  `apps/web/src/pages/equipment/EquipmentListPage.tsx`
- **AND** the `POST /equipment` request resolves successfully
- **THEN** `invalidateStaticCache()` is called exactly once
- **AND** the user's local `equipment` state includes the new item
- **AND** on the user's next navigation to `/recipes`,
  `/recipes/starred`, or `/recipes/:slug`, the loader's call to
  `getEquipmentCached()` re-fetches from the API and the new
  equipment appears in the filter dropdown

#### Scenario: User deletes equipment on /equipment — same-tab refresh

- **WHEN** a user confirms the delete confirmation on
  `apps/web/src/pages/equipment/EquipmentListPage.tsx`
- **AND** the `DELETE /equipment/:id` request resolves successfully
- **THEN** `invalidateStaticCache()` is called exactly once
- **AND** the user's local `equipment` state no longer includes the
  deleted item
- **AND** on the user's next navigation to `/recipes`, the deleted
  equipment no longer appears in the filter dropdown

#### Scenario: Admin creates equipment on /admin/equipment — same-tab refresh

- **WHEN** an admin submits the create form on
  `apps/web/src/pages/admin/AdminEquipmentPage.tsx`
- **AND** the `POST /admin/equipment` request resolves successfully
- **THEN** `invalidateStaticCache()` is called exactly once
- **AND** on the next navigation to `/recipes`, the new equipment
  appears in the filter dropdown

#### Scenario: Admin edits equipment on /admin/equipment — same-tab refresh

- **WHEN** an admin submits the edit form on
  `apps/web/src/pages/admin/AdminEquipmentPage.tsx`
- **AND** the `PATCH /admin/equipment/:id` request resolves
  successfully
- **THEN** `invalidateStaticCache()` is called exactly once
- **AND** on the next navigation to `/recipes`, the updated
  equipment name and type appear in the filter dropdown

#### Scenario: Admin deletes equipment on /admin/equipment — same-tab refresh

- **WHEN** an admin confirms the delete on
  `apps/web/src/pages/admin/AdminEquipmentPage.tsx`
- **AND** the `DELETE /admin/equipment/:id` request resolves
  successfully
- **THEN** `invalidateStaticCache()` is called exactly once
- **AND** on the next navigation to `/recipes`, the deleted
  equipment no longer appears in the filter dropdown

#### Scenario: Admin creates taste note on /admin/taste-notes — same-tab refresh

- **WHEN** an admin submits the create form on
  `apps/web/src/pages/admin/AdminTasteNotesPage.tsx`
- **AND** the `POST /admin/taste-notes` request resolves
  successfully
- **THEN** `invalidateStaticCache()` is called exactly once
- **AND** on the next navigation to `/recipes`, `/recipes/starred`,
  or `/recipes/:slug`, the new taste note appears in the taste-note
  filter dropdown and the detail-page tasting-notes selector

#### Scenario: Admin deletes taste note on /admin/taste-notes — same-tab refresh

- **WHEN** an admin confirms the delete on
  `apps/web/src/pages/admin/AdminTasteNotesPage.tsx`
- **AND** the `DELETE /admin/taste-notes/:id` request resolves
  successfully
- **THEN** `invalidateStaticCache()` is called exactly once
- **AND** on the next navigation to `/recipes/:slug`, the deleted
  taste note no longer appears in the tasting-notes selector

#### Scenario: Failed equipment creation — no invalidation

- **WHEN** a user submits the create form on
  `apps/web/src/pages/equipment/EquipmentListPage.tsx`
- **AND** the `POST /equipment` request rejects
- **THEN** `invalidateStaticCache()` is **not** called
- **AND** the cache is unchanged

#### Scenario: Failed equipment deletion — no invalidation

- **WHEN** a user confirms the delete on
  `apps/web/src/pages/admin/AdminEquipmentPage.tsx`
- **AND** the `DELETE /admin/equipment/:id` request rejects
- **THEN** `invalidateStaticCache()` is **not** called
- **AND** the cache is unchanged

#### Scenario: Failed taste-note creation — no invalidation

- **WHEN** an admin submits the create form on
  `apps/web/src/pages/admin/AdminTasteNotesPage.tsx`
- **AND** the `POST /admin/taste-notes` request rejects
- **THEN** `invalidateStaticCache()` is **not** called
- **AND** the cache is unchanged

### Requirement: Cache invalidation propagates across browser tabs

`invalidateStaticCache()` SHALL write a cache-bust marker to
`localStorage` under the key `brewform-static-cache-bust`. The
value SHALL be the result of `String(Date.now())` at the time of
the call. The write SHALL be wrapped in a `try/catch` block; if
`localStorage.setItem` throws (for example in Safari private
mode), the error SHALL be swallowed and the same-tab invalidation
SHALL still complete.

The system SHALL provide a React hook `useStaticCacheSync()` in
`apps/web/src/hooks/useStaticCacheSync.ts` that, when mounted,
registers a `storage` event listener on `globalThis`. When the
event's `key` is `brewform-static-cache-bust`, the listener SHALL
call `invalidateStaticCache()`. The hook SHALL remove the listener
on unmount.

`useStaticCacheSync()` SHALL be mounted exactly once in
`apps/web/src/App.tsx`, at the top of the `App()` function body,
so the listener is active for the entire lifetime of the SPA.

#### Scenario: Same-tab mutation does not trigger useStaticCacheSync

- **WHEN** a user mutates equipment on Tab A
- **AND** `invalidateStaticCache()` is called in Tab A
- **THEN** the `storage` event does **not** fire in Tab A
  (browsers only dispatch `storage` in *other* tabs)
- **AND** Tab A's `useStaticCacheSync` listener does not fire
- **AND** Tab A's own `invalidateStaticCache()` call still nulls
  Tab A's cache

#### Scenario: Cross-tab mutation triggers useStaticCacheSync in other tabs

- **WHEN** a user mutates taste notes in Tab A
- **AND** `invalidateStaticCache()` is called in Tab A
- **THEN** Tab B's `storage` event listener fires with
  `event.key === 'brewform-static-cache-bust'`
- **AND** Tab B's `useStaticCacheSync` calls `invalidateStaticCache()`
- **AND** Tab B's cache slots are nulled
- **AND** on Tab B's next navigation to `/recipes`, the new taste
  note appears in the filter dropdown

#### Scenario: useStaticCacheSync ignores other storage events

- **WHEN** any other key in `localStorage` is updated (for example
  `brewform-preferences` from `useUnitSystem`)
- **THEN** the `useStaticCacheSync` listener is invoked
- **AND** the listener does **not** call `invalidateStaticCache()`
  because `event.key !== 'brewform-static-cache-bust'`

#### Scenario: useStaticCacheSync is removed on app unmount

- **WHEN** the `App` component unmounts
- **THEN** the `storage` event listener is removed from `globalThis`
- **AND** no further `storage` events are routed to the cache
  invalidation handler

#### Scenario: localStorage.setItem throw is swallowed

- **WHEN** `invalidateStaticCache()` is called
- **AND** `localStorage.setItem` throws (for example because
  storage is full or in private mode)
- **THEN** the error is caught and ignored
- **AND** the same-tab cache slots are still nulled
- **AND** no unhandled-promise-rejection or uncaught exception is
  surfaced

### Requirement: Static cache functions are unit-tested

The system SHALL include a colocated Vitest test file
`apps/web/src/api/static-cache.test.ts` that exercises the real
`static-cache.ts` module (not a mock). The test file SHALL cover
at minimum:

- `getEquipmentCached()` calls `equipmentApi.list()` exactly once
  on the first invocation and returns the same memoised reference
  on every subsequent invocation without a second API call.
- `getTasteNotesCached()` calls `tasteApi.flat()` exactly once on
  the first invocation and returns the same memoised reference on
  every subsequent invocation without a second API call.
- `invalidateStaticCache()` nulls the equipment cache slot so that
  the next `getEquipmentCached()` call re-fetches from
  `equipmentApi.list()`.
- `invalidateStaticCache()` nulls the taste-notes cache slot so
  that the next `getTasteNotesCached()` call re-fetches from
  `tasteApi.flat()`.
- `invalidateStaticCache()` writes
  `localStorage.setItem('brewform-static-cache-bust', <timestamp>)`.
- `invalidateStaticCache()` swallows any error thrown by
  `localStorage.setItem`.

#### Scenario: equipment cache memoises

- **WHEN** `getEquipmentCached()` is called twice in succession
- **THEN** `equipmentApi.list()` is called exactly once
- **AND** both calls return the same array reference

#### Scenario: taste-notes cache memoises

- **WHEN** `getTasteNotesCached()` is called twice in succession
- **THEN** `tasteApi.flat()` is called exactly once
- **AND** both calls return the same array reference

#### Scenario: invalidate re-arms the equipment fetch

- **WHEN** `getEquipmentCached()` populates the cache
- **AND** `invalidateStaticCache()` is called
- **AND** `getEquipmentCached()` is called again
- **THEN** `equipmentApi.list()` is called a second time

#### Scenario: invalidate re-arms the taste-notes fetch

- **WHEN** `getTasteNotesCached()` populates the cache
- **AND** `invalidateStaticCache()` is called
- **AND** `getTasteNotesCached()` is called again
- **THEN** `tasteApi.flat()` is called a second time

#### Scenario: invalidate writes the bust key

- **WHEN** `invalidateStaticCache()` is called
- **THEN** `localStorage.getItem('brewform-static-cache-bust')`
  returns a non-null string value

#### Scenario: invalidate swallows setItem errors

- **GIVEN** `localStorage.setItem` is mocked to throw
- **WHEN** `invalidateStaticCache()` is called
- **THEN** no exception propagates out of the call
- **AND** the same-tab cache slots are still nulled

### Requirement: useStaticCacheSync is unit-tested

The system SHALL include a colocated Vitest test file
`apps/web/src/hooks/useStaticCacheSync.test.ts` that renders the
hook inside a test harness and exercises the real
`useStaticCacheSync` implementation. The test file SHALL cover at
minimum:

- On mount, a `storage` event listener is registered on
  `globalThis`.
- On unmount, the same `storage` event listener is removed from
  `globalThis`.
- When a `storage` event fires with
  `event.key === 'brewform-static-cache-bust'`,
  `invalidateStaticCache()` is called.
- When a `storage` event fires with any other `event.key`,
  `invalidateStaticCache()` is **not** called.

#### Scenario: hook registers and removes the storage listener

- **WHEN** `useStaticCacheSync()` is mounted
- **THEN** a `storage` event listener is present on `globalThis`
- **WHEN** the component using `useStaticCacheSync()` unmounts
- **THEN** the same `storage` event listener is removed

#### Scenario: matching storage event triggers invalidation

- **GIVEN** `useStaticCacheSync()` is mounted
- **WHEN** a `storage` event is dispatched with
  `key: 'brewform-static-cache-bust'`
- **THEN** `invalidateStaticCache()` is called exactly once

#### Scenario: non-matching storage event does not trigger invalidation

- **GIVEN** `useStaticCacheSync()` is mounted
- **WHEN** a `storage` event is dispatched with
  `key: 'brewform-preferences'`
- **THEN** `invalidateStaticCache()` is **not** called

### Requirement: Mutation pages have JSDoc, a module logger, and mount/unmount debug logs

`apps/web/src/pages/equipment/EquipmentListPage.tsx`,
`apps/web/src/pages/admin/AdminEquipmentPage.tsx`, and
`apps/web/src/pages/admin/AdminTasteNotesPage.tsx` SHALL each:

- Import `createLogger` from `../../utils/logger.ts` and define a
  module-scoped `const log = createLogger('<PageName>')` at the
  top of the file.
- Add a `useEffect` hook that calls `log.debug({}, '<PageName>
  mounted')` on mount and `log.debug({}, '<PageName> unmounted')`
  on cleanup.
- Add a JSDoc block to every exported and modified handler function
  (`handleCreate`, `handleDelete`, `handleSubmit`) describing its
  purpose, parameters, and side effects (including the new
  `invalidateStaticCache()` call).
- Add `log.debug({ relevantIds }, '<handlerName> started')` at the
  top of each handler and
  `log.debug({ ids }, '<handlerName> completed')` after a
  successful mutation.

#### Scenario: mutation page logs mount and unmount

- **WHEN** `EquipmentListPage` mounts
- **THEN** the console receives a `debug`-level log with the
  message `EquipmentListPage mounted`
- **WHEN** `EquipmentListPage` unmounts
- **THEN** the console receives a `debug`-level log with the
  message `EquipmentListPage unmounted`
- **AND** the same pattern applies to `AdminEquipmentPage` and
  `AdminTasteNotesPage` with their respective names
