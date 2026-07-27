# Wave 5 — Debt Clearance: Tasks

**Execution order:** sections 1→11 follow the dependency order from design.md Decision 10
(T1 first; T3's Toast before T6; T6's config flip is the LAST task of its section; T8 after
sections 1–7 land their tests; T10's TS7 gate is the final gated section; T11 anytime). Land as
multiple PRs per design.md Decision 10 — tick checkboxes here across PRs.

**Blanket testing rule:** every production change in this wave ships with new/updated tests in the
same task section — no "tests later". The coverage gate (section 8) enforces ≥85% lines on the deno
scope (apps/api/src + packages/shared/src) and honest thresholds on web.

**Verification commands (memorize — repo gotchas):**

- Run test suites INDIVIDUALLY: `make test-api`, `make test-shared`,
  `cd apps/web && deno task test` (Vitest), `deno task test:db`. NEVER
  `make test 2>&1 | tail` — piping masks failures.
- Web type-check is `deno task check:web` (or `make check-web`) — bare `deno check` on apps/web
  yields ~84 pre-existing errors and proves nothing.
- Run `make fmt` after every edit batch (CI enforces `fmt --check`).
- 129 API tests need a `brewform_test` Postgres DB. Until task 8.1 lands the make target, provision
  manually mirroring `.github/workflows/pr.yml:63-113` (create `brewform_test` in the compose
  Postgres, run migrations + seed) — see `audit/coverage-audit.md` header. Doing task 8.1 early is
  allowed and encouraged.

**Audit evidence:** all file:line facts below were verified 2026-07-19 at commit fe9aad2. Full
inventories: `./audit/frontend-duplication.md`, `./audit/frontend-consistency.md`,
`./audit/coverage-audit.md`, `./audit/docblock-inventory.md`, `./audit/dependency-audit.md`,
`./audit/architecture-map.md`.

## 1. T1 — Correctness & CI health

The advertised full-suite entry points (`deno task test`, `deno task ci`) are broken by a TS2352 in
`test:db`; the comment surface has no visibility gate (D99.9 — private/draft recipe content leaks
via comments and F04 mention emails); four test files test a mirror instead of production code.
Everything downstream depends on green pipelines — do this section first. No dependencies.

- [x] 1.1 Fix the TS2352 breaking `deno task test:db`. The failing cast is
      `col as IndexedColumn` at `packages/db/src/schema-indexes.test.ts:84`
      (`deno task --cwd packages/db test` type-checks before running; the task has no `--no-check`).
      Read the actual types involved and fix the cast properly (e.g. narrow via the drizzle
      `getTableConfig` return types, or `as unknown as IndexedColumn` with a one-line justification
      comment if the drizzle types genuinely don't line up). Do NOT add `--no-check` to
      `packages/db/deno.json:16` — the type-check is the point. Verify: `deno task test:db`
      type-checks clean and (with a provisioned test DB) reports 25 passed, 0 failed.
- [x] 1.2 D99.9 step 1 — extract a shared visibility predicate. In
      `apps/api/src/modules/recipe/service.ts` add and export
      `canViewRecipe(recipe: { visibility: string; authorId: string }, userId?: string | null, isAdmin?: boolean): boolean`,
      encoding the semantics currently inline at `apps/api/src/modules/recipe/index.ts:316-319`:
      public/unlisted → true; draft/private → `userId === recipe.authorId` OR `isAdmin` (admin
      bypass is deliberate — the comment-reply rule at `comment/service.ts:63` already honours
      isAdmin; note the bypass in the docblock). Add unit tests for the predicate (all 4
      visibilities × anonymous/non-owner/owner/admin).
- [x] 1.3 Refactor `recipe/index.ts` GET `/:slugOrId` (:316-319) and GET `/:slug/versions`
      (:281-284) to call `canViewRecipe`. Behaviour-preserving — keep the 404 'Recipe not found'
      responses exactly as they are. Run `make test-api`: existing recipe route tests must pass
      unchanged.
- [x] 1.4 D99.9 — gate `createComment`. In `apps/api/src/modules/comment/model.ts` add
      `getRecipeForAccessCheck(recipeId)` returning `{ authorId, visibility }` with
      `isNull(recipes.deletedAt)` (mirror `getRecipeForNotification` at `model.ts:144-155`). In
      `apps/api/src/modules/comment/service.ts` `createComment` (:48-110), before any other logic:
      load the recipe via the new helper; `throw new Error('RECIPE_NOT_FOUND')` when the recipe is
      missing OR `!canViewRecipe(recipe, userId, isAdmin)`. Reuse the loaded `authorId` for the
      existing reply-permission check (:62-65), replacing the separate `getRecipeAuthorId` call.
      Mention side-effects (`service.ts:100-105`) need NO separate gate — they already run only
      inside successful creation (design.md Decision 6).
- [x] 1.5 D99.9 — map the new error in the comment POST route. In
      `apps/api/src/modules/comment/index.ts` POST handler catch (:97-118), map
      `'RECIPE_NOT_FOUND'` → `error(c, 'NOT_FOUND', 'Recipe not found', 404)`. Add a 404 'Recipe
      not found' variant to the `describeRoute` responses (:65-68 currently documents only 'Parent
      comment not found'). 404, NOT 403 — existence-hiding matches the recipe GET convention
      (`recipe/index.ts:251/283/318`, `share.ts:76`); nonexistent-recipe UUIDs get the same clean
      404 instead of today's FK error.
- [x] 1.6 D99.9 — gate `listComments` (parity: gating only create still leaks content via list).
      Add `optionalAuthMiddleware` (imported from `../../middleware/auth.ts`, as used at
      `recipe/index.ts:311`) to GET `/recipe/:recipeId` in `comment/index.ts` (:123-157). Change
      `service.listComments` (:187-189) to accept `userId`/`isAdmin`, perform the same
      `getRecipeForAccessCheck` + `canViewRecipe` gate throwing `'RECIPE_NOT_FOUND'`, map to 404 in
      the route, and document 404 in its OpenAPI responses.
- [x] 1.7 D99.9 — tests. In `comment/service.test.ts` (stub via the existing deps proxy,
      `comment/service.ts:25-31`): matrix `createComment` across visibility {draft, private,
      unlisted, public} × caller {non-owner, owner, admin}, asserting `RECIPE_NOT_FOUND` rejections
      and that `deps.model.create`, `deps.recipeModel.incrementComments`, and mention side-effects
      (`deps.createMentionNotifications` / `deps.notifyRecipeCommented`) are never invoked on
      rejection; same matrix for `listComments`. In `comment/index.test.ts`: POST returns 404
      envelope for invisible recipe (non-owner) and 201 for owner-on-draft; GET returns 404 for
      invisible recipe when anonymous and 200 for owner with auth token.
      **Do NOT** gate `toggleLike`, `toggleFavourite`, `POST /:id/rate`, or `saveNotes` in this
      wave — the same gap exists there but is explicitly ledgered as a follow-up (design.md
      Decision 6: bundling would make T1's behavioural diff too wide to review).
- [x] 1.8 Rewrite mock-mirror test file 1/4: `apps/api/src/modules/admin/service.test.ts`
      (492 lines, defines its own `MockModel` and mirror logic, zero imports from `./service.ts` —
      the real `admin/service.ts` is 707 lines at 0.8% coverage). Delete the mirrored
      implementation wholesale; keep the old file's scenario list as a checklist so no behavioural
      intent is lost. Write tests that `import * as service from './service.ts'` and hit the
      scratch `brewform_test` DB, following the `equipment/model.test.ts` pattern (test-setup.ts
      first import, inline `crypto.randomUUID()` fixtures, `afterEach` hard-delete,
      `{ sanitizeOps: false, sanitizeResources: false }` on DB describes). If real admin-module
      bugs surface, fix them in SEPARATE commits so the test-rewrite diff stays reviewable
      (design.md Decision 8 / Risk 1).
- [x] 1.9 Rewrite mock-mirror test file 2/4: `apps/api/src/modules/admin/index.test.ts` (builds a
      parallel Hono app from `@brewform/shared/schemas` + zValidator at index.test.ts:4-16; never
      imports `./index.ts` — real admin router at 26.1%). Mount the REAL admin router on a stub
      Hono app with auth stubbed at the middleware seam, following the `bodyLimit.test.ts` pattern
      (`app.request('/api/v1/...')`, assert status codes + response bodies). Same
      scenario-checklist rule as 1.8.
- [x] 1.10 Rewrite mock-mirror test files 3/4 and 4/4:
      `apps/api/src/modules/equipment/service.test.ts` (38 lines, no import of ./service.ts →
      5.0%) and `apps/api/src/modules/photo/service.test.ts` (no import of ./service.ts → 29.2%).
      Same rewrite protocol as 1.8 (real imports, scratch DB, equipment/model.test.ts pattern).
      Note equipment/service.ts uses the cache singleton — swap it in tests via
      `setCacheProvider(new InMemoryCacheProvider())` (pattern:
      `apps/api/src/modules/coffee-variety/service.test.ts:15,30-46`).
- [x] 1.11 Section verification: `deno task test:db` (type-checks + 25 pass), `make test-api` (all
      rewritten files pass, zero mirrored code remains — grep gate:
      `grep -L "from './service.ts'" apps/api/src/modules/admin/service.test.ts apps/api/src/modules/equipment/service.test.ts apps/api/src/modules/photo/service.test.ts`
      → empty; `grep -l "from './index.ts'" apps/api/src/modules/admin/index.test.ts` → match),
      `make test-shared`, `deno task check:web`, `make lint`, `make fmt`.

## 2. T2 — Collections completion (D99.1 + D99.5 + D99.6 + D99.3)

`getCollection` re-runs a 4-level multi-join (`collection/model.ts:9-33`) on every GET;
`getCollectionsForRecipe` has zero consumers (US-9 never shipped); 3 collection pages are untested
AND invisible to coverage; seed `sortOrder` is globally sequenced. Depends on: none (section 1
first for green CI). The cached-hit visibility re-check (2.2) is the load-bearing security line —
design.md Risk 3.

- [x] 2.1 Cache wiring — constants + singleton import. In
      `apps/api/src/modules/collection/service.ts` add
      `import { cacheProvider } from '../../utils/cache/singleton.ts';` (the `equipment/service.ts`
      pattern — no router-signature changes; note taste's "DI" is itself singleton-fed via
      `taste/index.ts:21` and `c.get('cache')` is read nowhere, so do NOT plumb Hono context).
      Module constants: `const COLLECTION_DETAIL_KEY = (id: string) => ['collection-detail', id];`,
      `const COLLECTION_DETAIL_TTL_MS = 10 * 60 * 1000;`,
      `const COLLECTION_LIST_PREFIX = ['cache', 'collections'];`,
      `const COLLECTION_LIST_TTL_MS = 5 * 60 * 1000;`.
- [x] 2.2 Wrap `getCollection` (`service.ts:153`) with cache-aside: on entry
      `cacheProvider?.get<ReturnType<typeof toDetailOutput>>(COLLECTION_DETAIL_KEY(collectionId))`;
      on hit, RE-APPLY the visibility check against the cached shape —
      `if ((cached.visibility === 'private' || cached.visibility === 'draft') && cached.userId !== userId) throw new Error('FORBIDDEN');`
      (the shape keeps `userId` at `service.ts:25` and `visibility` at `:28`) — then return cached.
      On miss, keep the existing `model.findById` + COLLECTION_NOT_FOUND/FORBIDDEN logic
      (`:155-162`), compute `const result = toDetailOutput(collection)`, `await cacheProvider?.set(
      COLLECTION_DETAIL_KEY(collectionId), result, { ttlMs: COLLECTION_DETAIL_TTL_MS })`, return.
      Cache only AFTER the not-found check; cache regardless of visibility (the re-check guards
      private/draft hits). A cache hit must NEVER widen access.
- [x] 2.3 Wrap the three list functions with prefix-keyed cache (5 min TTL):
      `listMyCollections` (`:177`) — when the optional `recipeId` param is set, BYPASS the cache
      entirely (read-through, no store): the per-(user, recipe) `containsRecipe` overlay feeds the
      AddToCollection modal and has near-zero hit rate (design.md Decision 5). Without `recipeId`,
      key `['cache','collections','my', userId, page, perPage, visibility ?? 'all']`.
      `listPublicCollections` (`:197`) key `['cache','collections','user', userId, page, perPage]`;
      `listAllPublicCollections` (`:213`) key `['cache','collections','public', page, perPage]`.
      Keep key-part types consistent with `InMemoryCacheProvider`'s `join(':')` keying.
- [x] 2.4 Invalidation in all SIX mutation functions (not five): `createCollection` (`:97`) →
      `await cacheProvider?.deleteByPrefix(COLLECTION_LIST_PREFIX)` ONLY (fresh UUID — no detail
      entry can exist); `updateCollection` (`:114`), `deleteCollection` (`:136`),
      `addRecipeToCollection` (`:255`), `removeRecipeFromCollection` (`:297`), `reorderCollection`
      (`:319`) → `await cacheProvider?.delete(COLLECTION_DETAIL_KEY(collectionId))` AND
      `deleteByPrefix(COLLECTION_LIST_PREFIX)`, placed after the model write succeeds (in
      `addRecipeToCollection`, after the try/catch at `:268-285` so ALREADY_IN_COLLECTION failures
      don't flush the cache).
- [x] 2.5 Cache tests in `apps/api/src/modules/collection/service_test.ts` (extend the existing
      Deno.test blocks at `:86-574`): in shared beforeEach/afterEach swap the singleton via
      `setCacheProvider(new InMemoryCacheProvider())` and restore (copy
      `apps/api/src/middleware/rateLimit.test.ts:7-12` and
      `apps/api/src/modules/coffee-variety/service.test.ts:15,30-46`). Cover: (a) getCollection
      miss → second call hit; (b) cached private collection requested by NON-owner → still throws
      FORBIDDEN (warm as owner, request as another userId); (c) cached private by owner →
      returned; (d) each of the 5 detail-invalidating mutations deletes
      `['collection-detail', id]` (cache.get returns null after mutation); (e) createCollection +
      every mutation sweeps the `['cache','collections']` prefix; (f) `listMyCollections` with
      `recipeId` neither reads nor writes the cache (containsRecipe correctness under the bypass).
- [x] 2.6 Integration test in `apps/api/src/modules/collection/index_test.ts`: repeated
      GET `/api/v1/collections/:id` returns identical payloads with the second served from cache
      (assert via logger spy on the cache-hit debug line, matching the equipment idiom at
      `equipment/service.ts:34`); GET as anonymous on a private collection returns 403 both BEFORE
      and AFTER the owner has warmed the cache.
- [x] 2.7 Guardrail: NO changes to `collection/index.ts` routes, `collection/model.ts`, or apps/web
      for the cache work — the singleton import keeps the router untouched.
- [x] 2.8 D99.5 model. Extend `getCollectionsForRecipe`
      (`apps/api/src/modules/collection/model.ts:287`) to
      `getCollectionsForRecipe(recipeId: string, viewerId: string | null)` — replace the
      hard-coded `eq(collections.visibility, 'public')` at `model.ts:304` with a conditionally
      built predicate: when `viewerId` is non-null,
      `or(eq(collections.visibility, 'public'), eq(collections.userId, viewerId))`; when null, the
      public predicate alone (do NOT introduce a `` sql`false` `` fragment — that would be a new
      stray sql tag). Keep `isNull(collections.deletedAt)`; update the JSDoc at `:286`. EXTEND (do
      not delete) the existing assertions at `model_test.ts:626-676`: pass a viewerId; add cases —
      non-owner viewer gets public only; owner viewer additionally gets own
      private/draft/unlisted; soft-deleted collections excluded (design.md Risk 4).
- [x] 2.9 D99.5 service. Add `listCollectionsForRecipe(viewerId: string | null, recipeId: string)`
      to `collection/service.ts` (near `listPublicCollections`, `:196`) — no recipe
      existence/visibility check needed here (the route sits under the recipe read path); call
      `model.getCollectionsForRecipe(recipeId, viewerId)`, log via the module logger like
      `service.ts:153/:163`, map rows through the list-item shape. Do NOT cache this new surface
      in wave 5 (the ledger docCorrection drops the old cache sub-item; note it in the docblock).
      Service tests mirroring the visibility matrix (owner sees own private, stranger does not).
- [x] 2.10 D99.5 shared schema. In `packages/shared/src/schemas/collection.ts` add
      `RecipeCollectionsOutputSchema` (array item `{id, name, visibility, userId}`, or reuse
      `CollectionListItemOutputSchema` minus recipeCount) and export the inferred type through the
      package index, matching how `CollectionListItemOutput` is exported. House-style docblocks on
      both (section 9 blanket rule).
- [x] 2.11 D99.5 route. Register GET `/:slugOrId/collections` in
      `apps/api/src/modules/recipe/index.ts` next to the other `/:id/*` routes (after GET
      `'/:slug/versions'` at `:263`). Hono route order: register BEFORE the catch-all GET
      `'/:slugOrId'` at `:300-301`. Use `describeRoute` + `resolver(...)` with the new schema (copy
      the doc pattern from `collection/index.ts:537-566`), `optionalAuthGuard`, read
      `c.get('userId')` as viewerId, resolve the recipe id from the slugOrId param the same way
      GET `'/:slugOrId'` does (404 'Recipe not found' when unresolvable), return the standard list
      envelope. Route integration test in the recipe module's route test file: 200 with public
      collections for anonymous; includes own private when authenticated as owner; excludes
      others' private; clean 404 on nonexistent recipe.
- [x] 2.12 D99.5 web client. Add to `collectionApi` in `apps/web/src/api/index.ts:262-290`:
      `listByRecipe: (recipeIdOrSlug: string) => api.get<RecipeCollectionsOutput[]>(
      `/recipes/${recipeIdOrSlug}/collections`)` — follow the get/getWithMeta convention of the
      endpoint's actual envelope.
- [x] 2.13 D99.5 loader + UI. In `apps/web/src/pages/recipes/RecipeDetailPage.tsx` extend
      `DetailLoaderData` (`:45-49`) with `collections: RecipeCollectionsOutput[]`; add
      `collectionApi.listByRecipe(recipe.id)` to the existing `Promise.all` at `:75-78`
      (recipe.id is available — the recipe fetch resolves first) with `.catch(() => [])` plus a
      one-line comment ("collections outage must not 500 the recipe page" — so the section-6
      swallow sweep classifies it intentional). Render an 'In collections' section near the
      AddToCollectionButton sidebar block (`:227-228`): each collection name a
      `<Link to={`/collections/${c.id}`}>`; hide the section when the array is empty. i18n keys in
      en+tr under the existing `collections.*` namespace.
- [x] 2.14 D99.5 page test. In `RecipeDetailPage.test.tsx` add: section renders links when loader
      data has collections; section absent when empty. Mock `collectionApi.listByRecipe` alongside
      the existing recipeApi/commentApi mocks.
- [x] 2.15 D99.6 test 1/3 — create `apps/web/src/pages/collections/CollectionListPage.test.tsx`
      following `CollectionsBrowsePage.test.tsx`: hoisted `vi.mock` of `'../../api/index.ts'`
      (`{ collectionApi: { list: vi.fn() } }`), `'../../contexts/I18nContext.tsx'` (useTranslation
      stub), `'@/utils/logger.ts'` (createLogger stub); import `{ CollectionListPage, loader }`
      after mocks; render via `createMemoryRouter([{ path: '/collections', element:
      <CollectionListPage />, loader, HydrateFallback: () => null }], { initialEntries:
      ['/collections'] })`. Tests: (a) heading `collection.list.title` + Create link href
      `/collections/new` (`CollectionListPage.tsx:53`); (b) empty-state text for zero collections
      (`:61`); (c) with 2 collections in a `PaginatedResponse<CollectionListItemOutput>`,
      CollectionCard names render and card links point to `/collections/:id` (reuse the
      makeCollection/makeListResponse factories from `AddToCollectionModal.test.tsx:57-85`).
- [x] 2.16 D99.6 test 2/3 — create `CollectionCreatePage.test.tsx`: same mock scaffold but
      `collectionApi: { create: vi.fn() }`; no loader — routes `[{ path: '/collections/new',
      element: <CollectionCreatePage /> }, { path: '/collections/:id', element: null }]` so the
      post-create `navigate('/collections/${created.id}')` at `CollectionCreatePage.tsx:40`
      resolves. Tests: (a) visibility `<select>` exposes exactly 4 options
      draft/private/unlisted/public in that order (`:86-89` — regression lock for D99.2); (b)
      submit disabled while name empty (`:94`); (c) type name + select 'public' + submit → create
      called with `{ name, visibility: 'public' }` and NO description key when the textarea is
      blank (`:33-37`); (d) with description filled, payload includes trimmed description; assert
      router navigated to `/collections/<id>` via `router.state.location.pathname`.
- [x] 2.17 D99.6 test 3/3 — create `CollectionEditPage.test.tsx`: mock
      `collectionApi { get: vi.fn(), update: vi.fn() }` + the fake ApiError class (copy
      `CollectionDetailPage.test.tsx:10-18`); import `{ CollectionEditPage, loader }`; route
      `{ path: '/collections/:id/edit', element, loader, HydrateFallback }` with initialEntries
      `['/collections/c1/edit']` and a stub `/collections/:id` route. Tests: (a) form pre-fills
      name/description/visibility from loader data (`CollectionEditPage.tsx:46-48`); (b) select
      has 4 options with the current visibility selected (`:119-122`); (c) edit name + submit →
      update called with `('c1', { name, visibility })`, description omitted when unchanged
      (`:63-70`); (d) changed description IS included; (e) unit-test the loader: mocked get
      rejects with ApiError(404) → `await expect(loader({ params: { id: 'missing' } })).rejects`
      and the thrown value is a Response with status 404 (`:29-31`); params without id → 404
      (`:23`).
- [x] 2.18 D99.3 seed sortOrder. In `packages/db/src/seed.ts` `seedCollections` (`:826-925`):
      delete `let collectionSortOrder = 0;` at `:845` and declare it inside the
      `for (const def of collectionDefs)` loop (immediately after `:876`, or just before the
      `for (const slug of recipesToAdd)` loop at `:911`) so each collection numbers its items
      0..n-1; keep the `collectionSortOrder++` usage at `:918`. Re-seed semantics: change the
      insert at `:919-921` from `.onConflictDoNothing` to `.onConflictDoUpdate({ target:
      [collectionItems.collectionId, collectionItems.recipeId], set: { sortOrder: <value> } })` so
      re-seeding a dirty DB also repairs old globally-sequenced rows (makes the ledger acceptance
      criterion at `plans/D99-debts.md:204` hold everywhere). Test: extend
      `packages/db/src/seed.idempotent.test.ts` (already runs `main()` twice at `:111-112`) or add
      a sibling: select all collection items, group by collectionId, assert each group's sorted
      sortOrder values equal `[0, 1, ..., n-1]` (contiguous, from 0); assert at least one
      collection has >2 items so a shared counter would actually be caught (public/unlisted
      collections seed up to 5 items each, `seed.ts:900-905`).
- [x] 2.19 Section verification: `make test-api`, `deno task test:db`, `make test-shared`,
      `cd apps/web && deno task test`, `deno task check:web`, `make lint`, `make fmt`. Manual
      (`make dev`): recipe detail shows the In-collections section; anonymous GET on a private
      collection is 403 before AND after owner warm-up.

## 3. T3 — Frontend DRY (primitives-first)

Extract shared blocks that pages compose; do NOT build generic `CrudListPage`/`CatalogPage`
components (design.md Decision 4 — explicitly rejected). The Toast primitive (3.6) is a hard
prerequisite for section 6's empty-catch fixes. New UI strings land with en+tr keys in the same PR
(parity PBT).

- [x] 3.1 RecipeCard extension. Extend `apps/web/src/components/recipe-list/RecipeCard.tsx` to
      accept a minimal picked recipe shape
      `{ id, slug, title, likeCount, commentCount, forkCount?, author? }` plus optional props
      `hideAuthor?` and `version?` (brew-method/drink-type/★-rating strip — the strip
      RecipeCard's docstring at `:14-19` says was removed only because GET /recipes lacks
      currentVersion; the variety endpoint has version data). Replace the hardcoded English
      `'by '` at `RecipeCard.tsx:28` with `t()` (reuse `recipe.focusMode.by` or add a
      `recipe.card.by` key — en+tr). Extend `RecipeCard.test.tsx`: author hidden with hideAuthor,
      version strip renders when passed, fork count conditional, 'by' label translated.
- [x] 3.2 RecipeCard adoption — delete the three hand-rolled card blocks and render
      `<RecipeCard …>`: `UserProfilePage.tsx:226-243` (hideAuthor; show forkCount when the data
      has it), `EquipmentDetailPage.tsx:162-181` (author becomes clickable — deliberate divergence
      resolution: canonical stopPropagation author button everywhere),
      `CoffeeVarietyDetailPage.tsx:209-243` (pass `r.versions[0]` as the version-strip data;
      type `RecipeWithVersionsOutput`). ~70 lines removed. Update the three pages' tests to assert
      the shared card renders (e.g. author button present/absent).
- [x] 3.3 AuthorButton extraction. New `components/ui/AuthorButton.tsx` `{ author }` built from
      `RecipeCard.styles.ts` `AUTHOR_BUTTON_STYLE` — canonical color `var(--accent-primary)` wins
      over CollectionCard's drifted `color: 'inherit'`. Use it in `recipe-list/RecipeCard.tsx:30-40`
      and `CollectionCard.tsx:73-89`. DELETE
      `apps/web/src/components/recipe/RecipeCard.styles.ts` (stale leftover in the old
      `components/recipe/` location). Grep gate: `rg -l "RecipeCard.styles" apps/web/src` → empty.
- [x] 3.4 CollectionCard adoption. Replace the hand-rolled collection card at
      `UserProfilePage.tsx:253-269` with `<CollectionCard collection={c} />` — the inline copy
      takes the exact same `CollectionListItemOutput` and silently dropped the visibility badge
      and description. ~17 lines. Extend UserProfilePage tests for the collections tab.
- [x] 3.5 PaginationControls promotion + adoption. Move
      `components/recipe-list/PaginationControls.tsx` → `components/ui/`; call `useTranslation()`
      internally with the three label props made optional overrides (every consumer passes
      identical `t('common.previous')/t('common.next')/t('common.pagination')` —
      `RecipeListView.tsx:339-341`, `NotificationListPage.tsx:132-134`); add
      `variant: 'hide' | 'disable'`. Replace the inline clones: `CoffeeVarietiesPage.tsx:260-287`
      and `EquipmentCatalogPage.tsx:279-306` (byte-for-byte), `AdminCoffeeVarietiesPage.tsx:573-598`
      (disable variant), `AdminAuditLogPage.tsx:124-137` (prev/next-only). LEAVE
      `AdminUsersPage.tsx:283-317` (numbered-pages variant) as-is — optional follow-up; do not
      force it into the shared component. Update the two existing import sites for the new path.
      ~80 lines removed.
- [x] 3.6 Toast primitive (design.md Decision 2 — house-built, zero dependencies). New
      `components/ui/Toast.tsx`: `ToastProvider` (React context + reducer holding a small toast
      queue) mounted once in `Layout.tsx`; `useToast()` returns `toast.success(i18nKey)` /
      `toast.error(i18nKey)` — KEYS, not strings (i18n by construction). Auto-dismiss timeout,
      `role='status'` + `aria-live='polite'`, themed via existing CSS vars (verify all three
      themes). Component tests: renders, auto-dismisses, stacks multiple, error/success styling.
- [x] 3.7 Modal + ConfirmDialog primitives. New `components/ui/Modal.tsx` (overlay shell —
      `fixed inset-0 … z-50` + `.card` panel, Escape close, backdrop-click close, focus trap) and
      a `useConfirm()` promise hook:
      `if (await confirm({ titleKey, bodyKey, danger: true })) { … }` — one dialog component
      mounted by the provider alongside toasts in `Layout.tsx`, styled with `.card`/`.btn-danger`
      (`.btn-danger` lands in 4.3 — if this task lands first, use a temporary
      `style={{ background: 'var(--error)' }}` and swap in 4.3). Rebase `BanDialog.tsx:46-50` and
      `AddToCollectionModal.tsx:128-135` onto Modal; replace the bespoke inline delete-confirm
      modal at `AdminCoffeeVarietiesPage.tsx:603-634` with `useConfirm`. Tests: Escape/backdrop
      behavior, promise resolves true/false, focus trap.
- [x] 3.8 Migrate all 9 `globalThis.confirm` sites to `useConfirm()`:
      `EquipmentListPage.tsx:71`, `SetupListPage.tsx:58`, `BeanListPage.tsx:61`,
      `SettingsPage.tsx:112`, `AdminRecipesPage.tsx:51`, `AdminUserDetailPage.tsx:61`,
      `AdminVendorsPage.tsx:61`, `AdminTasteNotesPage.tsx:64`, `AdminEquipmentPage.tsx:78`. The
      three `t(key)+'?'` concat sites use the dedicated deleteConfirm keys added in 5.9 —
      coordinate (same PR or land 5.9's keys first). Grep gate:
      `rg -n "globalThis.confirm" apps/web/src` → zero matches.
- [x] 3.9 EmptyState/LoadingState primitives. New `components/ui/EmptyState.tsx`
      `{ message, action? }` (standard `text-center py-12` + `var(--text-tertiary)`) and
      `components/ui/LoadingState.tsx` (centered `t('common.loading')`); generalize
      `RecipeCardSkeletonGrid` (`Skeleton.tsx:88-94`) into `CardSkeletonGrid { count, variant }`
      usable for catalog cards. Adopt mechanically at the ~19 empty-state and ~18 loading-text
      sites listed in `audit/frontend-duplication.md` §3.4/§3.5 (representative:
      `RecipeListView.tsx:325-327`, Bean/Setup/EquipmentListPage, `CollectionListPage.tsx:60-62`,
      `NotificationListPage.tsx:113-115`, `EquipmentCatalogPage.tsx:208-221` and
      `CoffeeVarietiesPage.tsx:179-193` with clear-filters action, the 8 admin pages' left-aligned
      loading variants, `TasteNotesPage.tsx:290/293`). Skeleton-vs-text policy decisions belong to
      4.6 — this task is the mechanical primitive swap.
- [x] 3.10 CollectionVisibilityBadge. Extract the identical
      `public→🌐 / unlisted→🔗 / private→🔒` ternary from `CollectionCard.tsx:46-50`,
      `CollectionDetailPage.tsx:59-63`, `AddToCollectionModal.tsx:175-179` into
      `components/collections/CollectionVisibilityBadge.tsx` (or a `visibilityEmoji` util); use at
      all 3 sites. Do NOT touch recipes' `MetadataBadges` dot-badge — intentionally different
      design.
- [x] 3.11 Field ⇄ FilterField merge + label adoption. Merge
      `components/recipe-list/FilterField.tsx:7-19` into `components/form/Field.tsx` (optional
      `required` prop covers both; delete FilterField, update RecipeListView). Mechanically adopt
      Field for the ~45 raw label blocks
      (`className='block text-sm font-medium mb-1'` + inline color) across the 13 non-adopting
      files (counts per audit §3.7: SettingsPage 8, BeanListPage 5, AdminUserEditPage 5,
      AdminUserCreatePage 5, EquipmentListPage 4, AdminEquipmentPage 4, SetupListPage 3,
      AdminCoffeeVarietiesPage 3, AdminVendorsPage 3, AdminTasteNotesPage 2, RecipeForkPage 1,
      BanDialog 1). htmlFor/error/help extensions are task 4.8 — here only the mechanical swap.
- [x] 3.12 Catalog shared blocks (primitives, NOT a CatalogPage). Extract: `CategoryTabs`,
      `CatalogEntityCard` (title/brand + TypeBadge + line-clamped description),
      `TypeBadge { label }` + `varietyCategoryLabel(t, category)` helper (accent pill ×4:
      `EquipmentCatalogPage.tsx:248-258`, `EquipmentDetailPage.tsx:120-127`,
      `CoffeeVarietiesPage.tsx:207-223`, `CoffeeVarietyDetailPage.tsx:148-161`). Adopt in
      `CoffeeVarietiesPage` + `EquipmentCatalogPage`, collapsing their 8 duplicated blocks (audit
      §2c: updateFilter URL helper, pill tabs, search input, active-filters row, skeleton grid →
      CardSkeletonGrid, error/empty → ErrorState (4.2)/EmptyState, entity card, pagination → 3.5).
      Replace the local `CatalogEquipmentItem` (`EquipmentCatalogPage.tsx:12-19`) with shared
      `EquipmentOutput`. Each page keeps its own explicit composition.
- [x] 3.13 CRUD-triplet blocks. Extract `OwnedItemCard { title, subtitle?, meta, onDelete }` for
      the identical item-card JSX at `BeanListPage.tsx:185-218`, `EquipmentListPage.tsx:193-221`,
      `SetupListPage.tsx:154-187` (~90 lines); the three inline forms adopt Field via 3.11's
      sweep. Do NOT build a `ManagedListPage` shell.
- [x] 3.14 Generic Breadcrumb. New `components/ui/Breadcrumb.tsx` `{ items: {label, to?}[] }` from
      the `<nav aria-label><ol>` shell duplicated at `BreadcrumbNav.tsx:31-81`,
      `EquipmentDetailPage.tsx:97-117`, `CoffeeVarietyDetailPage.tsx:128-145`; `BreadcrumbNav`
      becomes a thin adapter over it. i18n fixes and page adoption are task 4.5.
- [x] 3.15 Section verification: `cd apps/web && deno task test` (all new primitive tests + updated
      page tests pass), `deno task check:web`, `make lint`, `make fmt`. Grep gates:
      `rg -n "card hover:shadow-lg" apps/web/src/pages` → zero (only shared components carry the
      card-link shell, audit §3.6); `rg -n "globalThis.confirm" apps/web/src` → zero.

## 4. T4 — Visual consistency

Depends on section 3's primitives (EmptyState/LoadingState/Breadcrumb/Field/CardSkeletonGrid). All
theming changes must be verified in light, dark, AND coffee themes.

- [x] 4.1 Page-shell normalization. House shell is `mx-auto max-w-{2xl|4xl|6xl} px-6 py-8`
      (list/detail 4xl, browse/grid 6xl, forms 2xl, auth md+py-12 — audit
      `frontend-consistency.md` §1). Add a small `PageContainer { width }` component (preferred
      over a bare class convention — stops re-drift) and convert the divergent pages:
      `CollectionListPage.tsx:48`, `CollectionsBrowsePage.tsx:49`, `CollectionDetailPage.tsx:66`
      (all `container mx-auto px-4` with NO max-width — up to 1536px vs 896px siblings),
      `CollectionCreatePage.tsx:49`, `CollectionEditPage.tsx:81` (px-4 gutter), and
      `RecipeVersionsPage.tsx:69` (`max-w-4xl px-4 py-12` third variant). Update the pages' tests
      if they assert on wrapper classes.
- [x] 4.2 Themed ErrorState/ErrorBanner. New component with `role='alert'` styled from theme vars;
      define `--error-bg` per theme in `globals.css` (`:root`/`.dark`/`.coffee` — currently only
      `--error` exists at `globals.css:44`, so the `#fef2f2` fallback renders a pastel-pink box in
      dark/coffee). Replace all four divergent error presentations: solid banners
      (`LoginPage.tsx:54`, `RegisterPage.tsx:121`, `ForgotPasswordPage.tsx:70`,
      `ResetPasswordPage.tsx:97`, `RecipeCreatePage.tsx:213`, `RecipeEditPage.tsx:186`,
      `RecipeForkPage.tsx:82`, `SettingsPage.tsx:140`), tinted `--error-bg` banners
      (`AdminUserCreatePage.tsx:91`, `AdminUserEditPage.tsx:191`, `AdminUserDetailPage.tsx:260`,
      `AdminUsersPage.tsx:94,103`), bare red text (`EquipmentCatalogPage.tsx:191`,
      `CoffeeVarietiesPage.tsx:162`, `RecipeFocusModePage.tsx:54`), Tailwind-arbitrary clone
      (`ContactPage.tsx:73`). Component test + theme screenshot check.
- [x] 4.3 Buttons. Replace hand-rolled accent elements hardcoding `color: 'white'` with
      `.btn-primary`/`.badge`: `EquipmentDetailPage.tsx:123`, `CoffeeVarietyDetailPage.tsx:151`,
      `EquipmentCatalogPage.tsx:252`, `CoffeeVarietiesPage.tsx:211`,
      `EmailVerificationBanner.tsx:31`, `Layout.tsx:26` (`.btn-primary`'s
      `color: var(--bg-primary)` — dark text on gold in dark theme — is the CORRECT house
      rendering). Add `.btn-danger` to `globals.css` (text-link + solid variants), replacing the
      red-text deletes (`EquipmentListPage.tsx:214`, `BeanListPage.tsx:211`,
      `SetupListPage.tsx:180`, `AdminUserDetailPage.tsx:297`, `AdminVendorsPage.tsx:201`,
      `AdminEquipmentPage.tsx:247`, `AdminTasteNotesPage.tsx:155`, `AdminRecipesPage.tsx:125`,
      `AdminUsersPage.tsx:224`) and solid-red buttons (`AdminCoffeeVarietiesPage.tsx:627`,
      `SettingsPage.tsx:380`). Fold the `min-h-11` tap-target sizing into the base button classes
      (removes the ad hoc `btn-primary text-sm min-h-11 px-4` at `CollectionListPage.tsx:53`).
- [x] 4.4 Locale-aware date/number formatting. Add `formatDate(date, locale)` /
      `formatNumber(n, locale)` helpers (new `apps/web/src/utils/format.ts`) driven by the
      I18nContext locale. Sweep the 8 bare `toLocaleDateString()` sites:
      `RecipeVersionsPage.tsx:93`, `AdminUserDetailPage.tsx:209,217`, `AdminUsersPage.tsx:190`,
      `AdminAuditLogPage.tsx:100`, `NotificationItem.tsx:101`, `CommentSection.tsx:305,395`.
      Replace `BeanSection.tsx:33-34` `formatDateISO` (raw `YYYY-MM-DD` rendered at `:231` — the
      recipe page currently shows ISO dates and browser-locale dates on the same screen).
      `PrivacyPage.tsx:27`/`TermsPage.tsx:27` are already locale-aware — optionally migrate to the
      helper. Unit tests: en vs tr output for both helpers.
- [x] 4.5 Single i18n'd BreadcrumbNav. Fix `BreadcrumbNav.tsx`: untranslated `'Recipes'` at `:45`
      → `t('recipe.list.title')`; untranslated BREW_METHODS labels (`:9-17,68`); replace the JS
      `onMouseEnter/Leave` style-mutation hover (`:37-43`) with CSS hover classes. Adopt the
      generic Breadcrumb (3.14) on `EquipmentDetailPage` (`:97-117`) and
      `CoffeeVarietyDetailPage` (`:128-145`); add a breadcrumb to `CollectionDetailPage`
      (currently NO back nav at all). Pick ONE back-link convention for the remaining pages
      (recommend breadcrumbs on detail pages; kill the literal `'← '` at
      `RecipeVersionsPage.tsx:75` and the arrow-baked `admin.users.backToUsersArrow` key usage).
- [x] 4.6 Loading normalization. `RecipeListView` uses the skeleton grid for EVERY source
      (currently plain text for starred/user/collection at `RecipeListView.tsx:315-321`); replace
      the raw `animate-pulse` divs at `AdminUserEditPage.tsx:136,140` and `AdminUsersPage.tsx:128`
      with Skeleton components; remaining text-loaders standardize on LoadingState (3.9). Align
      all empty states on `--text-tertiary` (collections/notifications drift to
      `--text-secondary`: `CollectionListPage.tsx:60`, `CollectionsBrowsePage.tsx:56`,
      `CollectionDetailPage.tsx:100`, `NotificationListPage.tsx:113`).
- [x] 4.7 h1 scale + serif normalization. Convention: list/detail pages `text-2xl font-bold`;
      browse/landing `text-3xl` (record it — a `PageHeader` component or a comment block in
      `globals.css`). Fix: `RecipeListView.tsx:158` vs sibling 2xl list pages (align per
      convention), `EquipmentDetailPage.tsx:135` `font-semibold` → `font-bold` (only non-bold h1),
      `RecipeFocusModePage.tsx:118-120` inline `fontFamily: 'Georgia, serif'` → Tailwind
      `font-serif` (same stack as `RecipeDetailPage.tsx:174` — it's the SAME recipe title).
- [x] 4.8 Form normalization. Extend Field with `htmlFor`/`id` association, `error` text and
      `help` text props (error style: `text-xs mt-1` + `var(--error)`, matching
      `AdminUserCreatePage.tsx:113,131,149,167,185` / `AdminUserEditPage.tsx:217-290` — the only
      forms with field-level errors today). Adopt Field/Section across the ~10 remaining forms:
      auth pages (keep their htmlFor association — the only forms that have it today), collection
      create/edit, SettingsPage, bean/setup/equipment inline forms (via 3.11/3.13), admin user
      forms (their field-level errors move into Field's error prop). Required-`*` marker comes
      free from Field.
- [x] 4.9 Section verification: `cd apps/web && deno task test`, `deno task check:web`,
      `make lint`, `make fmt`. Manual (`make dev`): all three themes on error states (no pink box
      in dark/coffee); My Beans → My Collections navigation shows NO width/gutter jump; gold
      buttons have consistent text color in dark theme.

## 5. T5 — i18n completion (D99.7 + wider sweep)

The flat-key parity PBT (`packages/shared/src/i18n/i18n.test.ts`) fails CI on en/tr divergence —
ALWAYS add both locale files in the same commit. Floats freely; coordinate keys with 3.8 (confirm
keys) and 4.5 (breadcrumb).

- [x] 5.1 Add the new flat keys to `packages/shared/src/i18n/en.json` + `tr.json` following the
      existing conventions: `*.placeholder` (en.json:94/477), `a11y.*` (en.json:435-436),
      `{name}`-style interpolation (en.json:436).
- [x] 5.2 Placeholders through `t()`: `RegisterPage.tsx:171,186,247`; `LoginPage.tsx:91`;
      `ResetPasswordPage.tsx:114,131`; `BeanListPage.tsx:138,153,168`;
      `SetupListPage.tsx:107,122,137`; `EquipmentListPage.tsx:143`; `TasteNotesFilter.tsx:192`;
      `TasteAutocomplete.tsx:293`. Locale-neutral example values (`'you@example.com'` at
      RegisterPage:138/LoginPage:73/ForgotPasswordPage:87, `'coffee_lover'` at RegisterPage:154):
      D40 deliberately left these — keep them, and record the decision in a code comment at one
      representative site (they are literal example values, not prose).
- [x] 5.3 Literal aria-labels via `a11y.*` keys: `RecipeDetailPage.tsx:279` +
      `RecipeFocusModePage.tsx:166` ('Preparation notes'); `CoffeeVarietyDetailPage.tsx:128` +
      `EquipmentDetailPage.tsx:97` + `BreadcrumbNav.tsx:32` ('Breadcrumb' — lands via the 3.14/4.5
      component); `useCoffeeVarietyFilter.tsx:172` ('Clear variety filter');
      `ScaaRadarChart.tsx:117`; `BeanSection.tsx:131,154`;
      `ShareSection.tsx:68,84,97,108,118,138,158` (keep brand names
      Twitter/X/Facebook/WhatsApp/Reddit as interpolated values); `TastingNotesSection.tsx:101`;
      the 12 `components/icons/equipment/*Icon.tsx:19` icon components (accept a label prop or
      call useTranslation — translate 'Other Equipment', 'Paper Filter', 'Mesh Filter', 'Scale',
      'Thermometer', 'Gooseneck Kettle', 'Puck Screen', 'Basket', 'Tamper', 'Portafilter').
- [x] 5.4 Template-string aria-labels → `t()` with interpolation: `TasteNotesPage.tsx:169`
      (`Definition of ${label}`); `TasteAutocomplete.tsx:257,274`; `ActiveFilterBadge.tsx:30`;
      `TastingNotesSection.tsx:142`; `RecipeListView.tsx:281`; `BrewTimeline.tsx:132`;
      `IntensityDots.tsx:15` (`Intensity ${intensity} of 3`).
- [x] 5.5 Three fully untranslated components (import useTranslation from
      `contexts/I18nContext.tsx`): `EmailVerificationBanner.tsx:33,40` (banner text +
      'Email sent!'/'Sending...'/'Resend verification email');
      `PhotoUpload.tsx:65,69,91,113,116,131` (validation errors with `{name}` interpolation,
      drop-zone copy, 'Uploading...'); `RecipeQRCode.tsx:45,51`
      ('Downloading...'/'Download QR Code', alt='Recipe QR Code').
- [x] 5.6 Scattered literals: `StarRating.tsx:105-107` — 'No community votes yet' + the hardcoded
      vote/votes plural → `recipe.rating.noVotes` + `recipe.rating.voteCount` with `{count}` (tr
      pluralization differs from en — pick key shapes accordingly); `EquipmentSection.tsx:86`
      fallback 'Main Brewer' → `t('recipe.mainBrewer')`; `ErrorBoundary.tsx:33` 'An unexpected
      error occurred.' — VERIFY provider nesting first (ErrorBoundary may render outside
      I18nProvider; if so use a locale-aware fallback, not `t()`); `RegisterPage.tsx:81`
      'Loading...' (reuse common loading key if present, else add `common.loading`).
- [x] 5.7 Error fallbacks: `ResetPasswordPage.tsx:40` ('Invalid or missing reset token...') and
      `:50` ('Failed to reset password'); `ForgotPasswordPage.tsx:36` ('Failed to send reset
      email'); `RegisterPage.tsx:71` ('Registration failed'). Also FIX `LoginPage.tsx:39`, which
      falls back to `t('auth.login.title')` — a page title — as the login-FAILED text.
- [x] 5.8 SEO strings (SEOHead accepts arbitrary strings — pass `t(...)` at call sites):
      `HomePage.tsx:53` title='Home'; `RecipeNotAvailablePage.tsx:14` title='Recipe Not
      Available'; `TasteNotesPage.tsx:239` description='Explore the SCAA flavor wheel taste notes
      on BrewForm.'.
- [x] 5.9 Dedicated deleteConfirm keys replacing `t(key)+'?'` concatenation (admin pattern, cf.
      `AdminVendorsPage.tsx:61` `t('admin.vendors.deleteConfirm')`): `SetupListPage.tsx:58` →
      `setup.deleteConfirm`, `BeanListPage.tsx:61` → `bean.deleteConfirm`,
      `EquipmentListPage.tsx:71` → `equipment.deleteConfirm`. These become the ConfirmDialog
      bodyKeys after 3.8 — coordinate.
- [x] 5.10 Regression test: add `apps/web/src/i18n-literals.test.ts` (runs under Vitest; walk
      `apps/web/src/**/*.tsx` excluding `*.test.*` with `node:fs`): regex-scan for
      `placeholder='[A-Za-z]`, `aria-label='[A-Za-z]`, `alt='[A-Za-z]`, `title='[A-Za-z]`
      string-literal attributes → assert zero matches outside an explicit allowlist (brand names,
      `'YYYY-MM-DD'` at `SettingsPage.tsx:289`, decorative values); second assertion for
      template-string `aria-label={`…`}` with English scaffolding.
- [x] 5.11 Section verification: `make test-shared` (parity PBT green proves en/tr sync),
      `cd apps/web && deno task test` (incl. the new i18n-literals test), `make lint`, `make fmt`.

## 6. T6 — Type-safety & lint re-enable (config flip LAST)

Depends on section 3 (Toast for empty-catch UX) and section 4 (ErrorState for load failures).
Fix-first, flip-config-last so `make lint` is green at every intermediate commit (design.md
Decision 3). Do the flip in the same PR as the final fixes and rebase-check before merge (Risk 5).

- [x] 6.1 Fix the 14 `no-empty` prod violations — silent `catch {}` on user mutations (the D17
      failure class). At each: log via the page's existing createLogger AND surface
      `toast.error(key)` (3.6); genuinely fire-and-forget paths get an explicit justified comment
      instead of UI. Sites: `BeanListPage.tsx:54,65`; `SetupListPage.tsx:51,62`;
      `AdminRecipesPage.tsx:46,55`; `AdminVendorsPage.tsx:54,65`;
      `AdminCompatibilityPage.tsx:43,51`; `AdminCoffeeVarietiesPage.tsx:200,215`;
      `AdminUserDetailPage.tsx:66`; `RecipeQRCode.tsx:34`. The 2 test-file no-empty diagnostics:
      fix or line-ignore with justification. Add/extend page tests asserting the error toast
      appears on a rejected mutation.
- [x] 6.2 Fix the 10 empty `.catch(() => {})` mount-fetch swallows (false-empty lists — same
      failure class, not caught by no-empty, fix now): `SetupListPage.tsx:31`,
      `BeanListPage.tsx:35`, `EquipmentListPage.tsx:34`, `AdminDashboard.tsx:34`,
      `AdminCompatibilityPage.tsx:32`, `AdminTasteNotesPage.tsx:29`, `AdminVendorsPage.tsx:29`,
      `AdminEquipmentPage.tsx:30`, `AdminAuditLogPage.tsx:40` → adopt the
      `status: 'loading'|'error'|'ready'` idiom (`NotificationDropdown.tsx:30`) + ErrorState
      (4.2); `OnboardingWizard.tsx:110` is intentionally best-effort → justification comment only.
      Also `RecipeComparePage.tsx:41,44` deliberate null-fallback catches: add the one-line
      "missing/unloadable recipe renders as empty pane" comment.
- [x] 6.3 Fix the 44 `require-await` prod violations — mechanical: drop `async` or await the
      thing. Densest files: `recipe/model.ts` (8), `utils/cache/index.ts` (4),
      `collection/model.ts` (3), `taste/model.ts` (3). Find the full list with
      `deno lint --rules-include=require-await apps/ packages/` (production files only). Dropping
      `async` on a function that returns a Promise is signature-compatible — verify with
      `make check`.
- [x] 6.4 Fix the 7 prod `no-explicit-any` + the directive cluster:
      `taste/service.ts:27` `cache.get<any>` →
      `cache.get<Awaited<ReturnType<typeof model.getHierarchy>>>`; `:90` →
      `Awaited<ReturnType<typeof model.findAll>>`; `:119` `new Map<string, any>` →
      `Map<string, Awaited<ReturnType<typeof model.findAll>>[number]>` (no runtime change; the
      untyped map feeds the `.depth`/`.parentId`/`.name` walk at `:126-134`).
      `RecipeComparePage.tsx` 5 anys (`:12,:13,:25,:27,:110`) + `RecipeFocusModePage.tsx` 5 anys
      (`:20,:22,:34,:76,:80`): type with the shared z.infer types D42 exported —
      `RecipeDetailOutput` for the useState/recipe objects, the version sub-object type for
      CompareTable's `v`, the BREW_METHODS/DRINK_TYPES element type for labelFor's `constants` —
      then DELETE all 8 justification-free line directives (Compare `:11,:24,:26,:107`; FocusMode
      `:19,:21,:75,:79`).
- [x] 6.5 Close the D42 off-by-one + page-level Record casts. `api/client.ts:72`
      `(data as Record<string, unknown>).data as T`: type requestInternal's parsed body as
      `{ data: unknown }` and keep a single `as T` with a one-line justification comment
      (`openapi/index.ts:27-28` convention — generic envelope unwrap). Response casts → shared
      output types: `AdminAuditLogPage.tsx:38`, `RecipeCreatePage.tsx:98`,
      `RecipeFocusModePage.tsx:42`, `PhotoUpload.tsx:87` (`api.upload<Record<string, unknown>>`).
      Request-body casts in 7 admin pages (`AdminRecipesPage.tsx:44`,
      `AdminEquipmentPage.tsx:50,60`, `AdminCompatibilityPage.tsx:40`,
      `AdminTasteNotesPage.tsx:46`, `AdminUserCreatePage.tsx:54`, `AdminUserEditPage.tsx:79`,
      `AdminCoffeeVarietiesPage.tsx:178`): type `api.patch`/`api.post` body params generically
      with shared input schemas so callers stop widening.
- [x] 6.6 Test-file `any` sweep (119 diagnostics across 44 files; top:
      `coffee-variety/service.test.ts` 24, `utils/storage/storage.test.ts` 22,
      `utils/response/response.test.ts` 19, `TasteNotesPage.test.tsx` 10): typed fix where trivial
      (`Partial<T>`, `vi.mocked`, `satisfies`), otherwise a LINE-level
      `// deno-lint-ignore no-explicit-any — <justification>` — NEVER file-level (locked
      decision; overrides the sweep's file-level suggestion). DELETE the ~40 no-op file-level test
      directives (all `deno-lint-ignore-file no-explicit-any require-await` headers in test files,
      e.g. `recipe/model.test.ts:1`, `collection/index_test.ts:1`, `schema-columns.test.ts:1`;
      `coffee-variety.test.ts`'s was at line 8 — misplaced and inert anyway).
- [x] 6.7 THE FLIP (last task, final commit of the section): remove `'no-explicit-any'`,
      `'require-await'`, `'no-empty'` from `deno.json` `lint.rules.exclude` (lines 66-72), keeping
      `'no-import-prefix'`/`'no-unversioned-import'`. `make lint` must pass with ZERO new
      suppressions. Immediately before merging, rebase on latest main and re-run `make lint` —
      parallel PRs may have introduced new violations (design.md Risk 5).
- [x] 6.8 Section verification: `make lint` (three rules active), `make check`,
      `deno task check:web`, `make test-api`, `make test-shared`, `cd apps/web && deno task test`,
      `make fmt`. Grep gates:
      `rg -n "deno-lint-ignore-file" apps packages --glob '*test*'` → zero;
      `rg -n "catch \{\}" apps/web/src` → zero.

## 7. T7 — Backend hygiene (stray sql tags)

Five stray sites outside the accepted-exception registry. They hid from plain `` sql` `` greps
because they use the typed `` sql<number>` `` form — the registry's sweep pattern should be
`` sql(<[^>]*>)?` ``. Small and independent.

- [x] 7.1 Drizzle aggregate helpers: `coffee-variety/model.ts:46` `` sql<number>`count(*)` `` →
      drizzle `count()` (already used at `notification/model.ts:130`, `badge/model.ts:55` —
      mirror their result-type handling); `collection/model.ts:219`
      `` sql<number>`max(${collectionItems.sortOrder})` `` → drizzle `max()`;
      `badge/model.ts:78` `` sql<number>`coalesce(max(${recipes.likeCount}), 0)` `` — drizzle has
      NO coalesce helper: use `max()` + TS-side `?? 0`, or keep the sql form with a NOTE comment
      and add it to the registry. Run the affected module tests after each swap.
- [x] 7.2 `packages/db/src/seed.ts:93/404/697` `` sql`… is null` `` → `isNull(tasteNotes.parentId)`
      / `isNull(beans.userId)` / `isNull(comments.parentCommentId)` (pattern:
      `equipment/model.ts:114`). Verify `deno task db:seed` still succeeds and seed tests pass.
- [x] 7.3 `recipe/model.ts:830` featured toggle `` .set({ featured: sql`not ${recipes.featured}` }) ``:
      try `not(recipes.featured)` from drizzle-orm in the SET clause; if it doesn't type-check
      there, KEEP the sql form and document it as an accepted atomic-toggle exception (NOTE
      comment + lint-style raw-SQL registry entry — same race-free spirit as the ±1 counters).
      Test: toggleFeature round-trip in the recipe model tests (true→false→true).
- [x] 7.4 Guardrail — accepted exceptions stay UNTOUCHED: health `SELECT 1`, equipment correlated
      EXISTS (NOTE at `equipment/model.ts:116-124`), atomic ±1 counters, `count(distinct …)`,
      schema `check()` constraints.
- [x] 7.5 Section verification: `make test-api`, `deno task test:db`, `make lint`, `make fmt`.
      Grep gate: `rg -n 'sql(<[^>]*>)?\`' apps/api/src packages/db/src` → only
      registry-documented exceptions remain.

## 8. T8 — Coverage ≥85% + gates (after sections 1–7 land their tests)

Baseline (fe9aad2): deno scope 72.21% lines (shared 99.42%, api 65.38%); measured path to ≥85%:
admin ≈ +1,200 → ~80.4%, recipe ≈ +550 → ~84.2%, auth ≈ +250 → ~85.9%
(`audit/coverage-audit.md` §5). Gates are set from MEASURED numbers, never aspirationally
(design.md Decision 7).

- [x] 8.1 Local test-DB provisioning (do FIRST — every DB-backed task needs it; pulling this task
      forward to unblock 1.8-1.10 is allowed): add a `make test-db-provision` target mirroring
      `.github/workflows/pr.yml:63-113` — create `brewform_test` in the compose Postgres
      (`brewform-postgres-1`), run migrations + seed with
      `DATABASE_URL=postgresql://brewform:brewform@localhost:5432/brewform_test`. Document in the
      Makefile help text. Context: `apps/api/src/test-setup.ts:9-11` injects a fake
      `postgresql://test:test@…` URL when DATABASE_URL is unset — that's why 129 DB tests fail
      with password-auth errors on an unprovisioned machine.
- [x] 8.2 Fix cross-suite pollution: `seed.idempotent.test.ts` fails when db tests run AFTER the
      API suite on the same DB (API tests mutate seeded rows; root `test` task order
      test:api→test:db, `deno.json:32`, triggers it every time). Fix: re-seed/re-provision at
      db-suite start, or isolate db tests onto a fresh database — pick one, document the choice in
      the test-file header, and verify `deno task test` (full root task) passes end-to-end.
- [x] 8.3 Admin backfill. 1.8/1.9 rewrote service+index tests; now close the remaining
      `admin/model.ts` gap (416 uncovered lines at 21.2% even though `model.test.ts` imports the
      real model — cover the untested functions/branches; per-file numbers in
      `audit/deno-coverage-report.txt`). Module target ≈ +1,200 covered lines vs baseline
      (admin/service.ts 496 uncovered @0.8%, index.ts 437 @26.1%, model.ts 416 @21.2%).
- [x] 8.4 Recipe backfill ≈ +550: `recipe/model.ts` cursor/filter branches (350 uncovered, 49.0%),
      `recipe/index.ts` route branches (221, 63.1%), `recipe/service.ts` (212, 47.7%). Extend the
      existing test files, following their established patterns.
- [x] 8.5 Auth ≈ +250: create `apps/api/src/modules/auth/model.test.ts` — the file does NOT exist
      (model.ts 194 lines at 12.5%; password-reset/verification-token persistence completely
      untested); widen `auth/service.test.ts` beyond register/toAuthUser (126 uncovered, 20.8%);
      `auth/index.ts` route branches (132, 57.1%).
- [x] 8.6 Coverage gate script: `deno coverage` has NO built-in threshold — write
      `scripts/coverage-gate.ts` (small Deno script: run after `deno task test-coverage`, parse
      the lcov/`deno coverage coverage/` summary, compute line coverage over the deno scope, exit
      non-zero below 85). Wire into the root `deno.json` `ci` task and
      `.github/workflows/ci.yml` (currently uploads an artifact only, ci.yml:95-108). Unit-test
      the parser with a fixture report.
- [x] 8.7 Web honest coverage: add a `coverage` block to `apps/web/vitest.config.ts` with an
      include pattern that counts ALL src prod files, making the 14 invisible files visible
      (`router.tsx` 433 lines, `CollectionCreatePage.tsx` 102, `CollectionEditPage.tsx` 135,
      `CollectionListPage.tsx` 73, `routes/favourite.ts` 28, `routes/follow.ts` 35,
      `routes/like.ts` 34, `routes/rate.ts` 32, `SessionRestoreBanner.tsx` 67,
      `EmailVerificationBanner.tsx` 44, `Layout.tsx` 44, `RecipeNotAvailablePage.tsx` 28,
      `App.tsx` 28, `main.tsx` 10). Measure, then set `coverage.thresholds.lines` at the honest
      baseline rounded DOWN to a whole percent (expected high-60s/low-70s after section 2's
      collection-page tests). Record the ratchet rule as a comment in vitest.config.ts: a PR that
      raises measured coverage ≥1pt bumps the threshold in the same PR; the threshold only moves
      up.
- [x] 8.8 Web quick wins (do what fits — the gate is set from measurement, not from this list):
      `router.tsx` route-config smoke test, the 4 `routes/*.ts` action files, `api/index.ts`
      client wrappers (99 uncovered lines at 15.4%), `NotificationDropdown` (7.7% — always mocked
      out). Also fix: `vitest.config.ts:33` excludes `__tests__/*.integration.test.ts` from the
      default run, so `recipe-coffee-dates.integration.test.ts` never runs in CI — include it or
      relocate it.
- [x] 8.9 Re-measure + section verification: `deno task test-coverage` then
      `deno task coverage-report` → ≥85% lines on the deno scope;
      `deno run -A scripts/coverage-gate.ts` exits 0; web coverage run meets thresholds;
      `make test-api`, `make test-shared`, `cd apps/web && deno task test`, `deno task test:db`
      individually; `make lint`; `make fmt`.

## 9. T9 — Docblocks (all 196 missing)

Read `openspec/changes/wave-5-debt-clearance/audit/docblock-inventory.md` FIRST — it has the full
per-file symbol tables with exact line numbers AND the captured house style (aligned
`@param x - desc` + `@returns` for API services; single-line verb-first `/** */` for utils;
tag-less prose for hooks/components; "Validates X; response envelope for METHOD /route" for
schemas; `{@link}` cross-refs). Apply the captured style — do NOT invent a new one, and do NOT add
a docblock lint plugin (none matches the house style; enforcement is review). Floats freely.

- [x] 9.1 `packages/db/src/schema.ts` — 43 symbols (worst single file): 13 pgEnum consts
      (one-liner naming the driving `*_VALUES` constant), 28 pgTable consts (one-liner naming the
      entity + notable columns/constraints — soft-delete, unique targets), `RecipeVisibility`
      type; upgrade the existing `//` comments at `:43` and `:66` to `/** */`. Full line-by-line
      table in the inventory's packages/db section.
- [x] 9.2 packages/db rest — 17 symbols: `seed-users-recipes.ts` 10 seed-data consts,
      `seed-equipment-catalog.ts` 2, `seed-coffee-varieties.ts` 2 (both have `//` comments to
      upgrade), `seed.ts:927` `main()` (the ONLY undocumented true exported function repo-wide),
      `index.ts` `db` const + `client` export.
- [x] 9.3 packages/shared schemas — 49 symbols, almost all
      `export type X = z.infer<typeof XSchema>` aliases: use "Inferred type of {@link XSchema}."
      one-liners. Files: `responses/recipe.ts` 7, `responses/collection.ts` 6,
      `schemas/recipe.ts` 5, `responses/equipment.ts` 4, `responses/follow.ts` 3,
      `responses/comment.ts` 3, `responses/user.ts` 3, `taste.ts` 2, `responses/badge.ts` 2,
      `responses/notification.ts` 2, `user.ts` 2, plus singles (inventory Section D lists each).
- [x] 9.4 packages/shared constants + types — 24 symbols: `visibility.ts` 4, `drink-types.ts` 4,
      `emoji-tags.ts` 3, `brew-methods.ts` 3, `brew-method-rules.ts` 2, `user-preferences.ts` 2,
      `units.ts` 2, `badges.ts` 1, `types/coffee-variety.ts` 1, and the `en`/`tr` locale-bundle
      re-exports at `i18n/index.ts` (doc on the export statement — inventory Section C).
- [x] 9.5 apps/api Hono routers — 22 symbols (inventory Section B): docblock at each
      `const x = new Hono<AppEnv>()…` declaration — "Hono router for `/api/v1/<x>`; mounted in
      routes/index.ts" one-liners. Sites: `routes/index.ts:39`, `routes/health.ts:6`,
      `routes/sitemap.ts:10`, `routes/share.ts:8`, and 18 module `index.ts` files (exact lines in
      the inventory table).
- [x] 9.6 apps/api misc — 28 symbols: `main.ts:39` `app` + `utils/logger/index.ts:5` `logger`
      (Section C); `routes/share.ts` 3, `routes/sitemap.ts` 3, `types/hono.ts` 2
      (`AppVariables`/`AppEnv`), `config/env.ts` 2, `utils/upload/index.ts` 2,
      `utils/storage/types.ts` 1, middleware `crawler.ts`/`auth.ts`, the 10 module-level
      `const log = createLogger(…)` singletons and 4 `deps` DI objects (per-file tables in
      inventory Section D).
- [x] 9.7 apps/web — 13 symbols: `radar-chart-data.ts` 2, `relative-date.ts`
      `RelativeDateResult` (upgrade `//`), `stat-cards.ts` `StatCardItem`, `recipe-filters.ts`
      `ListFilterParams`, `ScaaRadarChart.tsx` props interface, `TasteNotesFilter.tsx`
      `TasteNoteFlat`, `router.tsx:62` `router`, `static-cache.ts` `CACHE_BUST_KEY`, the 3 page
      LoaderData interfaces (RecipeDetailPage/UserProfilePage/HomePage). SKIP
      `RecipeCard.styles.ts` `AUTHOR_BUTTON_STYLE` — the file is deleted in 3.3.
- [x] 9.8 Section verification: `make lint`, `make check`, `make fmt` (docblocks are
      fmt-sensitive — the 100-char lineWidth wraps long one-liners; let fmt do it). Going
      forward, every exported symbol in new wave-5 code carries a house-style docblock (the
      code-documentation spec delta codifies the blanket rule).

## 10. T10 — Dependencies (gated TS7 section LAST)

Safe batch → runtime/CI sync → renovate → THEN the TS7 gate, so its diagnostic diff runs against
final code (design.md Decisions 1 and 10). Source detail: `audit/dependency-audit.md`.

- [x] 10.1 Safe batch. `deno update --latest` for: hono 4.12.30, hono-openapi 1.3.1,
      @hono/standard-validator 0.2.3 (in-range patch — do NOT take 0.3.0: hono-openapi@1.3.1
      peerDependencies still pin ^0.2.0), @std/expect 1.0.20, vitest + @vitest/coverage-v8
      4.1.10, vite 8.1.5, tailwindcss + @tailwindcss/vite 4.3.3, nodemailer 9.0.3, fast-check
      4.9.0, mjml 5.4.0, react-router 8.2.0. @hono/zod-validator 0.9.0 is out-of-range: edit
      `apps/api/package.json:9` to `^0.9.0` (verified type-only — InferInput change; repo has no
      Hono RPC usage). After the mjml bump: re-run `deno task email-build` and eyeball the
      regenerated templates. Do NOT bump typescript here (that's 10.5) and skip
      @opencode-ai/plugin (local tooling outside the workspace). Verify: `make check`,
      `make lint`, all test suites individually.
- [x] 10.2 Deno version sync: local 2.9.2 → 2.9.3 (`deno upgrade`); update the CI
      `deno-version: v2.9.0` pins → `v2.9.3` at ALL SIX sites: `.github/workflows/ci.yml:17,76`
      and `.github/workflows/pr.yml:15,46,96,144`. Also update BOTH Dockerfiles' base-image tags
      `denoland/deno:debian-2.9.0` → `denoland/deno:debian-2.9.3` at all five FROM lines
      (`Dockerfile:13,24,37`, `Dockerfile.web:14,27` — the caddy runner stage is unaffected),
      keeping CI/Docker/local on one exact version per the deno-runtime spec delta. PREFERRED:
      switch both workflows to `deno-version-file` pointing at a single version file — kills this
      drift class permanently (note: renovate's deno manager doesn't track either form; see 10.4).
- [x] 10.3 drizzle-kit dedupe: the version lives in `packages/db/package.json:21` (^0.31.10) AND
      hard-pinned as `npm:drizzle-kit@0.31` inside five task commands at
      `packages/db/deno.json:9-13`. Make the tasks reference the package.json-resolved install
      (plain `npm:drizzle-kit`) or document the single source of truth — one place only. Verify:
      `make db-generate` (or `deno task --cwd packages/db generate`) still works.
- [x] 10.4 Renovate: add `customManagers` (regex) to `renovate.json` for (a) the root `deno.json`
      catalog pins (deno.json:8-10 — `catalog` is NOT in the deno manager's supported depTypes)
      and (b) the CI `deno-version` input (github-releases datasource on denoland/deno) unless
      10.2's deno-version-file switch happened — then cover the version file instead. Document
      the jsr-in-package.json blind spot (`apps/api/package.json:22-23`,
      `packages/db/package.json:22-23` — npm manager skips `jsr:` semver) as a comment/README
      note.
- [x] 10.5 GATE — TypeScript 6.0.3 → 7.0.2 (tsgo, MAJOR; design.md Decision 1). On the branch:
      (1) bump `apps/web/package.json` typescript to ^7.0.2, `deno install`, verify
      `deno run -A npm:typescript/tsc --version` resolves and spawns the platform-native binary
      under Deno node-compat (TS7's `bin/tsc` is a JS shim over `@typescript/typescript-*`
      native packages — exactly where node-compat can break); (2) run `deno task check:web`,
      exercising the exact flags the task uses (`--noEmit -p tsconfig.json`;
      `ignoreDeprecations`/`allowImportingTsExtensions` come from tsconfig.json) and DIFF the
      diagnostic list vs 6.0.3 — the 6.0.3 baseline is zero errors, so parity = zero errors and
      no new false positives; (3) document the resulting compiler skew (web checks on 7.0.2/tsgo;
      `deno check` on api/db/shared uses Deno-bundled TS 6.0.3) in the dependency notes.
- [x] 10.6 GATE OUTCOME — exactly one: (a) all three gate steps pass → keep the bump; run
      `cd apps/web && deno task test`, `make check-web`, and full CI on the PR; or (b) ANY step
      fails → revert to ^6.0.3, record a new ledger item with the failure evidence (paste the
      command output), and land the rest of T10 unchanged. The defer path is a first-class
      outcome, not a failure of the wave.
- [x] 10.7 Section verification: `make fmt-check`, `make lint`, `make check` (incl.
      `deno task check:web`), `make build` (email templates + web build), all test suites
      individually, `deno --version` reports 2.9.3,
      `grep -rn 'denoland/deno:' Dockerfile Dockerfile.web` → every match is `debian-2.9.3`, CI
      green on the PR (proves the workflow pins).

## 11. T11 — Docs

Trivial; anytime.

- [x] 11.1 Fix `AGENTS.md:50`'s stale middleware order. Current text: "cors → requestId →
      rateLimit(100/min) → cache injection → error handler → routes". Read `main.ts:41-76` and
      transcribe the ACTUAL order: cors → requestId → secureHeaders → rateLimit → bodyLimit →
      cache-injection → crawler → onError (registered via `app.onError`, not stack middleware) →
      optional /uploads static handler → routes.
- [x] 11.2 Note (not a task here): the D99 ledger additions for the NEW audit items (D99.10–.19)
      happen SEPARATELY, before this change lands — do not fold ledger authoring into wave-5 PRs.
      Run `make fmt`.

## 12. Wrap-up

- [x] 12.1 Full verification suite, individually (NEVER piped through tail/head): `make check`;
      `deno task check:web`; `make lint` (all three re-enabled rules active); `make fmt-check`;
      `make test-api`; `make test-shared`; `cd apps/web && deno task test`; `deno task test:db`;
      `deno task test-coverage` + `deno task coverage-report` (≥85% deno-scope lines) +
      `deno run -A scripts/coverage-gate.ts` (exit 0); web coverage run meets its thresholds.
- [x] 12.2 Roll-up grep gates: `rg -n "globalThis.confirm" apps/web/src` → 0;
      `rg -n "catch \{\}" apps/web/src` → 0;
      `rg -n "deno-lint-ignore-file" apps packages --glob '*test*'` → 0;
      `rg -n "Record<string, unknown>" apps/web/src/api/` → only the justified client.ts unwrap
      (or zero if 6.5 removed it); `rg -n 'sql(<[^>]*>)?\`' apps/api/src packages/db/src` → only
      registry exceptions; `ls apps/web/src/components/recipe/RecipeCard.styles.ts` → does not
      exist; `deno.json` rules.exclude no longer lists no-explicit-any/require-await/no-empty.
- [ ] 12.3 Manual walk (`make dev`): recipe detail — In-collections section renders; comments on
      a private recipe → 404 for a stranger; collections CRUD — cache-hit behavior, toasts on
      mutations, confirm dialogs on deletes; the 3 de-duplicated card pages render via
      RecipeCard; dark/coffee themes on error states; My Beans → My Collections shows no
      width/gutter jump.
- [x] 12.4 Update `plans/TECHNICAL_DEBT.md` and `plans/D99-debts.md`: mark D99.1, .3, .5, .6, .7,
      .9 resolved with the date and change name `wave-5-debt-clearance`; mark the wave-5-scheduled
      new items (D99.10–.16, .19) resolved likewise; D99.8, D99.17, D99.18 stay deferred with the
      design.md rationale references. (New-item ledger entries themselves were authored separately
      before landing — see 11.2.)
- [ ] 12.5 Archive: leave `openspec archive wave-5-debt-clearance` to the user after the final
      track's PR merges — the change stays open across the multi-PR landing plan (design.md
      Decision 10).
