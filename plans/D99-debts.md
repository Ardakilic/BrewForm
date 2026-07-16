# D99 — Deferred Technical Debt (Post-Feature Batch)

**Severity:** Mixed (Low–Medium)
**Status:** Open — revised 2026-07-13 (D99.2 resolved; D99.4 reframed; added D99.5–D99.8)
**Relationship:** Aggregates deferred items discovered during F01-recipe-collections implementation and other recent feature work. These are non-blocking polish/hardening tasks to tackle after all in-flight feature plans ship. Individual items may be split into their own D-plan files when picked up.

---

## D99.1 — Collection module has no cache layer

### Problem

The collection module (`apps/api/src/modules/collection/`) uses **zero caching**. Every read and write goes straight to Postgres with no `CacheProvider` involvement:

- `getCollection` — the heaviest query: joins `collections` + `user` + `items` (ordered by `sortOrder`) + nested `recipe` + `recipe.author` + latest `recipeVersions` (limit 1, desc by `versionNumber`) to surface `brewMethod`/`drinkType`. This runs on every `GET /api/v1/collections/:id` request with no cache.
- `listMyCollections` / `listPublicCollections` / `listAllPublicCollections` — paginated list queries with a batched `recipeCount` sub-query. No cache.
- `getCollectionsForRecipe` — called on `RecipeDetailPage` to show "collections containing this recipe". No cache.

This is the most notable caching gap vs. the two reference patterns in the codebase:

| Module | Cache pattern | Wiring style | Reference file |
|--------|---------------|--------------|----------------|
| Equipment | Entity-detail cache (`['equipment-detail', id]`) + invalidate-on-write | **Singleton import** — `import { cacheProvider } from '../../utils/cache/singleton.ts'` (service.ts:4), optional-chained `cacheProvider?.get/set/delete` (:32,:42,:108) | `apps/api/src/modules/equipment/service.ts` |
| Taste | Hierarchical list cache (`['cache', 'taste-notes']`) + `deleteByPrefix` sweep | **DI param** — service functions take `cache: CacheProvider` (service.ts:25,88,…), injected from the router via `c.get('cache')` | `apps/api/src/modules/taste/service.ts` |

Note (2026-07-13 audit): the two reference modules differ only in *how* the provider is obtained — a module-level singleton import (equipment) vs. a `CacheProvider` DI parameter threaded from `c.get('cache')` (taste). Both are valid and idiomatic; this plan already permits either (see "Files to Change" for `index.ts`). Equipment's singleton import is the lower-friction choice for the collection service since it needs no router-signature changes.

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

## D99.2 — Frontend collection visibility selector omits `draft` — ✅ Resolved (2026-07-13)

> **Resolved 2026-07-13 (found already fixed during the audit).** Both pages now render the `draft` option:
> `CollectionCreatePage.tsx:86` and `CollectionEditPage.tsx:119` each emit `<option value='draft'>{t('collection.visibility.draft')}</option>` ahead of private/unlisted/public, and both cast to the full 4-value union (`'private' | 'unlisted' | 'public' | 'draft'`). No action remains; the test-coverage follow-up is tracked under **D99.6**. The original problem statement is retained below for history.

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

## D99.4 — OpenAPI `security: []` on public collection route (trivial consistency choice)

### Finding (reframed 2026-07-13)

Originally logged as a spec-correctness risk ("does `security: []` override global security?"). The audit resolves it: **there is no risk, only an inconsistency.** `apps/api/src/routes/openapi.ts` declares `bearerAuth` **only** under `components.securitySchemes` (openapi.ts:51-57) and sets **no top-level `security` requirement** on the document. With no global security to inherit, `security: []` on `GET /api/v1/collections/public` (`collection/index.ts:113` — the *only* `security: []` occurrence in the codebase) and simply omitting the key are functionally identical. Every other public route (health probes, other unauthenticated GETs) omits the key entirely.

So this is not a correctness question; it is a style choice. The lone `security: []` is a harmless outlier against the repo's "omit for public routes" convention.

### Proposed Fix

Optional cleanup: drop `security: []` from `collection/index.ts:113` to align with the omission convention used by the other public routes. No behavioral change, no regeneration risk. Leave as-is if a future decision is to add a global `security` requirement (at which point `security: []` becomes the correct explicit override and should be added back to *all* public routes).

### Acceptance Criteria

- [ ] `collection/index.ts` public route matches the codebase convention (either all public routes omit `security`, or all explicitly set `security: []` — currently only this one sets it)
- [ ] `openapi.coverage.test.ts` still passes

### Effort Estimate

**Trivial** — ~5 min: delete one line (or consciously keep it).

---

## D99.5 — Surface collections on `RecipeDetailPage` (F01 US-9 gap)

### Problem

