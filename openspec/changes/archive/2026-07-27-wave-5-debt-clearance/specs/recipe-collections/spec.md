## ADDED Requirements

### Requirement: Collection reads are cache-backed with a visibility re-check on cached hits

The collection module SHALL wire read caching through the `cacheProvider` singleton import (the
`equipment/service.ts` pattern — get `:32`, set `:42`, delete `:108/:127`), directly in
`apps/api/src/modules/collection/service.ts`. No `CacheProvider` DI parameter and no
`c.get('cache')` plumbing SHALL be introduced (taste's "DI" is itself singleton-fed at
`taste/index.ts:21`; `c.get('cache')` is read nowhere in the codebase). The cache contract:

| Concern              | Choice                                                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Detail key           | `['collection-detail', id]`, TTL **10 minutes**                                                                                                 |
| Cached-hit safety    | replay the `service.ts:157-162` visibility check against the cached object (`toDetailOutput` retains `userId`/`visibility` in the cached shape) |
| List prefix          | `['cache', 'collections', ...]`, TTL **5 minutes**                                                                                              |
| `recipeId` handling  | when `listMyCollections` is called with its optional `recipeId` param, **bypass the cache** (read through, no store)                            |
| `createCollection`   | invalidates the **list prefix only** (fresh UUID — no detail entry can exist)                                                                   |
| Other five mutations | invalidate the detail key `['collection-detail', id]` **and** `deleteByPrefix(['cache', 'collections'])`                                        |

The mutation surface is SIX functions, not five: `createCollection` (`service.ts:97`),
`updateCollection` (`:114`), `deleteCollection` (`:136`), `addRecipeToCollection` (`:255`),
`removeRecipeFromCollection` (`:297`), `reorderCollection` (`:319`). A cache hit SHALL never widen
access: a cached `private`/`draft` collection requested by a non-owner throws `FORBIDDEN` exactly
as a cache miss would.

**Reason:** D99.1 — the collection module has zero cache involvement; `getCollection` re-runs the
4-level multi-join (`collection/model.ts:9-33`) on every GET. The visibility re-check is the
load-bearing security line (design.md Decision 5, Risk 3); the `recipeId` bypass avoids a
per-(user, recipe) key with near-zero hit rate.

#### Scenario: Detail read is served from cache within TTL

- **WHEN** `getCollection` is called twice for the same public collection within 10 minutes
- **THEN** the second call returns the cached `CollectionDetailOutput` without re-running the
  model's multi-join (asserted by swapping the provider via the test hook and counting model calls)

#### Scenario: Cached hit does not widen access

- **WHEN** the owner populates the detail cache for a `private` collection and a different user
  then requests the same collection id (cache hit)
- **THEN** the service throws `new Error('FORBIDDEN')` — identical to the cache-miss behaviour of
  `service.ts:157-162`

#### Scenario: All six mutations invalidate correctly

- **WHEN** each of the six mutations runs against a collection with warm detail and list caches
- **THEN** `createCollection` deletes the list prefix only, and the other five delete
  `['collection-detail', id]` AND `deleteByPrefix(['cache', 'collections'])`, so the next read
  reflects the mutation

#### Scenario: recipeId-scoped list bypasses the cache

- **WHEN** `listMyCollections(userId, page, perPage, visibility, recipeId)` is called with
  `recipeId` set (the AddToCollectionModal membership-marks path)
- **THEN** the result is read from the database and NOT stored in the cache, and a subsequent
  no-`recipeId` list call is unaffected by it

### Requirement: Collections containing a recipe are surfaced on the recipe detail page

The US-9 read path SHALL be completed end-to-end. `getCollectionsForRecipe`
(`apps/api/src/modules/collection/model.ts:287`) — today model-only with zero production consumers
(no service function, no route, no web API method, no page section) — SHALL gain:

1. **Model filter widening:** the hard-coded `visibility = 'public'` WHERE clause (`model.ts:304`)
   SHALL become "public + the viewer's own collections of any visibility" (an optional `userId`
   parameter). Unlisted collections of OTHER users SHALL NOT be listed (unlisted means
   direct-link-only per `visibility.ts:4`; listing them on a recipe page would leak them). The
   existing `model_test.ts:626/666/676` assertions SHALL be extended for the new parameter — not
   deleted.
2. **Service passthrough:** a visibility-filtered `collection/service.ts` function that passes the
   caller's `userId` to the model.
3. **Read surface:** either a documented GET route or a loader-fold into the recipe detail loader
   (`RecipeDetailPage.tsx:57-80` — the loader resolves the recipe first for `recipe.id`, then runs
   a `Promise.all` for taste notes + comments; the fold adds one more parallel fetch and extends
   `DetailLoaderData` at `:45-49`).
4. **UI:** an "In collections" section on `RecipeDetailPage` rendering the containing collections
   (name + link), with i18n'd heading (en+tr keys).

**Reason:** D99.5 — the archived F01 change deferred this as optional task 11.6; the function is
integration-tested but dead. The filter policy follows the codebase's listing convention
(public-only for non-owners, `service.ts:196-201`, `index.ts:573-582`).

#### Scenario: Visitor sees only public collections containing the recipe

- **WHEN** an unauthenticated user views a recipe that is in one `public` and one `unlisted`
  collection (both owned by others)
- **THEN** the "In collections" section lists only the `public` collection

#### Scenario: Viewer's own private collections are included

