# D99 — Deferred Technical Debt (Post-Feature Batch)

**Severity:** Mixed (Low–Medium)
**Status:** Open (2026-07-09)
**Relationship:** Aggregates deferred items discovered during F01-recipe-collections implementation and other recent feature work. These are non-blocking polish/hardening tasks to tackle after all in-flight feature plans ship. Individual items may be split into their own D-plan files when picked up.

---

## D99.1 — Collection module has no cache layer

### Problem

The collection module (`apps/api/src/modules/collection/`) uses **zero caching**. Every read and write goes straight to Postgres with no `CacheProvider` involvement:

- `getCollection` — the heaviest query: joins `collections` + `user` + `items` (ordered by `sortOrder`) + nested `recipe` + `recipe.author` + latest `recipeVersions` (limit 1, desc by `versionNumber`) to surface `brewMethod`/`drinkType`. This runs on every `GET /api/v1/collections/:id` request with no cache.
- `listMyCollections` / `listPublicCollections` / `listAllPublicCollections` — paginated list queries with a batched `recipeCount` sub-query. No cache.
- `getCollectionsForRecipe` — called on `RecipeDetailPage` to show "collections containing this recipe". No cache.

This is the most notable caching gap vs. the two reference patterns in the codebase:

| Module | Cache pattern | Reference file |
|--------|---------------|----------------|
| Equipment | Entity-detail cache (`['equipment-detail', id]`) + invalidate-on-write | `apps/api/src/modules/equipment/service.ts` |
| Taste | Hierarchical list cache (`['cache', 'taste-notes']`) + `deleteByPrefix` sweep | `apps/api/src/modules/taste/service.ts` |

