# D99 — Deferred Technical Debt (Post-Feature Batch)

**Severity:** Mixed (Low–High)
**Status:** D99.1–.19 resolved 2026-07-27 (wave-5-debt-clearance resolved D99.1,.3,.5,.6,.7,.9,.10–.16,.19; remaining-debt-clearance resolved D99.4,.8,.17,.18). **D99.20–.62 open** since 2026-11-21: deferrals and unowned findings of `wave-6-audit-remediation` (2026-11-18 audit); see [Wave-6 follow-ups](#wave-6-follow-ups-d9920) and the status table in [`ROADMAP.md`](ROADMAP.md).
**Relationship:** Aggregates deferred items discovered during F01-recipe-collections implementation, other recent feature work, the 2026-07-19 full audit (D99.10–D99.19) and the 2026-11-18 audit ([`AUDIT-2026-11-18.md`](AUDIT-2026-11-18.md), D99.20+). These are non-blocking polish/hardening tasks; items marked **Scheduled** are carried by the `wave-5-debt-clearance` OpenSpec change (which holds the full task-level detail — this ledger is the index), items marked **Deferred** wait for a future trigger. Individual items may be split into their own D-plan files when picked up.

---

## D99.1 — Collection module has no cache layer — ✅ Resolved (2026-07-27, wave-5-debt-clearance T2)

**Scheduled:** wave-5-debt-clearance (Track 2).

### Problem

The collection module (`apps/api/src/modules/collection/`) uses **zero caching**. Every read and write goes straight to Postgres with no `CacheProvider` involvement:

- `getCollection` — the heaviest query: joins `collections` + `user` + `items` (ordered by `sortOrder`) + nested `recipe` + `recipe.author` + latest `recipeVersions` (limit 1, desc by `versionNumber`) to surface `brewMethod`/`drinkType`. This runs on every `GET /api/v1/collections/:id` request with no cache.
- `listMyCollections` / `listPublicCollections` / `listAllPublicCollections` — paginated list queries with a batched `recipeCount` sub-query. No cache. Note `listMyCollections` takes an optional `recipeId` param (`service.ts:177-183`) that toggles per-row `containsRecipe` flags — any list cache key must include it (or bypass the cache when it is set).
- `getCollectionsForRecipe` — *prospective*: today this exists only in `collection/model.ts:287` with no service/route/UI consumer (see D99.5); once D99.5 wires it to `RecipeDetailPage`, it becomes a cache candidate. No cache.

This is the most notable caching gap vs. the reference patterns in the codebase (correction 2026-07-19: "the two reference patterns" was understated — beyond equipment and taste, `coffee-variety/service.ts:3,24`, `routes/sitemap.ts:7,155,185`, `recipe/index.ts:25`, and `admin/index.ts:32` also cache):

| Module | Cache pattern | Wiring style | Reference file |
|--------|---------------|--------------|----------------|
| Equipment | Entity-detail cache (`['equipment-detail', id]`) + invalidate-on-write | **Singleton import** — `import { cacheProvider } from '../../utils/cache/singleton.ts'` (service.ts:4), optional-chained `cacheProvider?.get/set/delete` (:32,:42,:108; delete also at :127) | `apps/api/src/modules/equipment/service.ts` |
| Taste | Hierarchical list cache (`['cache', 'taste-notes']`) + `deleteByPrefix` sweep | **Singleton passed as param** — service functions take `cache: CacheProvider`, but `taste/index.ts:21` imports the singleton and passes `cacheProvider!` directly | `apps/api/src/modules/taste/service.ts` |

Note (corrected 2026-07-19): the earlier claim that taste's cache is "injected from the router via `c.get('cache')`" is stale — `taste/index.ts:21` imports the singleton and passes `cacheProvider!` into the service functions directly. `c.get('cache')` appears **nowhere** in the codebase as a read (`main.ts:72` sets it; nothing reads it). In practice both reference modules resolve to the singleton; equipment's direct singleton import is the lower-friction choice for the collection service since it needs no signature changes.

**Consequences:**
- The detail endpoint re-runs the full multi-join query on every request, including repeated views of the same public collection by different users (unauthenticated traffic on `GET /collections/public` and `GET /collections/:id` when visibility is public/unlisted).
- No invalidation is needed today (because there's no cache), but when caching is added, the **six** mutation functions (`create`, `update`, `delete`, `addRecipe`, `removeRecipe`, `reorder`) must all invalidate (an earlier revision said "five paths" while listing six names): `create` needs list-prefix invalidation only (no detail entry can exist yet); the other five need detail-key + list-prefix invalidation.

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
// ['cache', 'collections', 'my', userId, page, perPage, visibility ?? 'all', recipeId ?? 'none']
//   — recipeId (service.ts:177-183) MUST be in the key (or bypass cache when set):
//     it drives per-row containsRecipe flags, and a recipeId-blind key serves stale/wrong flags
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
| `apps/api/src/modules/collection/service.ts` | Import `cacheProvider` singleton (equipment pattern); add cache key constants + TTLs; wrap `getCollection` with cache-aside; invalidate detail key in the 5 non-create mutation functions; wrap list functions with prefix-keyed cache (recipeId-aware `my` key); `deleteByPrefix` on all 6 mutations |
| `apps/api/src/modules/collection/index.ts` | No change needed with the singleton import (note: the `c.get('cache')` DI route mentioned in earlier revisions is unused anywhere in the codebase) |
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
- [ ] The five non-create mutation functions invalidate the detail cache key for the affected collection
- [ ] All six mutation functions (including `create`) invalidate the list cache prefix
- [ ] `listMyCollections` cache key includes `recipeId` (or bypasses cache when `recipeId` is set) — `containsRecipe` flags are never stale
- [ ] Visibility check (`FORBIDDEN` for private/draft when non-owner) still applies to cached results
- [ ] Cache tests cover hit, miss, invalidation, and visibility enforcement
- [ ] `make check && make lint && make test` pass

### Effort Estimate

**Medium** — ~4–6 hours: the cache-aside pattern is well-established (copy equipment), but the six mutation invalidation paths (detail key on five, list prefix on all six) + visibility-check-on-cached-result edge case need careful testing.

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

## D99.3 — Collection reorder `sortOrder` is globally sequenced in seed (minor) — ✅ Resolved (2026-07-27, wave-5-debt-clearance T2)

**Scheduled:** wave-5-debt-clearance (Track 2). Re-verified open 2026-07-19 (entry text matches current code; no drift).

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

- [ ] Each seeded collection's items have `sortOrder` starting at 0 and incrementing per-collection **on a fresh database** (the item insert uses `onConflictDoNothing` — `seed.ts:919-921` — so re-seeding an existing DB does not renormalize previously seeded rows)
- [ ] `make test` passes (re-seed + existing tests)
- [ ] `make check && make lint` pass

### Effort Estimate

**Low** — ~10 min: move one variable declaration.

---

## D99.4 — OpenAPI `security: []` on public collection route (trivial consistency choice) — ✅ Resolved (2026-07-27, remaining-debt-clearance)

> **Resolved 2026-07-27 (remaining-debt-clearance).** Removed lone `security: []` from collection/index.ts — aligned with omit convention.

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

## D99.5 — Surface collections on `RecipeDetailPage` (F01 US-9 gap) — ✅ Resolved (2026-07-27, wave-5-debt-clearance T2)

**Scheduled:** wave-5-debt-clearance (Track 2).

### Problem

F01 US-9 ("see which collections contain this recipe") is only half-built. The model function exists and is unit-tested — `getCollectionsForRecipe(recipeId)` (`apps/api/src/modules/collection/model.ts:287`, JSDoc at :286; tested at `collection/model_test.ts:626` and exercised at :666/:676) — but **nothing consumes it**: there is no service function, no route, and no UI. `RecipeDetailPage` only offers the `AddToCollectionButton` (write path); it never shows the collections a recipe already belongs to. Grep confirms `getCollectionsForRecipe` appears only in `model.ts` and `model_test.ts`.

### Proposed Fix

1. **Service passthrough** in `collection/service.ts` — wrap `model.getCollectionsForRecipe`, visibility-filtered to the viewer: return **public collections plus the viewer's own collections of any visibility** (corrected 2026-07-19 — the earlier "public/unlisted plus own private/draft" wording was wrong on two counts: including `unlisted` contradicts its direct-link-only semantics, `packages/shared/src/constants/visibility.ts:4`, and the module's existing listing convention where non-owners see public only — `service.ts:196-201`, `index.ts:573-582`). Note this **cannot** be a pure service-level filter: `model.getCollectionsForRecipe` already restricts to `visibility='public'` in SQL (`model.ts:304`), so the model WHERE clause must change (or a `viewerId` param be added) for anything beyond public to be returned.
2. **Route** — either `GET /api/v1/recipes/:id/collections` (new endpoint with `describeRoute` + a response schema) or fold the list into the recipe-detail loader payload so the page renders it without a second request.
3. **UI** — a "In collections" section on `RecipeDetailPage`, linking each collection to its detail page.
4. **Tests** — service visibility filtering (owner sees own private; non-owner does not), route/integration, and a page render test.

### Files to Change

| File | Change |
|------|--------|
| `apps/api/src/modules/collection/model.ts` | Widen the `visibility='public'` WHERE clause (`model.ts:304`) — take a nullable `viewerId` and include the viewer's own collections of any visibility |
| `apps/api/src/modules/collection/service.ts` | Add visibility-filtered `getCollectionsForRecipe` passthrough |
| `apps/api/src/modules/collection/index.ts` *or* `recipe/index.ts` | Expose the endpoint (or thread into the recipe-detail loader) with schema |
| `packages/shared/src/schemas/collection.ts` | Response schema for the recipe→collections list |
| `apps/web/src/pages/recipes/RecipeDetailPage.tsx` | Render an "In collections" section |
| `*_test.ts` / `*.test.tsx` | Service visibility, route, and page tests |

### Acceptance Criteria

- [ ] A viewer sees the public collections a recipe belongs to, plus their own collections of any visibility — never anyone else's non-public collections
- [ ] `RecipeDetailPage` renders the list with links to each collection
- [ ] `make check && make lint && make test` pass

### Effort Estimate

**Low–Medium** — the model + test already exist; work is service filter + route/loader + one UI section + tests.

---

## D99.6 — Missing collection page tests — ✅ Resolved (2026-07-27, wave-5-debt-clearance T2)

**Scheduled:** wave-5-debt-clearance (Track 2). Re-verified open 2026-07-19; note the three pages are also **invisible to Vitest coverage** (never imported by any test → excluded from the report — see D99.13).

### Problem

Three collection pages ship without tests: `CollectionCreatePage.tsx`, `CollectionEditPage.tsx`, and `CollectionListPage.tsx` have no `*.test.tsx`. By contrast `CollectionDetailPage` (`CollectionDetailPage.test.tsx`), `CollectionsBrowsePage` (`CollectionsBrowsePage.test.tsx`), and the `CollectionRecipeList` component (`components/collections/CollectionRecipeList.test.tsx`) are covered. The gap also leaves the D99.2 `draft`-option fix (create/edit visibility selectors) unguarded by a regression test.

*Addendum 2026-07-19:* `AddToCollectionModal` gained `AddToCollectionModal.test.tsx` since this entry was written; `AddToCollectionButton.tsx` and `CollectionCard.tsx` still lack dedicated tests.

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

## D99.7 — i18n stragglers outside D40's declared scope — ✅ Resolved (2026-07-27, wave-5-debt-clearance T5)

**Scheduled:** wave-5-debt-clearance (Track 5). Re-verified open 2026-07-19; the wider sweep grew the footprint well beyond the original list (see scope note below).

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
- `apps/web/src/pages/recipes/useCoffeeVarietyFilter.tsx:172` (`aria-label='Clear variety filter'`)
- `apps/web/src/pages/recipes/RecipeNotAvailablePage.tsx:14` (`<SEOHead title='Recipe Not Available' />`)
- `apps/web/src/components/recipe/BreadcrumbNav.tsx:32`, `apps/web/src/pages/coffee-varieties/CoffeeVarietyDetailPage.tsx:128` and `apps/web/src/pages/equipment/EquipmentDetailPage.tsx:97` (`aria-label='Breadcrumb'`)

(Correction 2026-07-19: the earlier claim that `useCoffeeVarietyFilter.tsx` and `RecipeNotAvailablePage.tsx` contained `aria-label='Breadcrumb'` was wrong — git history shows that literal never existed in either file; their actual stragglers are listed above, and the real third Breadcrumb site is `BreadcrumbNav.tsx:32`. A few refs may still drift ±2 as pages change; grep the literal before editing.)

**Scope note (2026-07-19 sweep):** the true footprint is **~30 files**, not the ~9 listed above — the wider sweep also found hardcoded strings in `EmailVerificationBanner`, `PhotoUpload`, `RecipeQRCode`, `StarRating`, `ShareSection`, `BeanSection`, `TastingNotesSection`, `ScaaRadarChart`, `ErrorBoundary`, equipment icons, template-string aria-labels, SEO titles/descriptions, and auth error fallbacks. The wave-5 Track 5 tasks carry the full list.

### Proposed Fix

Route each literal through `t()` with a new key in `packages/shared/src/i18n/en.json` + `tr.json`. Placeholders under `*.placeholder` keys; aria/SEO under `a11y.*` (or the page's namespace).

### Acceptance Criteria

- [ ] Listed placeholders and aria/SEO strings are translated via `t()` with en + tr keys
- [ ] `make check && make lint && make test` pass

### Effort Estimate

**Medium** (raised from Low–Medium on 2026-07-19) — mechanical, but spread across ~30 files with matching en/tr key additions.

---

## D99.8 — Cursor keyset predicate sargability (scale-time note) — ✅ Resolved (2026-07-27, remaining-debt-clearance)

> **Resolved 2026-07-27 (remaining-debt-clearance).** Rewrote `buildCursorWhere` to row-value comparison `(created_at, id) < ($1, $2)` for composite index sargability (D03 raw-SQL exception).

### Problem

`buildCursorWhere` in `apps/api/src/modules/recipe/model.ts:885-904` expresses the keyset predicate in OR form (the DESC OR predicate quoted below sits at `model.ts:900-903`):

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

## D99.9 — Comment creation is not visibility-gated (recipe-title disclosure via mentions) — ✅ Resolved (2026-07-27, wave-5-debt-clearance T1)

**Scheduled:** wave-5-debt-clearance (Track 1).

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
likely "only users who can view the recipe may comment". Correction (2026-07-19): the earlier
"reuse the recipe visibility check used by `getRecipe`" was wrong on two counts — (a) `getRecipe`
(`apps/api/src/modules/recipe/service.ts:58-70`) contains **no** visibility logic; the check is
inline route code duplicated at `recipe/index.ts:281-284` and `:316-319`; (b) the existing
predicate has **no admin bypass** — `draft`/`private` are strictly owner-only (`userId !==
authorId` → 404). The fix must therefore first **extract a shared visibility-predicate helper**
from the duplicated route code, then apply it in the comment service (owner-only for
`draft`/`private`; anyone with link for `unlisted`; everyone for `public`). Return 404 (not 403)
for invisible recipes to avoid existence disclosure. Add service tests for each visibility ×
commenter-role combination.

### Acceptance Criteria

- [ ] Commenting on a recipe the user cannot view is rejected (404) at the service layer
- [ ] Comment list route applies the same gate
- [ ] Mention side effects never fire for rejected comments (they already sit behind creation)
- [ ] Tests cover all visibility/role combinations
- [ ] `make check && make lint && make test` pass

### Effort Estimate

**Low–Medium** — ~2–3 hours: helper extraction + one guard + route parity + a test matrix. (The
visibility predicate exists only as duplicated inline route code in the recipe module, so the
shared-helper extraction is small extra scope; the estimate holds.)

---

## D99.10 — Type-safety & lint regressions (disabled rules mask real debt) — ✅ Resolved (2026-07-27, wave-5-debt-clearance T6)

**Scheduled:** wave-5-debt-clearance (Track 6). Added 2026-07-19.

### Problem

`deno.json:66-72` `lint.rules.exclude` disables `no-explicit-any`, `require-await`, and `no-empty`
workspace-wide, so CI cannot catch regressions. Measured re-enable cost (2026-07-19):

- **`no-explicit-any`** — 7 production + 119 test diagnostics (across 44 test files with no directive). Production: `taste/service.ts:27,90,119` (3 undocumented `any` — cache reads return `any` on hit, untyped `Map`; predate and escaped D34's sweep) and `RecipeComparePage.tsx` / `RecipeFocusModePage.tsx` (10 `any` behind **8 justification-free** line-level ignore directives — currently no-ops — erasing the D42 typed API boundary at those consumers).
- **`no-empty`** — 14 production silent `catch {}` blocks, all on user-initiated mutations with zero feedback (the D17 failure class): `BeanListPage.tsx:54,65`, `SetupListPage.tsx:51,62`, `AdminRecipesPage.tsx:46,55`, `AdminVendorsPage.tsx:54,65`, `AdminCompatibilityPage.tsx:43,51`, `AdminCoffeeVarietiesPage.tsx:200,215`, `AdminUserDetailPage.tsx:66`, `RecipeQRCode.tsx:34`.
- **`require-await`** — 44 production sites (mostly async model functions returning query builders; `recipe/model.ts` ×8, `utils/cache/index.ts` ×4, …).

Adjacent debt: `apps/web/src/api/client.ts:72` carries the single surviving `Record<string, unknown>` in `api/` (D42 off-by-one, see TECHNICAL_DEBT §4.6 correction); ~10 pages outside `api/` still cast request bodies/responses to `Record<string, unknown>` (e.g. `AdminAuditLogPage.tsx:38`, `RecipeCreatePage.tsx:98`, `PhotoUpload.tsx:87`, 7 admin body casts); and ~40 test files carry no-op file-level `deno-lint-ignore-file` directives for the disabled rules.

### Proposed Fix

Per the 2026-07-19 decision: re-enable **all three** rules. Fix all production violations first (typed cache reads via `Awaited<ReturnType<typeof model.…>>`; shared `z.infer` types in the two recipe pages; logged + toast-surfaced catches — depends on the D99.11 Toast primitive; drop `async` or await properly for `require-await`). Test-file `any`: typed fix where trivial, else line-level ignore **with justification comment**. Remove the ~40 no-op file-level test directives. Flip `deno.json` `rules.exclude` **last**.

### Acceptance Criteria

- [ ] `no-explicit-any`, `require-await`, `no-empty` removed from `deno.json` `rules.exclude`; `deno lint` green
- [ ] Zero justification-free ignore directives in production source; remaining line-level ignores carry a reason
- [ ] The 14 empty catches log and surface user feedback; `client.ts:72` justified or retyped; page-level `Record` casts replaced with shared types
- [ ] `make check && make lint && make test` pass

### Effort Estimate

**Medium–High** — the production fixes are bounded (7 + 14 + 44 sites) but `require-await` is churny and the test-file sweep is wide.

---

## D99.11 — Frontend duplication: hand-rolled cards, pagination, modals, form fields — ✅ Resolved (2026-07-27, wave-5-debt-clearance T3)

**Scheduled:** wave-5-debt-clearance (Track 3). Added 2026-07-19. Full JSX evidence: 2026-07-19 audit `frontend-duplication.md` (11-item prioritised plan).

### Problem

- **Recipe cards**: 3 pages hand-roll card JSX instead of using the shared `components/recipe-list/RecipeCard.tsx` — `UserProfilePage.tsx:226-243`, `EquipmentDetailPage.tsx:162-181`, `CoffeeVarietyDetailPage.tsx:209-243` (the last re-adds the brew-method/rating strip the shared card dropped). Stale leftover `components/recipe/RecipeCard.styles.ts` still exists; `RecipeCard.tsx:28` hardcodes English `'by '`.
- **Collection card**: `UserProfilePage.tsx:253-269` hand-rolls a copy of `CollectionCard` (same `CollectionListItemOutput` type; silently loses the visibility badge + description).
- **Pagination**: canonical `recipe-list/PaginationControls.tsx:17-48` is cloned inline in 4–5 pages (`CoffeeVarietiesPage.tsx:259-287`, `EquipmentCatalogPage.tsx:278-306`, `AdminCoffeeVarietiesPage.tsx:573-598`, `AdminAuditLogPage.tsx:124-137`, numbered variant `AdminUsersPage.tsx:283-317`).
- **Catalog/CRUD clones**: `CoffeeVarietiesPage`/`EquipmentCatalogPage` are near-clone catalog pages (8 duplicated blocks each); `BeanListPage`/`EquipmentListPage`/`SetupListPage` are CRUD-page triplets.
- **Modals/confirms**: 3 hand-rolled modal shells (`BanDialog.tsx:46-50`, `AddToCollectionModal.tsx:128-135`, `AdminCoffeeVarietiesPage.tsx:603-634`) + 9 `globalThis.confirm` sites; **zero toast infrastructure** for mutation feedback.
- **Small primitives**: collection visibility emoji map ×3; `Field` vs `FilterField` duplicate primitives + ~45 raw label blocks in 13 non-adopting files; no `EmptyState`/`LoadingState` primitives (~19 + ~18 sites).

### Proposed Fix

**Primitives-first** (locked decision — do NOT build generic `CrudListPage`/`CatalogPage` components): extend `RecipeCard` (optional `hideAuthor`/`forkCount`/version-strip props, i18n `'by'`) and adopt in the 3 offender pages, deleting `RecipeCard.styles.ts`; adopt `CollectionCard` in `UserProfilePage`; move `PaginationControls` to `ui/` and adopt; build minimal dependency-free `ToastProvider`+`useToast` and `ConfirmDialog`, migrating the 9 `confirm()` sites and 3 modal shells; add `EmptyState`/`LoadingState`; extract a `visibilityEmoji` helper; merge `FilterField` into `Field` and adopt; extract shared catalog/CRUD blocks that pages compose.

### Acceptance Criteria

- [ ] Zero hand-rolled recipe/collection card JSX outside the shared components; `RecipeCard.styles.ts` deleted
- [ ] One `PaginationControls`, one modal shell, one confirm dialog, one toast system; no `globalThis.confirm` remains
- [ ] `EmptyState`/`LoadingState`/`Field` adopted at the audited sites
- [ ] `make check && make lint && make test` pass (with page tests updated)

### Effort Estimate

**High** — many small mechanical extractions/adoptions across ~25 files; individually low-risk.

---

## D99.12 — Visual consistency: page shells, error UI, dates, breadcrumbs, forms — ✅ Resolved (2026-07-27, wave-5-debt-clearance T4)

**Scheduled:** wave-5-debt-clearance (Track 4). Added 2026-07-19. Full inventory: 2026-07-19 audit `frontend-consistency.md`.

### Problem

`globals.css` defines only `.card`/`.btn-primary`/`.btn-secondary`/`.input-field`/`.badge` — no `btn-danger`, page shell, heading scale, toast, or date formatter. Divergences:

- **Page shell**: the 5 collection pages use `container mx-auto px-4` (e.g. `CollectionListPage.tsx:48`) vs the house `mx-auto max-w-* px-6 py-8` — visibly wider with different gutters.
- **Error UI**: 4 divergent styles; the admin tinted variant references undefined `--error-bg` (`AdminUserCreatePage.tsx:91`, `AdminUserEditPage.tsx:191`, `AdminUserDetailPage.tsx:260`, `AdminUsersPage.tsx:94,103`) whose `#fef2f2` fallback breaks dark/coffee themes — a theming bug, not just drift.
- **Buttons**: hand-rolled accent buttons hardcode white text while `.btn-primary` uses `var(--bg-primary)` (dark text in dark theme); no `.btn-danger` exists.
- **Dates**: 8 `toLocaleDateString()` sites pass no locale (ignore the in-app language selector); `BeanSection` renders raw ISO dates on the recipe page.
- **Breadcrumbs**: 3 implementations; the shared `BreadcrumbNav.tsx:45` shows untranslated English "Recipes".
- **Forms**: `Field`/`Section` primitives used by only 2 of ~12 forms; only auth pages associate labels via `htmlFor`; only admin forms show field-level errors.
- **Loading**: split 4 ways (Skeleton / centered text / left text / raw `animate-pulse`), including within `RecipeListView` itself; h1 scale drifts across pages.

### Proposed Fix

Normalize page shells (collections first); themed `ErrorState` component + define `--error-bg` per theme; accent buttons → `.btn-primary` + new `.btn-danger`; locale-aware date/number formatter util adopted at the 8 sites + `BeanSection`; single i18n'd `BreadcrumbNav`; normalize loading states and the h1 scale; roll `Field`/`Section` (with `htmlFor` + field-level errors) across ~10 more forms.

### Acceptance Criteria

- [ ] Collections render in the house shell; `--error-bg` defined for all three themes; error UI via one `ErrorState`
- [ ] All date renderings honour the app locale; one breadcrumb implementation, fully translated
- [ ] `make check && make lint && make test` pass

### Effort Estimate

**Medium–High** — broad but mechanical; the `--error-bg` theming bug and date-locale fixes are the high-value core.

---

## D99.13 — Coverage integrity: mock-mirror tests, broken `test:db`, invisible files, no gate — ✅ Resolved (2026-07-27, wave-5-debt-clearance T1+T8)

**Scheduled:** wave-5-debt-clearance (Tracks 1 & 8). Added 2026-07-19 (P1 components).

### Problem

- **P1 — `deno task test:db` is broken** by a TS2352 type error, which breaks the root `test` and `ci` tasks that pipe through it.
- **P1 — 4 mock-mirror test files import zero production code**: `admin/service.test.ts`, `admin/index.test.ts`, `equipment/service.test.ts`, `photo/service.test.ts` re-implement the logic they claim to test; the admin module alone carries **1,349 uncovered lines** (~72% of the distance to 85%).
- **Measured coverage (CI-mirrored test DB)**: deno scope 72.21% lines (`packages/shared` 99.42% — clean; `apps/api` 65.38% — the entire gap). `apps/web` reports 75.31% but is **inflated**: Vitest 4 counts only loaded files, and 14 production files (1,093 lines incl. `router.tsx`, the 3 collection pages, 4 route-action files) are invisible; honest estimate ~64–68%.
- **No coverage gate anywhere** — CI only uploads an artifact; `deno coverage` has no built-in threshold.
- **No local test-DB provisioning**: 129 API tests need a `brewform_test` DB that only CI creates (`.github/workflows/pr.yml:63-113`); no local task mirrors it.
- **Cross-suite pollution**: the seed-idempotency test fails when run after the API suite.

### Proposed Fix

Track 1: fix the TS2352; rewrite the 4 mock-mirror files against the real modules. Track 8: local test-DB provisioning make target mirroring `pr.yml:63-113`; admin real tests (+~1,200 lines → ~80.4%), recipe backfill (+~550 → ~84.2%), new `auth/model.test.ts` (+~250 → ~85.9%); fix Vitest config to include untested files + set thresholds; small script parsing the deno coverage report as a CI gate; fix the seed-idempotency pollution. Blanket rule: every wave-5 change ships with tests.

### Acceptance Criteria

- [ ] `deno task test:db` (and root `test`/`ci`) pass; zero test files that import no production code
- [ ] Deno-scope line coverage ≥85% with a CI gate; web coverage counts all production files with thresholds
- [ ] A documented local task provisions `brewform_test`; suites pass in any order
- [ ] `make check && make lint && make test` pass

### Effort Estimate

**High** — the admin rewrite is the bulk (~1,200 lines of real tests); the rest is bounded plumbing.

---

## D99.14 — Docblock gaps: 196 undocumented exported symbols — ✅ Resolved (2026-07-27, wave-5-debt-clearance T9)

**Scheduled:** wave-5-debt-clearance (Track 9). Added 2026-07-19. File-by-file inventory + captured house style: 2026-07-19 audit `docblock-inventory.md`.

### Problem

890 of 1,059 exported symbols (84%) carry JSDoc; **196 are missing**, nearly all `const`/`type` exports: `packages/db/src/schema.ts` (43 — all the pgEnum + pgTable consts), `packages/shared` (49 `z.infer` type aliases + 21 constants), 22 Hono router consts, ~14 logger/`deps` singletons, misc. Function-likes are effectively done — apps/web has zero undocumented components/hooks/functions, apps/api zero undocumented handlers/services/middleware; the sole undocumented true function repo-wide is `packages/db/src/seed.ts:927 main()`.

### Proposed Fix

Eliminate all 196 per the inventory, following the captured house style (API services: aligned `@param x - desc` + `@returns`; utils: single-line verb-first `/** */`; hooks/components: tag-less prose; schemas: "Validates X; response envelope for METHOD /route" one-liners; `{@link}` cross-refs). Blanket rule for new code in wave 5.

### Acceptance Criteria

- [ ] Zero undocumented exported symbols per the inventory's scanner
- [ ] `make fmt && make check && make lint` pass

### Effort Estimate

**Medium** — purely mechanical; ~196 one-to-three-line comments.

---

## D99.15 — Dependency refresh (safe batch + Deno/CI sync + gated TypeScript 7) — ✅ Resolved (2026-07-27, wave-5-debt-clearance T10)

**Scheduled:** wave-5-debt-clearance (Track 10). Added 2026-07-19. Full inventory table: 2026-07-19 audit `dependency-audit.md`.

### Problem

15 outdated packages, all patch/minor except typescript. **Safe batch**: hono 4.12.30, hono-openapi 1.3.1, @hono/standard-validator 0.2.3, @std/expect 1.0.20, vitest + @vitest/coverage-v8 4.1.10, vite 8.1.5, tailwindcss + @tailwindcss/vite 4.3.3, nodemailer 9.0.3, fast-check 4.9.0, mjml 5.4.0 (re-run email-build), react-router 8.2.0, @hono/zod-validator 0.9.0 (out-of-range but verified type-only). **Runtime drift**: local Deno 2.9.2 vs latest 2.9.3 vs CI pinning `deno-version: v2.9.0` in pr.yml/ci.yml. **Major**: typescript 6.0.3 → 7.0.2 (tsgo, Go-native) — gated verification only. **Skip**: @hono/standard-validator 0.3.0 (hono-openapi peer pins ^0.2.0) and @opencode-ai/plugin (local tooling). **Renovate blind spots**: deno.json `catalog` depType unsupported (3 catalog pins), jsr:-protocol versions in package.json, and the CI `deno-version` input; drizzle-kit is pinned in two places.

### Proposed Fix

One `deno update --latest` safe batch + `deno task ci`; bump Deno to 2.9.3 and sync the CI `deno-version` pins; dedupe drizzle-kit; add renovate `customManagers` for the catalog pins + CI deno-version (document the jsr blind spot). **Then** the gated TS7 section (locked decision): branch-verify `deno run -A npm:typescript/tsc` under tsgo (`--noEmit`, `-p`, `ignoreDeprecations`), diff diagnostics vs 6.0.3 on apps/web, document compiler skew vs Deno-bundled TS 6.0.3, bump only on parity — explicit fallback: defer + ledger if verification fails.

### Acceptance Criteria

- [ ] Safe batch landed; `deno task ci` green; email templates rebuilt
- [ ] Local Deno + both CI workflows on the same version; renovate covers the audited blind spots (or documents them)
- [ ] TS7 either bumped with a recorded parity diff, or explicitly deferred back to this ledger

### Effort Estimate

**Medium** — the batch is one command + verification; the TS7 gate and renovate config are the careful parts.

---

## D99.16 — Stray raw `sql` tags outside the accepted-exception list — ✅ Resolved (2026-07-27, wave-5-debt-clearance T7)

**Scheduled:** wave-5-debt-clearance (Track 7). Added 2026-07-19.

### Problem

The 2026-07-19 sweep (pattern `` sql(<[^>]*>)?` `` — a plain `` sql` `` grep **misses** typed `sql<number>` forms, which is how these escaped the 2026-07-13 sweep) found 5 stray sites: `recipe/model.ts:830` (`sql\`not ${recipes.featured}\`` atomic featured-toggle), `coffee-variety/model.ts:46` (`count(*)`), `collection/model.ts:219` (`max()`), `badge/model.ts:78` (`coalesce(max())`), `packages/db/src/seed.ts:93/404/697` (`is null`). All accepted exceptions verified intact: equipment correlated-EXISTS with its NOTE (`equipment/model.ts:116-124`), atomic ±1 counters, `count(distinct)`, the `SELECT 1` health probe, and drizzle `check()` constraints in `schema.ts` (which require a sql tag by API).

### Proposed Fix

Replace with drizzle helpers: `count()`, `max()`, `isNull()` (all already used elsewhere in the repo). Featured toggle: rewrite with `not()` if clean, else document as an accepted atomic-toggle exception in the raw-SQL registry. `badge/model.ts:78`: drizzle has no `coalesce` helper — either keep with a NOTE or coalesce in TS after `max()`. Record the widened sweep pattern in the registry.

### Acceptance Criteria

- [ ] The 5 sites use drizzle helpers or carry documented exception NOTEs
- [ ] `make check && make lint && make test` pass

### Effort Estimate

**Low** — ~1 hour; mechanical swaps with existing in-repo precedents.

---

## D99.17 — Architecture deviations: recipe model-import bypass; contact module shape — ✅ Resolved (2026-07-27, remaining-debt-clearance)

> **Resolved 2026-07-27 (remaining-debt-clearance).** Threaded recipe index.ts through service layer (6 wrappers), replaced follow/badge direct drizzle imports with user model functions, documented contact module as accepted deviation.

### Problem

Two sampled deviations from the 3-layer module convention (index.ts routes → service.ts → model.ts): (1) `apps/api/src/modules/recipe/index.ts:25` imports the model directly, bypassing the service layer for some routes; (2) the `contact` module has no service/model split at all. Both work correctly; the cost is convention drift, not behaviour.

### Proposed Fix (when picked up)

Thread the recipe routes through the service layer; give contact a minimal service/model split (or document both as accepted deviations in AGENTS.md).

### Effort Estimate

**Medium** (recipe) / **Low** (contact) — deferred until either module is next touched for feature work.

---

## D99.18 — Test-file naming split: `*_test.ts` vs `*.test.ts` — ✅ Resolved (2026-07-27, remaining-debt-clearance)

> **Resolved 2026-07-27 (remaining-debt-clearance).** Renamed 6 `*_test.ts` files to `*.test.ts`, codified convention in AGENTS.md and lint-style spec.

### Problem

The repo mixes two test-file naming conventions (e.g. `collection/service_test.ts`/`index_test.ts` vs `admin/model.test.ts`, web `*.test.tsx`). Both are picked up by the runners, so this is pure consistency debt; a rename sweep would churn history and conflict with in-flight test work (D99.13).

### Proposed Fix (when picked up)

Pick one convention (likely `*.test.ts` — the majority), rename in a single mechanical commit after the wave-5 test backfill lands, and note the rule in AGENTS.md.

### Effort Estimate

**Low** — mechanical rename + import/glob check; deferred to avoid conflicting with the coverage work.

---

## D99.19 — AGENTS.md middleware-order documentation drift — ✅ Resolved (2026-07-27, wave-5-debt-clearance T11)

**Scheduled:** wave-5-debt-clearance (Track 11). Added 2026-07-19.

### Problem

`AGENTS.md:50` documents a middleware order that no longer matches `apps/api/src/main.ts:41-76`. Actual order: cors → requestId → secureHeaders → rateLimit (100/min) → bodyLimit (1 MB) → cache-injection → crawler → onError(errorHandler) → optional local `/uploads/*` handler → routes.

### Proposed Fix

Update the `AGENTS.md:50` list to match `main.ts:41-76` verbatim.

### Acceptance Criteria

- [ ] AGENTS.md middleware order matches `main.ts`
- [ ] No other AGENTS.md claims contradicted by the 2026-07-19 architecture map

### Effort Estimate

**Trivial** — a one-paragraph doc edit.

---

## Wave-6 follow-ups (D99.20+)

Added 2026-11-21 by `wave-6-audit-remediation` (task 27.1). Each entry is a deferral from that change's `proposal.md` → Non-Goals, an audit finding with no wave-6 owner ([`AUDIT-2026-11-18.md`](AUDIT-2026-11-18.md)), or a follow-up found while implementing it. The entries are compact: a status line, one evidence line (paths as of 2026-11-21) and the intended fix. Expand an entry into its own D-plan when you pick it up. Priority and effort use the [`ROADMAP.md`](ROADMAP.md) legend, and ROADMAP's Remaining Debt table is the status index.

## D99.20 — Recipe merge field parity, and merge copying another user's brewer notes — Open

**Deferred:** wave-6 Non-Goals (t1). **Priority:** P3 · **Effort:** Medium. Full write-up: [`TECHNICAL_DEBT.md`](TECHNICAL_DEBT.md) §3.10.

**Evidence:** `apps/api/src/modules/recipe/service.ts` `mergeRecipes` builds the new version from `tasteNoteIds` only, so every intensity becomes 1, and `RecipeMergeSchema.selections` (`packages/shared/src/schemas/recipe.ts`) has no `tds` or coffee-variety choice, so a merged recipe always has empty `tds`, `coffeeVarietyId` and `coffeeVarietyName`.

**Fix:** add `tds` and `coffeeVariety` selections, pass the picked versions' `tasteNoteIntensities`, carry `coffeeVarietyId`, and add merge regression tests next to the bump/fork ones. In the same change, decide whether merge should stop copying `personalNotes` from a public version the caller does not own.

## D99.21 — `SetupUpdateSchema` keeps the `isDefault` default, so a setup PATCH clears the default flag — Open

**Deferred:** wave-6 Non-Goals (t1). **Priority:** P2 · **Effort:** Low. Full write-up: [`TECHNICAL_DEBT.md`](TECHNICAL_DEBT.md) §3.11.

**Evidence:** `packages/shared/src/schemas/setup.ts` defines `SetupUpdateSchema = SetupCreateSchema.partial()`, and `isDefault: z.boolean().default(false)` survives `.partial()` in Zod 4. So every `PATCH /api/v1/setups/:id` writes `isDefault: false` through `setup/model.ts#update`.

**Fix:** build `SetupUpdateSchema` field by field with no `.default()`. Add a shared test that `SetupUpdateSchema.parse({})` is `{}`, and a service test that a name-only PATCH keeps `isDefault: true`.

## D99.22 — "My notes" listing and an `amendedAt` marker for in-place amends — Open

**Deferred:** wave-6 Non-Goals (t1). **Priority:** P4 · **Effort:** Medium.

**Evidence:** private notes are reachable only per recipe (`GET /api/v1/recipes/:id/notes`, `apps/api/src/modules/recipe-note/`), and no `GET /api/v1/users/me/notes` exists. `recipe_version` has no `amendedAt`, so a `bumpVersion: false` amend leaves no trace; the edit page only says that the current version is updated in place.

**Fix:** add a caller-scoped, paginated `GET /api/v1/users/me/notes` joined with each recipe's title and slug, which skips recipes the caller can no longer view. Add an `amendedAt` column set by the amend path and show it on the versions page.

## D99.23 — Author-only "My recipes" listing — Open

**Deferred:** wave-6 Non-Goals (unlisted visibility). **Priority:** P3 · **Effort:** Medium.

**Evidence:** every discovery listing, the owner's own profile included, uses the viewer-independent `listableRecipeCondition(null)` (`apps/api/src/modules/recipe/model.ts`). Authors therefore reach their own unlisted, draft and private recipes only by link, through collection items or through Starred.

**Fix:** add `GET /api/v1/users/me/recipes` (author = caller, `viewableRecipeCondition(userId)`) and a "My recipes" page. The public profile stays public-only.

## D99.24 — Unguessable URLs for unlisted recipes — Open

**Deferred:** wave-6 Non-Goals (unlisted visibility). **Priority:** P3 · **Effort:** Medium.

**Evidence:** slugs stay title-derived and immutable, with a random suffix only on collision (`recipe-slug` spec, `packages/shared/src/utils/slug.ts`). An unlisted recipe's URL can therefore be guessed from its title, and `docs/recipes.md` tells users to choose `private` for secrecy.

**Fix:** give unlisted recipes a random share token (for example `/r/<token>`) or a random slug suffix when visibility becomes `unlisted`. Decide how existing unlisted slugs migrate.

## D99.25 — Visibility gating of like, favourite, rate and the photo list — Open

**Deferred:** wave-6 Non-Goals (unlisted visibility). **Priority:** P2 · **Effort:** Low–Medium.

**Evidence:** `POST /api/v1/recipes/:id/like`, `/:id/favourite` and `/:id/rate` (`recipe/index.ts`; `toggleLike`/`toggleFavourite` in `recipe/service.ts`) and `GET /api/v1/photos/recipe/:recipeId` (`photo/index.ts`) never call `canViewRecipe`. A caller who knows a draft or private recipe's id can like it, rate it or list its photos.

**Fix:** resolve the recipe through `viewableRecipeCondition(userId)` and return 404 when it is not viewable in each path, with one test per path.

## D99.26 — Account-deletion anonymisation and releasing deleted identifiers — Open

**Deferred:** wave-6 Non-Goals plus an unowned audit finding (audit §4 "Account deletion is shallow"). **Priority:** P1 · **Effort:** Medium.

**Evidence:** `apps/api/src/modules/user/model.ts#deleteUser` only sets `deletedAt`, so email, username and profile fields stay in the row and the user's public content stays public. Re-registering with a deleted account's email returns `409 Email already registered`, and deleted usernames are never released, because `user_email_lower_unique`/`user_username_lower_unique` also cover deleted rows.

**Fix:** a transactional `deleteAccount` that tombstones email and username (`deleted-<id>`), clears profile PII, unlists or soft-deletes content and revokes sessions (with D99.38). After that, re-registration with the old email can be allowed.

## D99.27 — Catalog-name uniqueness (equipment, vendors, coffee varieties, taste notes) — Open

**Deferred:** wave-6 Non-Goals (t3). **Priority:** P3 · **Effort:** Medium.

**Evidence:** `packages/db/src/schema.ts` has no unique constraint on catalog names, so duplicates exist, and a constraint needs a de-duplication step first.

**Fix:** an admin de-duplication tool that re-points references to the surviving row, then soft-delete-aware `lower(name)` unique indexes.

## D99.28 — Drop the redundant plain indexes — Open

**Deferred:** wave-6 Non-Goals (t3). **Priority:** P3 · **Effort:** Low.

**Evidence:** `recipe_slug_idx`, `user_email_idx`, `user_username_idx`, `password_reset_token_idx` and `badge_rule_idx` (`packages/db/src/schema.ts`) duplicate a unique constraint or a `lower()` unique index, and the audit counted about 30 such indexes (§6.G). The exact email/username constraints stay, because the seed's conflict target needs them.

**Fix:** check `pg_stat_user_indexes` first, then drop the duplicates in `schema.ts` and run `make db-generate`.

## D99.29 — EXIF/GPS stripping of uploaded photos — Open (ships with F23)

**Deferred:** wave-6 Non-Goals (t4a). **Priority:** P2 · **Effort:** Medium (as part of F23).

**Evidence:** uploads are stored byte-for-byte after magic-byte sniffing (`apps/api/src/utils/upload/sniff.ts`, `validateImagePart`). Camera metadata, GPS coordinates included, is served unchanged with public recipe photos.

**Fix:** the sharp pipeline in [`F23-image-optimisation.md`](F23-image-optimisation.md) re-encodes every upload (auto-orient, then output without metadata).

## D99.30 — Per-user upload rate limit and env-configurable image dimension limits — Open

**Deferred:** wave-6 Non-Goals (t4a). **Priority:** P3 · **Effort:** Low.

**Evidence:** photo uploads fall only under the global IP policy (`apps/api/src/utils/rate-limit/policies.ts`). `MAX_IMAGE_SIDE_PX = 16_384` and `MAX_IMAGE_PIXELS = 50_000_000` are code constants (`apps/api/src/utils/upload/limits.ts`), so wider panoramas are refused.

**Fix:** add a user-keyed photo-upload policy, plus optional env overrides range-checked in `apps/api/src/config/env.ts`.

## D99.31 — Search follow-ups: full-text search, keyset paging on the score, current-version scope, minimum length — Open

**Deferred:** wave-6 Non-Goals (t7). **Priority:** P3 · **Effort:** Medium–High.

**Evidence:** search ranks with `pg_trgm` and pages with `LIMIT`/`OFFSET` plus `COUNT` (`findListPage` in `apps/api/src/modules/recipe/model.ts`, ADR-017). It matches any version's coffee name and notes, and it accepts a one-character term, bounded only by the statement timeout.

**Fix:** decide each item separately: a `tsvector` column (ADR), a keyset cursor on `(score, id)`, a current-version scope flag, and a minimum length in `RecipeFilterSchema` if load warrants it.

## D99.32 — Playwright screenshot and end-to-end tests — Open

**Deferred:** wave-6 Non-Goals (t6). **Priority:** P3 · **Effort:** Medium.

**Evidence:** chart layout is guarded by geometry unit tests (`apps/web/src/utils/chart/*.test.ts`) and a manual checklist (wave-6 task 19.27). There is no browser end-to-end or visual suite (audit §6.L).

**Fix:** a small Playwright suite in CI (create → edit → paginate → comment → admin moderation) plus screenshots of `ScaaRadarChart` and `BrewTimeline` at phone and desktop widths.

## D99.33 — Multi-arch images, a TLS compose overlay and a non-root web image — Open

**Deferred:** wave-6 Non-Goals (t4b). **Priority:** P3 · **Effort:** Medium.

**Evidence:** `.github/workflows/ci.yml` builds single-platform (amd64) images. `compose.production.yml` serves plain HTTP and expects an outer TLS proxy. `Dockerfile.web` (Caddy) runs as root, while the API image runs as `node`.

**Fix:** buildx `platforms: linux/amd64,linux/arm64`; an opt-in compose overlay with Caddy automatic HTTPS; a non-root Caddy user listening on an unprivileged port.

## D99.34 — Rate-limit follow-ups: admin lockout reset, env-tunable policies, Valkey in CI — Open

**Deferred:** wave-6 Non-Goals (t2). **Priority:** P3 · **Effort:** Low–Medium.

**Evidence:** only `RATE_LIMIT_GLOBAL_MAX` is env-tunable (`apps/api/src/config/env.ts`), and the other policies are constants in `apps/api/src/utils/rate-limit/policies.ts`. Account lockouts (`auth-login-fail-account-ip`) clear only on a password reset, and no admin action exists. `apps/api/src/utils/rate-limit/redis.integration.test.ts` is `describe.skipIf` without a Valkey URL, and CI runs no Valkey service, so the RESP3/Lua path ran once against the compose Valkey (wave-6 task 6.45).

**Fix:** an audited admin "clear lockout" route, per-policy env overrides, and a Valkey service container in the CI `test` job.

## D99.35 — Pre-infusion and flow-rate form inputs, and an `extractionTimeSeconds` upper bound — Open

**Deferred:** wave-6 Non-Goals (t6). **Priority:** P3 · **Effort:** Low.

**Evidence:** the recipe form does not render `preInfusionTimeSeconds` (`apps/web/src/pages/recipes/recipe-edit-payload.ts` passes it through untouched), and `flowRate` is only derived by the API. `extractionTimeSeconds` is `z.number().positive()` with no upper bound (`packages/shared/src/schemas/recipe.ts`), so `BrewTimeline` has to clamp defensively.

**Fix:** add the inputs to `RecipeCreateForm`/`RecipeEditForm` (en/tr strings), and add an agreed upper bound, for example 24 h, to the shared schema with a test.

## D99.36 — OpenAPI coverage for the admin routes — Open

**Deferred:** wave-6 Non-Goals (t8). Admin parallel CRUD itself stays as it is, by user decision. **Priority:** P2 · **Effort:** Medium.

**Evidence:** 37 of the 44 routes in `apps/api/src/modules/admin/index.ts` have no `describeRoute()`, so `/api/v1/openapi.json` and the generated `docs/api-reference.md` omit them (found again in wave-6 group 24). `apps/api/src/routes/openapi.coverage.test.ts` `IN_SCOPE_BASE_PATHS` leaves out `/api/v1/admin`, `/api/v1/auth` and `/api/v1/recipes`. Auth and recipe routes are all documented today, but nothing enforces it.

**Fix:** add `describeRoute()` with admin output schemas to the 37 routes, add the three prefixes to `IN_SCOPE_BASE_PATHS`, and regenerate `docs/api-reference.md`.

## D99.37 — Top-level error boundary above the providers, and safe `localStorage` access — Open

**Deferred:** wave-6 Non-Goals (t5). **Priority:** P3 · **Effort:** Low.

**Evidence:** `apps/web/src/App.tsx` renders `AppProviders` around `RouterProvider` with no error boundary above the providers, so a provider crash blanks the app. `contexts/ThemeContext.tsx`, `contexts/I18nContext.tsx` and `components/CookieConsent.tsx` call `localStorage` without try/catch, and that throws when storage is blocked.

**Fix:** a minimal error boundary in `App.tsx` above `AppProviders`, and a guarded storage helper used by every caller.

## D99.38 — Auth session hygiene: session revocation and hashed reset tokens — Open

**Unowned audit finding** (audit §3.7). **Priority:** P1 · **Effort:** Medium.

**Evidence:** refresh tokens are stateless `{sub,type}` JWTs (`apps/api/src/modules/auth/jwt.ts`) with no version claim, so a password reset does not end existing sessions. Reset tokens are stored in plaintext (`passwordResets.token`, `packages/db/src/schema.ts`) and consumed in two statements (`auth/model.ts` `findPasswordResetByToken` + `markPasswordResetUsed`).

**Fix:** a `users.tokenVersion` embedded in both tokens, checked in `authMiddleware` and refresh, and bumped on reset, admin password change and a new "log out everywhere" action. Hash reset tokens and consume them with one `UPDATE … WHERE usedAt IS NULL RETURNING`.

## D99.39 — Equipment 20-item cap and admin list pagination — Open

**Unowned audit finding** (audit §4). **Priority:** P2 · **Effort:** Medium.

**Evidence:** `equipmentApi.list()` (`apps/web/src/api/index.ts`) reads only the first page of the paginated `/api/v1/equipment` (20 of about 379 seeded items) and feeds the shared lookup cache (`apps/web/src/api/static-cache.ts`). `AdminEquipmentPage` and `AdminRecipesPage` have no pagination. The recipe editor's `EquipmentPicker` already searches server-side.

**Fix:** use the paginated or `/equipment/search` call wherever the full catalog is needed, add `?mine=true` for My Equipment, and paginate both admin pages.

## D99.40 — Undefined `.input` CSS class — Open

**Unowned audit finding** (audit §4). **Priority:** P2 · **Effort:** Low.

**Evidence:** 13 `className="input…"` usages in `BrewLogForm.tsx`, `AddToCollectionModal.tsx`, `CollectionCreatePage.tsx` and `CollectionEditPage.tsx`, while `apps/web/src/styles/globals.css` defines only `.input-field`, so those fields render borderless and transparent.

**Fix:** switch them to `input-field`, and add a test that flags class tokens missing from the stylesheet.

## D99.41 — Photo gallery wiring — Open

**Unowned audit finding** (audit §4 "Photos never shown"). **Priority:** P2 · **Effort:** Medium.

**Evidence:** no page mounts `apps/web/src/components/photos/PhotoUpload.tsx`; only its resource route (`apps/web/src/routes/resources/photos.ts`) and its test reference it. No recipe page renders the recipe's photos.

**Fix:** mount `PhotoUpload` in the recipe editor, and add a gallery on the detail page ordered by `sortOrder` that excludes soft-deleted photos.

## D99.42 — Cross-recipe comment replies — Open

**Unowned audit finding** (audit §4). **Priority:** P2 · **Effort:** Low.

**Evidence:** comment creation in `apps/api/src/modules/comment/service.ts` loads the parent comment (`parentCommentId`) but never checks that it belongs to the same recipe, so a reply can attach to a parent on another recipe.

**Fix:** a same-recipe guard returning a typed 400/404, plus a test.

## D99.43 — Moderation UI (F15a) — Open

**Unowned audit finding** (audit §4 "Moderation is API-only"). **Priority:** P2 · **Effort:** Small–Medium.

**Evidence:** the `report` module ships `POST /api/v1/reports` and the admin report routes, but no web code calls `/reports`: there is no Report button and no admin reports page.

**Fix:** ship F15a from [`F15-admin-moderation.md`](F15-admin-moderation.md) (Report dialog, `AdminReportsPage`, nav badge).

## D99.44 — Notification spam from toggles — Open

**Unowned audit finding** (audit §6.H). **Priority:** P2 · **Effort:** Low–Medium.

**Evidence:** every like/unlike (`toggleLike` in `apps/api/src/modules/recipe/service.ts`) and follow/unfollow (`apps/api/src/modules/follow/service.ts`) creates a new notification and email. The notification module has no upsert and no cooldown.

**Fix:** upsert on `(type, actor, target)` and add an email cooldown per recipient, type and actor.

## D99.45 — Background work is not multi-instance safe — Open

**Unowned audit finding** (audit §6.I; migrations already run once per deploy through the wave-6 `migrate` service). **Priority:** P2 · **Effort:** Medium. Required before F29 or F30 runs on more than one replica.

**Evidence:** node-cron's hourly `evaluate-badges` job (`apps/api/src/utils/jobs/cron.ts`) runs in every API replica with no lock or overlap guard. Emails are sent on the request path with nodemailer's default timeouts (`apps/api/src/utils/notify/index.ts` sets no `connectionTimeout` or `socketTimeout`).

**Fix:** a Valkey `SET <key> <token> NX PX <ttl>` lock per job run when `CACHE_DRIVER=redis` (otherwise document a single replica), SMTP timeouts, and email sent off the request path.

## D99.46 — Observability: access logs, metrics, error tracking — Open

**Unowned audit finding** (audit §7). **Priority:** P3 · **Effort:** Medium.

**Evidence:** `apps/api/src/main.ts` registers no HTTP access-log middleware, metrics endpoint, tracing or error tracking. There are only structured application logs carrying `X-Request-ID`.

**Fix:** access-log middleware (request id, status, duration), `/metrics` (prom-client) on the internal network only, and optional Sentry/GlitchTip for API and web.

## D99.47 — Web edge security headers, public sourcemaps, asset caching — Open

**Unowned audit finding** (audit §7 "Web edge"). **Priority:** P2 · **Effort:** Low–Medium.

**Evidence:** `apps/web/Caddyfile` sets only `Cache-Control` headers; its static handle is marked "the slot for future security headers". The SPA therefore ships without CSP, HSTS, `X-Frame-Options`, `nosniff` or `Referrer-Policy`. `apps/web/vite.config.ts` builds `sourcemap: 'hidden'` maps that `Dockerfile.web` copies into the served `dist`, and hashed `/assets/*` get no immutable caching.

**Fix:** a Caddy `header` block, `Cache-Control: public, max-age=31536000, immutable` on `/assets/*`, and `.map` files dropped from the image (or uploaded to error tracking).

## D99.48 — Renovate configuration fixes — Open

**Unowned audit finding** (audit §7). **Priority:** P3 · **Effort:** Low.

**Evidence:** `renovate.json` does not mirror pnpm's `minimumReleaseAge`, so fresh releases fail install and hand-added `minimumReleaseAgeExclude` entries pile up in `pnpm-workspace.yaml` (18 today). The file also carries `//` comments, which are JSON5 syntax in a `.json` file.

**Fix:** set `minimumReleaseAge` to match pnpm, add grouping, a schedule and `lockFileMaintenance`, rename to `renovate.json5`, and prune the exclusions.

## D99.49 — Recipe GET returns `tds` `'1.4'` for a stored `1.40` — Open

**Found during wave 6** (group 8). **Priority:** P3 · **Effort:** Low.

**Evidence:** `recipe_version.tds` is `decimal(4, 2)` (`packages/db/src/schema.ts`). The relational recipe query returns nested versions as JSON, the driver parses `1.40` as the number `1.4`, and Drizzle's decimal mapping then yields `'1.4'`; plain selects return `'1.40'`.

**Fix:** normalise `tds` in the recipe output mapping (one canonical string or number, pinned by the output schema), and add a GET test that stores `1.40`.

## D99.50 — `/ready` reports `cache: "ok"` while Valkey is down — Open

**Found during wave 6** (group 21). **Priority:** P3 · **Effort:** Low.

**Evidence:** `getCacheStatus()` (`apps/api/src/utils/cache/singleton.ts`) returns the fail-soft provider's last observed state, so `/ready` keeps reporting `cache: "ok"` until a cache operation fails. `rateLimitStore` (`getRateLimitStoreStatus()`) already shows `degraded` at that point.

**Fix:** probe the cache backend from the readiness check (a bounded `PING`), or derive the cache state from the shared Valkey connection's state.

## D99.51 — Unused `recipe/model.ts#update` — Open

**Found during wave 6** (group 8). **Priority:** P4 · **Effort:** Trivial.

**Evidence:** `update(id, data)` in `apps/api/src/modules/recipe/model.ts` has had no caller since group 8 moved amend and bump into one transactional model path. Wave 6 kept it rather than removing it.

**Fix:** delete it, together with any test that covers only it.

## D99.52 — Demo accounts seeded in production — Accepted (user decision 2026-11-19)

**Non-Goal of wave 6** (audit item 2, §3.2); the user answered "No problems". Recorded so later audits do not report it again. **Priority:** P4 · **Effort:** Low if revisited.

**Evidence:** the image's first-install bootstrap (`docker-entrypoint.sh`: when the users table is empty, it runs `node src/seed.ts`) seeds five verified demo users with the shared `defaultPassword` (`packages/db/src/seed-users-recipes.ts`), even with `APP_ENV=production`.

**Revisit when:** public sign-ups open or anyone else deploys the image. **Fix then:** split `seed:base`/`seed:demo`, refuse the demo seed in production, and add a runbook step that soft-deletes `@example.com` accounts.

## D99.53 — Missing entry/exit (API) and mount/unmount (web) debug logs — Open

**Moved from `TODO_logs.md`** (its P3 list, never completed, plus the services its "complete" banner missed; audit §"Entry/exit logging is missing in several services"; wave-6 task 26.20). **Priority:** P4 · **Effort:** Low.

**Evidence (API):** AGENTS.md → Logging asks for entry/exit debug logs on every public service function, but `apps/api/src/modules/badge/service.ts` has none (0 of 4 exports), `comment/service.ts` 1 of 4, `follow/service.ts` 1 of 6, `photo/service.ts` 1 of 3 and `recipe/service.ts` 14 of 25 (counted as exported functions vs `'… started'` logs on 2026-11-21).

**Evidence (web):** `apps/web/src/pages/recipes/RecipeNotAvailablePage.tsx`, `apps/web/src/pages/ContactPage.tsx` (it logs only in `ContactPage.data.ts`), `apps/web/src/pages/admin/AdminLayout.tsx`, `apps/web/src/components/CookieConsent.tsx` and `apps/web/src/components/EmailVerificationBanner.tsx` have no `createLogger` mount/unmount `useEffect`, which AGENTS.md → Logging asks of every page. (`TermsPage`, `PrivacyPage` and `ErrorPage` have it; `NotFoundPage` no longer exists, 404s render through `ErrorPage`/`RouteErrorState`.)

**Fix:** add the `started`/`completed` debug pair (ids only) to each uncovered service export and the `'<Name> mounted'`/`'<Name> unmounted'` pair to each web file, with `vi.spyOn(log, 'debug')` assertions.

## D99.54 — Log conventions: latency on exit logs and one id-key vocabulary — Open

**Moved from `TODO_logs.md`** (cross-cutting items; wave-6 task 26.20). **Priority:** P4 · **Effort:** Low–Medium.

**Evidence:** no service measures its own duration (`performance.now()` appears nowhere in `apps/api/src`), so the entry/exit debug pairs carry no latency. 37 log calls in seven services (`coffee-variety`, `bean`, `setup`, `report`, `taste`, `equipment`, `vendor` `service.ts`) log a bare `id` instead of an entity-named key (`beanId`, `setupId`, …), so a log query cannot follow one entity across modules.

**Fix:** add `durationMs` to the `completed` debug logs (a small helper next to `createLogger`), rename the bare `id` keys, and pin both with logger-spy assertions in the existing service tests.

## D99.55 — Log volume controls and slow-query logging — Open

**Moved from `TODO_logs.md`** (cross-cutting items; wave-6 task 26.20). **Priority:** P4 · **Effort:** Medium. Related: D99.46 (access logs and metrics).

**Evidence:** `apps/api/src/utils/logger/index.ts` configures level, redaction and the `err` serializer only: there is no sampling (`LOG_SAMPLE_RATE` does not exist in `apps/api/src/config/env.ts`), and no `db` logger reports slow statements (nothing hooks the `postgres-js` client in `packages/db/src/index.ts`; only the server-side `statement_timeout` from `DB_STATEMENT_TIMEOUT_MS` bounds them).

**Fix:** an optional debug-level sampling setting, and a `db` module logger that warns on statements slower than a configurable threshold (default 100 ms) with the statement kind and duration but no parameters (see `toLoggableError` in `apps/api/src/utils/errors.ts` for what must not be logged).

## D99.56 — Web runtime telemetry: navigation timing and unhandled rejections — Open

**Moved from `TODO_logs.md`** (cross-cutting items; wave-6 task 26.20). **Priority:** P4 · **Effort:** Low.

**Evidence:** `apps/web/src` registers no `unhandledrejection` listener and never reads `performance.getEntriesByType('navigation')`; an error thrown outside a React render or a route loader/action reaches only the browser console, and page-load timing is not logged.

**Fix:** register both in `apps/web/src/main.tsx` through the web logger (`error` for rejections with the reason's name and message only, `debug` for navigation timing), and test them with jsdom events. Error tracking itself stays with D99.46.

The other `TODO_logs.md` items were already done when it was deleted: every P1/P2 target has logging (`d26-expand-logging`), API error logs serialize `err` with pino's standard serializer plus `toLoggableError` for database errors, and the HTTP access log (method, path, status, duration) is part of D99.46.

## D99.57 — Shared recipe links never reach the API's Open Graph renderer — Open

**Found during wave 6** (group 26, docs checked against code). **Priority:** P2 · **Effort:** Low.

**Evidence:** `apps/web/src/components/recipe/ShareSection.tsx` builds every share link as `${location.origin}/recipes/${slug}`, and the OG HTML for that path comes from the API's `crawlerMiddleware` (`apps/api/src/middleware/crawler.ts`). The web Caddy edge (`apps/web/Caddyfile`, snippet written by `docker-web-entrypoint.sh`) proxies only `/api/*`, `/uploads/*`, `/share/*` and the exact path `/health`, so a crawler fetching `/recipes/:slug` always gets the SPA's `index.html` without recipe OG tags. The API's `/share/:slug` page (`apps/api/src/routes/share.ts`) has the tags but nothing links to it.

**Fix:** either point the share buttons at `/share/:slug` (it already redirects browsers to `/recipes/:slug`), or route crawler user agents on `/recipes/*` to the API in the edge snippet; add a test that pins the chosen URL.

## D99.58 — robots.txt `Sitemap:` URL falls back to the SPA on split domains — Open

**Found during wave 6** (group 26, docs checked against code). **Priority:** P3 · **Effort:** Low.

**Evidence:** the `build-robots-txt` plugin in `apps/web/vite.config.ts` and the `PUBLIC_APP_URL` rewrite in `docker-web-entrypoint.sh` both write `Sitemap: <web origin>/api/v1/sitemap.xml`. On Coolify's split domains (web and API on separate hosts, `docs/deployment_coolify.md`) the web container serves static files only unless `API_UPSTREAM` is set, so that URL returns `index.html` instead of the sitemap.

**Fix:** derive the `Sitemap:` line from the API origin when no same-origin proxy is configured (for example from `VITE_API_URL`), or document `API_UPSTREAM` as required for the sitemap; extend `apps/web/src/robots.test.ts` and `scripts/ci/web-entrypoint.test.sh` to cover it.

## D99.59 — Reply button shown to the thread author, but the API answers 403 — Open

**Found during wave 6** (group 26, docs checked against code). **Priority:** P2 · **Effort:** Low.

**Evidence:** `canReplyToComment` in `apps/web/src/components/recipe/CommentSection.tsx` (`:263-269`) also returns `true` when the viewer authored the top-level comment, but `createComment` in `apps/api/src/modules/comment/service.ts` (`:72-74`) lets only the recipe author or an admin reply and throws `FORBIDDEN`, which `apps/api/src/modules/comment/index.ts` returns as 403 "Only the recipe author can reply to comments".

**Fix:** decide the rule once (`docs/comments.md` and `docs/architecture.md` describe the API rule and record this mismatch), then align the other side and add a component test plus a service test for a thread author replying.

## D99.60 — `grindSize` accepts 100 characters, the column holds 50 — Open

**Found during wave 6** (group 26, docs checked against code). **Priority:** P3 · **Effort:** Trivial.

**Evidence:** `recipeFields.grindSize` in `packages/shared/src/schemas/recipe.ts` is `z.string().max(100)`, but `recipe_version.grind_size` in `packages/db/src/schema.ts` is `varchar(50)`. A 51-100 character value passes validation and then fails in Postgres (SQLSTATE `22001`), which `apps/api/src/middleware/errorHandler.ts` maps to a generic 400 "A value is invalid for this field" instead of a field-level Zod error.

**Fix:** lower the schema limit to 50 (and the web input's `maxLength`), with a schema test at 50 and 51 characters.

## D99.61 — Taste-note search uses an unescaped, case-sensitive `like` — Open

**Found during wave 6** (group 26, docs checked against code). **Priority:** P3 · **Effort:** Low.

**Evidence:** `searchByName` in `apps/api/src/modules/taste/model.ts` filters with `like(tasteNotes.name, \`%${query}%\`)`: `%` and `_` in the query act as wildcards, and "fruity" does not match "Fruity". Recipe search already escapes its patterns with `toContainsPattern` (`apps/api/src/modules/recipe/model.ts`).

**Fix:** reuse the escaping helper with a case-insensitive match (`ilike`, as the other catalog searches do), and add model tests for mixed case and a literal `%`.

## D99.62 — `make ci` runs the web tests twice — Open

**Found during wave 6** (group 26, docs checked against code). **Priority:** P4 · **Effort:** Trivial.

**Evidence:** the `ci` target in `Makefile` runs `test-coverage` and then `test-web`, and the root `test-coverage` script (`package.json`) already ends with `pnpm --filter @brewform/web run test --coverage`; the root `ci` script repeats the same pair (`test-coverage`, then `pnpm --filter @brewform/web run test`).

**Fix:** drop the second web run from both, and keep `make test-web` as the standalone target.