- **WHEN** an authenticated user views a recipe they have added to their own `private` collection
- **THEN** that private collection appears in the user's own "In collections" view alongside any
  public collections, and it does NOT appear for any other viewer

#### Scenario: Extended model tests pass

- **WHEN** `make test-api` runs `collection/model_test.ts` after the WHERE change
- **THEN** the pre-existing `getCollectionsForRecipe` assertions (`:626-676`) still pass, extended
  with the viewer-own-visibility cases

### Requirement: Collection Create, Edit, and List pages have Vitest coverage

The three untested collection pages SHALL each have a co-located test file following the
`CollectionDetailPage.test.tsx` pattern (hoisted `vi.mock` of `../../api/index.ts` with
`collectionApi` stubs + fake `ApiError`; mocked `I18nContext`/`AuthContext`/`@/utils/logger.ts`;
rendering via `createMemoryRouter` + `RouterProvider` with `HydrateFallback`;
`beforeEach(() => vi.clearAllMocks())`):

| Page | Test file | Minimum coverage |
|---|---|---|
| `apps/web/src/pages/collections/CollectionCreatePage.tsx` | `CollectionCreatePage.test.tsx` | form renders; submit calls `collectionApi.create({name, visibility, description?})` then navigates to `/collections/${created.id}` (`:33-40`); the visibility select offers all 4 options `draft/private/unlisted/public` (`:86-89` — the D99.2 regression lock) |
| `apps/web/src/pages/collections/CollectionEditPage.tsx` | `CollectionEditPage.test.tsx` | `loader` (`:19-37`) maps a 404 `ApiError` to a thrown 404 `Response`; form pre-fills from `useLoaderData` (`:46-48`); submit calls `collectionApi.update` with `description` included only when changed (`:63-70`); 4-option select (`:119-122`) |
| `apps/web/src/pages/collections/CollectionListPage.tsx` | `CollectionListPage.test.tsx` | `loader` calls `collectionApi.list()` (`:20-30`); renders title + `/collections/new` link (`:53`); empty state `collection.list.noResults` (`:61`); `CollectionCard` grid (`:66-68`) |

**Reason:** D99.6 — these three pages have no tests AND are invisible to Vitest coverage (never
imported by any test), so the gap does not even show in the coverage numbers. The F01 spec's
test-coverage requirement listed `CollectionListPage.test.tsx` but it never landed.

#### Scenario: Three new page test files exist and pass

- **WHEN** `deno task --cwd apps/web test` runs after the change
- **THEN** `CollectionCreatePage.test.tsx`, `CollectionEditPage.test.tsx`, and
  `CollectionListPage.test.tsx` all exist next to their pages and pass with zero failures

#### Scenario: Pages become visible to coverage

- **WHEN** the web coverage report is generated after the tests land
- **THEN** all three pages appear in the report with non-zero coverage (they are imported by their
  tests, closing the invisible-file gap for the collections section)

## MODIFIED Requirements

### Requirement: Seed data for collections

The system SHALL add a `seedCollections(tx, createdUsers, createdRecipes)` helper to
`packages/db/src/seed.ts` that:
- Creates 1–2 sample collections per seeded user with `visibility: 'public'`
- Adds 2–3 seeded recipes to each collection
- Gives each seeded collection a stable seed-derived name (e.g. `` `${username}'s Favourites` ``) that is used as the lookup key, so collection rows are idempotent — existing collections are selected and reused (not re-inserted) before items are added
- Is idempotent on BOTH collection rows (select-and-reuse on `(userId, name)` excluding soft-deleted rows) and collection_item rows (`onConflictDoNothing({ target: [collectionItems.collectionId, collectionItems.recipeId] })` on the composite unique key)
- Uses the select-and-reuse pattern to resolve FK IDs from the `createdUsers` and `createdRecipes` maps
- Is called from `main()` inside the `db.transaction` block after `seedRecipes`
- Does NOT break the `if (import.meta.main)` guard
- Assigns `sortOrder` **per collection**: each collection's items are numbered `0..n-1` in
  insertion order, resetting for every collection. A single function-scoped counter running
  monotonically across all collections of all users (the shipped `let collectionSortOrder = 0` at
  `seed.ts:845` consumed as `collectionSortOrder++` at `:918`) is a violation of this requirement.
- Is covered by a seed test: the seed test suite SHALL import `collections`/`collectionItems` and
  assert that every seeded collection's item `sortOrder` values are exactly `0..n-1` (the current
  `seed.idempotent.test.ts` imports many tables at `:15-39` but neither collection table and
  mentions "collection" zero times).

Because item inserts are `onConflictDoNothing`, the per-collection numbering only manifests on a
fresh database — re-seeding an existing database does not rewrite previously-inserted wrong
`sortOrder` values. The seed-test assertion therefore runs against the freshly-seeded CI database.

#### Scenario: Seed is idempotent

- **WHEN** `make db-seed` runs twice in succession
- **THEN** the second run does not error on the unique constraint
- **AND** the collection and collection_item row counts are unchanged

#### Scenario: Each collection's items start at sortOrder 0

- **WHEN** the seed runs on a fresh database
- **THEN** for every seeded collection, the item `sortOrder` values are exactly `0..n-1` (first
  item 0), with no collection starting at a carried-over global counter value

#### Scenario: Seed test locks the per-collection numbering

- **WHEN** `deno task test:db` runs on a freshly-seeded test database
- **THEN** the collections seed assertion passes, and it fails if the global-counter regression is
  reintroduced