**Consequences:**
- The detail endpoint re-runs the full multi-join query on every request, including repeated views of the same public collection by different users (unauthenticated traffic on `GET /collections/public` and `GET /collections/:id` when visibility is public/unlisted).
- No invalidation is needed today (because there's no cache), but when caching is added, the five mutation paths (`create`, `update`, `delete`, `addRecipe`, `removeRecipe`, `reorder`) must all invalidate.

### Proposed Fix

Follow the **equipment** pattern for detail caching and the **taste** pattern for list caching.

#### 1. Detail cache (high value — single-key)

```ts
const COLLECTION_DETAIL_TTL_MS = 10 * 60 * 1000; // 10 min
const COLLECTION_DETAIL_KEY = (id: string) => ['collection-detail', id];

export async function getCollection(userId: string | null, collectionId: string) {
  const cached = await cacheProvider?.get<CollectionDetailOutput>(COLLECTION_DETAIL_KEY(collectionId));
  if (cached) {
    // visibility check still needed — cached detail may be private/draft
    if ((cached.visibility === 'private' || cached.visibility === 'draft') && cached.userId !== userId) {
      throw new Error('FORBIDDEN');
    }
    logger.debug({ collectionId }, 'getCollection cache hit');
    return cached;
  }
  // ... existing fetch ...
  await cacheProvider?.set(COLLECTION_DETAIL_KEY(collectionId), result, { ttlMs: COLLECTION_DETAIL_TTL_MS });
  return result;
}
```

**Invalidate** in: `updateCollection`, `deleteCollection`, `addRecipeToCollection`, `removeRecipeFromCollection`, `reorderCollection`.

```ts
await cacheProvider?.delete(COLLECTION_DETAIL_KEY(collectionId));
```

#### 2. List cache (medium value — prefix sweep)

```ts
const COLLECTION_LIST_PREFIX = ['cache', 'collections'];
const COLLECTION_LIST_TTL_MS = 5 * 60 * 1000; // 5 min (shorter — lists change more often)

// Key examples:
// ['cache', 'collections', 'my', userId, page, perPage, visibility ?? 'all']
// ['cache', 'collections', 'public', page, perPage]  // global browse
// ['cache', 'collections', 'user', targetUserId, page, perPage]  // per-user public
```

**Invalidate** via `deleteByPrefix` on any mutation:
```ts
await cacheProvider?.deleteByPrefix(COLLECTION_LIST_PREFIX);
```

#### 3. `getCollectionsForRecipe` cache (low value — skip or use a short TTL)

This is keyed by recipeId and invalidated when a recipe is added/removed from any collection. Given the cross-entity invalidation complexity, a short TTL (60s) or no cache is acceptable.

### Files to Change

| File | Change |
|------|--------|
| `apps/api/src/modules/collection/service.ts` | Import `cacheProvider` singleton (or accept `CacheProvider` param per taste pattern); add cache key constants + TTLs; wrap `getCollection` with cache-aside; invalidate detail key in all 5 mutation functions; wrap list functions with prefix-keyed cache; `deleteByPrefix` on mutations |
| `apps/api/src/modules/collection/index.ts` | No change needed if using singleton import; if switching to DI via `c.get('cache')`, pass `CacheProvider` into service calls |
| `apps/api/src/modules/collection/service_test.ts` | Add cache hit/miss tests (mock `InMemoryCacheProvider`); verify invalidation on mutations; verify visibility check still applies to cached private/draft collections |
| `apps/api/src/modules/collection/model.ts` | No change — cache lives in service layer |
| `apps/web/src/api/index.ts` | No change — caching is server-side only |

### Test Plan

- Unit tests in `service_test.ts`: cache miss → fetch → set; cache hit → return; mutation → key deleted; `deleteByPrefix` called.
- Integration tests in `index_test.ts`: repeated `GET /:id` — verify second call is a cache hit (can assert via log spy or by checking DB query count if instrumented).
- Verify visibility enforcement still works on cached entries: cache a private collection, request as non-owner → still 403.
- `make check && make lint && make test` pass.

### Acceptance Criteria

- [ ] `getCollection` serves cached detail within TTL without hitting Postgres
- [ ] All five mutation functions invalidate the detail cache key for the affected collection
- [ ] All five mutation functions invalidate the list cache prefix
- [ ] Visibility check (`FORBIDDEN` for private/draft when non-owner) still applies to cached results
- [ ] Cache tests cover hit, miss, invalidation, and visibility enforcement
- [ ] `make check && make lint && make test` pass

### Effort Estimate

**Medium** — ~4–6 hours: the cache-aside pattern is well-established (copy equipment), but the 5 mutation invalidation paths + visibility-check-on-cached-result edge case need careful testing.

---

## D99.2 — Frontend collection visibility selector omits `draft`

### Problem

`apps/web/src/pages/collections/CollectionEditPage.tsx` (lines 109–123) exposes a `<select>` with only three options: `private`, `unlisted`, `public`. The fourth visibility value, `draft`, is absent from the UI — even though:

- The API `CollectionUpdateSchema` accepts `draft` (`z.enum(VISIBILITY_VALUES)` includes all 4).
- The TypeScript cast on line 66 includes `'draft'` in its union.
- The i18n key `collection.visibility.draft` exists in both `en.json` and `tr.json`.
- The `CollectionCreatePage` likely has the same omission.

A user cannot move a collection back to `draft` via the UI once it has been set to another visibility. This is inconsistent with the API contract and the recipe module (where `draft` is a first-class visibility state).

### Proposed Fix

Add the missing `<option value='draft'>` to the visibility `<select>` in both `CollectionEditPage.tsx` and `CollectionCreatePage.tsx`:

```tsx
<option value='draft'>{t('collection.visibility.draft')}</option>
<option value='private'>{t('collection.visibility.private')}</option>
<option value='unlisted'>{t('collection.visibility.unlisted')}</option>
<option value='public'>{t('collection.visibility.public')}</option>
```

### Files to Change

| File | Change |
|------|--------|
| `apps/web/src/pages/collections/CollectionEditPage.tsx` | Add `<option value='draft'>` to visibility `<select>` |
| `apps/web/src/pages/collections/CollectionCreatePage.tsx` | Add `<option value='draft'>` to visibility `<select>` (if same omission exists) |
| `apps/web/src/pages/collections/CollectionEditPage.test.tsx` | Add test verifying all 4 visibility options are rendered |
| `apps/web/src/pages/collections/CollectionCreatePage.test.tsx` | Same (if a test file exists) |

### Test Plan

- Render `CollectionEditPage` with an existing collection → verify the `<select>` has 4 options (draft, private, unlisted, public).
- Change visibility to `draft` → submit → verify the PATCH payload includes `visibility: 'draft'`.
- `make check-web && make lint` pass.

### Acceptance Criteria

- [ ] Both edit and create pages expose all 4 visibility values in the `<select>`
- [ ] Selecting `draft` and submitting sends `visibility: 'draft'` to the API
- [ ] `make check && make lint && make test` pass

### Effort Estimate

**Low** — ~30 min: one `<option>` line per file + a test assertion.

---

## D99.3 — Collection reorder `sortOrder` is globally sequenced in seed (minor)

### Problem

`packages/db/src/seed.ts` `seedCollections` uses a single `collectionSortOrder` counter shared across all collections. This means items in later collections have higher `sortOrder` values (e.g. 50, 51, 52) rather than per-collection sequences (0, 1, 2). Functionally harmless (the API reorders by relative position, not absolute value), but makes manual DB inspection confusing and could mask reorder bugs in tests.

### Proposed Fix

Reset the counter per-collection:

```ts
for (const def of collectionDefs) {
  let collectionSortOrder = 0; // per-collection, not shared
  // ...
  for (const slug of recipesToAdd) {
    // ...
    await tx.insert(collectionItems).values({
      collectionId: collection.id,
      recipeId: recipe.id,
      sortOrder: collectionSortOrder++,
    })...
  }
}
```

### Files to Change

| File | Change |
|------|--------|
| `packages/db/src/seed.ts` | Move `let collectionSortOrder = 0` inside the per-collection loop |

### Acceptance Criteria

- [ ] Each seeded collection's items have `sortOrder` starting at 0 and incrementing per-collection
- [ ] `make test` passes (re-seed + existing tests)
- [ ] `make check && make lint` pass

### Effort Estimate

**Low** — ~10 min: move one variable declaration.

---

## D99.4 — OpenAPI `security` on public collection route (review note)

### Problem

The `GET /api/v1/collections/public` route was added with `security: []` in its `describeRoute` metadata. This is correct for the OpenAPI spec (the endpoint requires no auth), but it's worth verifying that `hono-openapi` renders `security: []` as "no security required" rather than "inherits global security" in the generated `/api/v1/openapi.json`. If the global security scheme is `bearerAuth`, an empty array should override it — but this should be confirmed by inspecting the generated spec.

### Proposed Fix

After `make dev`, fetch `/api/v1/openapi.json` and verify the `/collections/public` path has `"security": []` and no inherited `bearerAuth`. If it inherits, add an explicit per-route override or document the behavior.

### Acceptance Criteria

- [ ] `GET /collections/public` in `openapi.json` has no `bearerAuth` security requirement
- [ ] `openapi.coverage.test.ts` passes

### Effort Estimate

**Low** — ~15 min: one `curl` + spec inspection.