F01 US-9 ("see which collections contain this recipe") is only half-built. The model function exists and is unit-tested — `getCollectionsForRecipe(recipeId)` (`apps/api/src/modules/collection/model.ts:255`, tested at `collection/model_test.ts:626` and exercised at :666/:676) — but **nothing consumes it**: there is no service function, no route, and no UI. `RecipeDetailPage` only offers the `AddToCollectionButton` (write path); it never shows the collections a recipe already belongs to. Grep confirms `getCollectionsForRecipe` appears only in `model.ts` and `model_test.ts`.

### Proposed Fix

1. **Service passthrough** in `collection/service.ts` — wrap `model.getCollectionsForRecipe`, visibility-filtered to the viewer (return only `public`/`unlisted` collections, plus the viewer's own `private`/`draft`), mirroring the visibility logic already used elsewhere in the module.
2. **Route** — either `GET /api/v1/recipes/:id/collections` (new endpoint with `describeRoute` + a response schema) or fold the list into the recipe-detail loader payload so the page renders it without a second request.
3. **UI** — a "In collections" section on `RecipeDetailPage`, linking each collection to its detail page.
4. **Tests** — service visibility filtering (owner sees own private; non-owner does not), route/integration, and a page render test.

### Files to Change

| File | Change |
|------|--------|
| `apps/api/src/modules/collection/service.ts` | Add visibility-filtered `getCollectionsForRecipe` passthrough |
| `apps/api/src/modules/collection/index.ts` *or* `recipe/index.ts` | Expose the endpoint (or thread into the recipe-detail loader) with schema |
| `packages/shared/src/schemas/collection.ts` | Response schema for the recipe→collections list |
| `apps/web/src/pages/recipes/RecipeDetailPage.tsx` | Render an "In collections" section |
| `*_test.ts` / `*.test.tsx` | Service visibility, route, and page tests |

### Acceptance Criteria

- [ ] A viewer sees the public/unlisted collections a recipe belongs to (plus their own private/draft), never others' private collections
- [ ] `RecipeDetailPage` renders the list with links to each collection
- [ ] `make check && make lint && make test` pass

### Effort Estimate

**Low–Medium** — the model + test already exist; work is service filter + route/loader + one UI section + tests.

---

## D99.6 — Missing collection page tests

### Problem

Three collection pages ship without tests: `CollectionCreatePage.tsx`, `CollectionEditPage.tsx`, and `CollectionListPage.tsx` have no `*.test.tsx`. By contrast `CollectionDetailPage` (`CollectionDetailPage.test.tsx`), `CollectionsBrowsePage` (`CollectionsBrowsePage.test.tsx`), and the `CollectionRecipeList` component (`components/collections/CollectionRecipeList.test.tsx`) are covered. The gap also leaves the D99.2 `draft`-option fix (create/edit visibility selectors) unguarded by a regression test.

### Proposed Fix

Add `CollectionCreatePage.test.tsx`, `CollectionEditPage.test.tsx`, and `CollectionListPage.test.tsx` covering: form render from loader data, the 4-option visibility selector (locks in D99.2), submit → PATCH/POST payload shape, and empty/list states.

### Files to Change

| File | Change |
|------|--------|
| `apps/web/src/pages/collections/CollectionCreatePage.test.tsx` | New — render + submit + 4 visibility options |
| `apps/web/src/pages/collections/CollectionEditPage.test.tsx` | New — render from loader + submit + 4 visibility options |
| `apps/web/src/pages/collections/CollectionListPage.test.tsx` | New — list + empty state |

### Acceptance Criteria

- [ ] All three pages have tests; visibility-selector tests assert all 4 values render
- [ ] `make check && make lint && make test` pass

### Effort Estimate

**Low** — three straightforward render/submit test files following the existing Detail/Browse test patterns.

---

## D99.7 — i18n stragglers outside D40's declared scope

### Problem

D40 completed the declared i18n scope, but a sweep on 2026-07-13 found hardcoded English strings still outside it. Line numbers below are freshly re-cited (they drifted ≈+1 from earlier notes after directive deletions).

**Hardcoded input placeholders (English literals):**
- `apps/web/src/pages/auth/RegisterPage.tsx:171,186,247` (`'Coffee Lover'`, `'At least 8 characters'`, `'Re-enter your password'`)
- `apps/web/src/pages/auth/LoginPage.tsx:91` (`'Enter your password'`)
- `apps/web/src/pages/auth/ResetPasswordPage.tsx:114,131` (`'At least 8 characters'`, `'Re-enter your new password'`)
- `apps/web/src/pages/beans/BeanListPage.tsx:138,153,168` (`'Ethiopia, Colombia...'`, `'Washed, Natural, Honey...'`, `'Light, Medium, Dark...'`)
- `apps/web/src/pages/setups/SetupListPage.tsx:107,122,137` (`'My V60 Setup'`, `'May 2024 batch'`, `'Niche Zero'`)

**Hardcoded `aria-label` / SEO strings:**
- `apps/web/src/pages/recipes/RecipeDetailPage.tsx:279` (`aria-label='Preparation notes'`)
- `apps/web/src/pages/recipes/RecipeFocusModePage.tsx:166` (`aria-label='Preparation notes'`)
- `apps/web/src/pages/recipes/useCoffeeVarietyFilter.tsx` (~:171), `apps/web/src/pages/recipes/RecipeNotAvailablePage.tsx` (~:13), `apps/web/src/pages/coffee-varieties/CoffeeVarietyDetailPage.tsx:128` and `apps/web/src/pages/equipment/EquipmentDetailPage.tsx:97` (both `aria-label='Breadcrumb'`)

(A few refs may still drift ±2 as pages change; grep the literal before editing.)

### Proposed Fix

Route each literal through `t()` with a new key in `packages/shared/src/i18n/en.json` + `tr.json`. Placeholders under `*.placeholder` keys; aria/SEO under `a11y.*` (or the page's namespace).

### Acceptance Criteria

- [ ] Listed placeholders and aria/SEO strings are translated via `t()` with en + tr keys
- [ ] `make check && make lint && make test` pass

### Effort Estimate

**Low–Medium** — mechanical, but spread across ~9 files with matching en/tr key additions.

---

## D99.8 — Cursor keyset predicate sargability (scale-time note)

### Problem

`buildCursorWhere` in `apps/api/src/modules/recipe/model.ts:885-903` expresses the keyset predicate in OR form:

```ts
or(
  lt(recipes.createdAt, createdAtValue),
  and(eq(recipes.createdAt, createdAtValue), lt(recipes.id, id)),
)
```

This is only **single-column sargable**: Postgres can use `recipe_created_at_id_idx` (`schema.ts:173`, `(created_at DESC, id DESC)`) for the leading `created_at` comparison but not as a true two-column range seek. A row-value rewrite — `(created_at, id) < ($1, $2)` — lets the planner seek the composite index fully. Drizzle has no first-class row-value comparison, so this needs a raw-SQL fragment, which is a **D03 raw-SQL exception** (documented deviation from the drizzle-only model layer).

Not a problem at current cardinality: `EXPLAIN ANALYZE` on 2026-07-13 shows a seq scan over ~20 rows (expected — the planner won't index-seek a tiny table). Deferred until data volume makes the index seek worthwhile.

### Proposed Fix (when scale demands)

Replace the OR predicate with a raw row-value comparison (`sql\`(${recipes.createdAt}, ${recipes.id}) < (${createdAtValue}, ${id})\``, direction-flipped for ASC), gated behind a D03 raw-SQL exception note, and re-verify with `EXPLAIN ANALYZE` on a populated table that it index-seeks `recipe_created_at_id_idx`.

### Acceptance Criteria

- [ ] (Deferred) Row-value keyset predicate index-seeks `recipe_created_at_id_idx` on a populated table, verified by `EXPLAIN ANALYZE`
- [ ] Raw-SQL use recorded as a D03 exception
- [ ] `make check && make lint && make test` pass

### Effort Estimate

**Low** — a few-line predicate rewrite; deferred purely on cardinality (no action needed at current scale).
---

## D99.9 — Comment creation is not visibility-gated (recipe-title disclosure via mentions)

### Problem

`createComment` (`apps/api/src/modules/comment/service.ts`) never checks the target recipe's
`visibility` (recipes support `draft`/`private`/`unlisted`/`public`). Anyone holding a recipe UUID
can comment on a non-public recipe. Pre-F04 this was a latent authZ gap with no third-party
consequence; F04's mention flow now forwards the recipe's `title` and `slug` to any mentioned
user (in-app record + email), so a comment on a private recipe can disclose its title/slug to a
third party chosen by the commenter. Exploitability is low (the commenter must already possess the
recipe UUID and is voluntarily sharing), flagged by the 2026-07-13 F04 security review as a
follow-up rather than a blocker.

### Proposed Fix

Decide and enforce comment authZ in `createComment` (and the comment list route for parity):
likely "only users who can view the recipe may comment" — reuse the recipe visibility check used
by `getRecipe` (owner or admin for `draft`/`private`; anyone with link for `unlisted`; everyone
for `public`). Return 404 (not 403) for invisible recipes to avoid existence disclosure. Add
service tests for each visibility × commenter-role combination.

### Acceptance Criteria

- [ ] Commenting on a recipe the user cannot view is rejected (404) at the service layer
- [ ] Comment list route applies the same gate
- [ ] Mention side effects never fire for rejected comments (they already sit behind creation)
- [ ] Tests cover all visibility/role combinations
- [ ] `make check && make lint && make test` pass

### Effort Estimate

**Low–Medium** — ~2–3 hours: one guard + route parity + a test matrix; the visibility predicate
already exists in the recipe module.
