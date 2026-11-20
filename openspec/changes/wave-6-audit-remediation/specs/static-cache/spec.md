## MODIFIED Requirements

### Requirement: Cache invalidation propagates across browser tabs

`invalidateStaticCache()` SHALL clear the local cache slots and then write a cache-bust marker to `localStorage` under the key `brewform-static-cache-bust`, and receiving that marker in another tab SHALL clear that tab's slots without writing the marker again. The marker value SHALL be the result of `String(Date.now())` at the time of the call. The write SHALL be wrapped in a `try/catch` block; if `localStorage.setItem` throws (for example in Safari private mode), the error SHALL be swallowed and the same-tab invalidation SHALL still complete.

`apps/web/src/api/static-cache.ts` SHALL also export `clearStaticCache()`, which clears the local cache slots (including any in-flight lookup promises) and SHALL NOT write the marker. Mutation code SHALL call `invalidateStaticCache()`; the cross-tab listener SHALL call `clearStaticCache()`, so a received bust is never re-broadcast and two open tabs cannot ping-pong `storage` events.

The system SHALL provide a React hook `useStaticCacheSync()` in `apps/web/src/hooks/useStaticCacheSync.ts` that, when mounted, registers a `storage` event listener on `globalThis`. When the event's `key` is `brewform-static-cache-bust`, the listener SHALL call `clearStaticCache()` and SHALL NOT call `invalidateStaticCache()`. The hook SHALL remove the listener on unmount.

`useStaticCacheSync()` SHALL be mounted exactly once in `apps/web/src/App.tsx`, at the top of the `App()` function body, so the listener is active for the entire lifetime of the SPA.

#### Scenario: Same-tab mutation does not trigger useStaticCacheSync

- **WHEN** a user mutates equipment on Tab A
- **AND** `invalidateStaticCache()` is called in Tab A
- **THEN** the `storage` event does **not** fire in Tab A (browsers only dispatch `storage` in *other* tabs)
- **AND** Tab A's `useStaticCacheSync` listener does not fire
- **AND** Tab A's own `invalidateStaticCache()` call still nulls Tab A's cache

#### Scenario: Cross-tab mutation clears other tabs without re-broadcasting

- **WHEN** a user mutates taste notes in Tab A
- **AND** `invalidateStaticCache()` is called in Tab A
- **THEN** Tab B's `storage` event listener fires with `event.key === 'brewform-static-cache-bust'`
- **AND** Tab B's `useStaticCacheSync` calls `clearStaticCache()`
- **AND** Tab B's cache slots are nulled
- **AND** Tab B does not write `brewform-static-cache-bust`, so Tab A receives no further `storage` event
- **AND** on Tab B's next navigation to `/recipes`, the new taste note appears in the filter dropdown

#### Scenario: useStaticCacheSync ignores other storage events

- **WHEN** any other key in `localStorage` is updated (for example `brewform-preferences` from `useUnitSystem`)
- **THEN** the `useStaticCacheSync` listener is invoked
- **AND** the listener calls neither `clearStaticCache()` nor `invalidateStaticCache()` because `event.key !== 'brewform-static-cache-bust'`

#### Scenario: useStaticCacheSync is removed on app unmount

- **WHEN** the `App` component unmounts
- **THEN** the `storage` event listener is removed from `globalThis`
- **AND** no further `storage` events are routed to the cache clearing handler

#### Scenario: localStorage.setItem throw is swallowed

- **WHEN** `invalidateStaticCache()` is called
- **AND** `localStorage.setItem` throws (for example because storage is full or in private mode)
- **THEN** the error is caught and ignored
- **AND** the same-tab cache slots are still nulled
- **AND** no unhandled-promise-rejection or uncaught exception is surfaced

### Requirement: useStaticCacheSync is unit-tested

The system SHALL include a colocated Vitest test file `apps/web/src/hooks/useStaticCacheSync.test.ts` that renders the hook inside a test harness and exercises the real `useStaticCacheSync` implementation. The test file SHALL cover at minimum:

- On mount, a `storage` event listener is registered on `globalThis`.
- On unmount, the same `storage` event listener is removed from `globalThis`.
- When a `storage` event fires with `event.key === 'brewform-static-cache-bust'`, `clearStaticCache()` is called and `invalidateStaticCache()` is **not** called.
- Handling that event does not write `brewform-static-cache-bust` to `localStorage`.
- When a `storage` event fires with any other `event.key`, neither `clearStaticCache()` nor `invalidateStaticCache()` is called.

#### Scenario: hook registers and removes the storage listener

- **WHEN** `useStaticCacheSync()` is mounted
- **THEN** a `storage` event listener is present on `globalThis`
- **WHEN** the component using `useStaticCacheSync()` unmounts
- **THEN** the same `storage` event listener is removed

#### Scenario: matching storage event clears without re-broadcasting

- **GIVEN** `useStaticCacheSync()` is mounted
- **WHEN** a `storage` event is dispatched with `key: 'brewform-static-cache-bust'`
- **THEN** `clearStaticCache()` is called exactly once
- **AND** `invalidateStaticCache()` is not called
- **AND** `localStorage.setItem` is not called with `brewform-static-cache-bust`

#### Scenario: non-matching storage event does not trigger clearing

- **GIVEN** `useStaticCacheSync()` is mounted
- **WHEN** a `storage` event is dispatched with `key: 'brewform-preferences'`
- **THEN** neither `clearStaticCache()` nor `invalidateStaticCache()` is called
