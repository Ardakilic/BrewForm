# Refine fragment: unlisted-visibility (OQ1 + D4)

Owner of: `specs/recipe-visibility/` (new, ADDED) and `specs/recipe-collections/`. Visibility text was also edited in `specs/equipment-recipe-query/` (MODIFIED "getRecipesUsingEquipment folds duplicated predicates into one shared condition set") and `specs/recipe-filter/` (MODIFIED "Caller composes base conditions"). New delta: `specs/brew-journal/` (MODIFIED "Brew log service layer"). The rest of `equipment-recipe-query` and `recipe-filter` was not touched.

Validation: `openspec validate wave-6-audit-remediation --strict` passes ("Change 'wave-6-audit-remediation' is valid").

## 1. Findings

All evidence is from HEAD `ada9f6e`. "U" means an `unlisted` recipe and "K" an `unlisted` collection.

### 1.1 Surface audit

| # | Surface | Current behaviour for U / K (file:line) | Required (OQ1/D4) | Change? |
|---|---|---|---|---|
| 1 | `GET /recipes` browse, search, filters and sorts; home grids | Non-admin WHERE is `eq(recipes.visibility, 'public')` (`apps/api/src/modules/recipe/model.ts:289-292`). The search path (`service.ts:589`, `findAllForRanking`) and the cursor path (`model.ts:1091-1110`) receive the same `where`. U is excluded for everyone, the author included. | Public only, viewer-independent | Refactor to the helper and add lock tests |
| 2 | Follow feed | `getFeed` uses `eq(recipes.visibility, 'public')` (`recipe/model.ts:1168`); route in `follow/index.ts:196` | Public only | Refactor and lock |
| 3 | Profile `recipes` and `recipeCount` | `getUserStats` (`user/model.ts:95`) and `getUserPublicRecipes` (`user/model.ts:113`) are public-only, and also for the owner (`user/service.ts:57-60`). No author "my recipes" listing exists anywhere (web profile `UserProfilePage.tsx:244-252` renders `profile.recipes`). | Public only | Refactor and lock. The missing self-listing is an open question |
| 4 | Equipment detail recipes | `equipment/model.ts:126` public-only | Public only | Refactor (equipment-recipe-query delta) |
| 5 | Coffee-variety detail recipes | `coffee-variety/model.ts:99,120` public-only | Public only | Refactor and lock |
| 6 | Bean, vendor and taste-note pages | No recipe query in `bean`, `vendor` or `taste` models (grep shows no `recipes` reference). Taste filtering goes through `GET /recipes`. | n/a | None |
| 7 | Related or similar recipes; fork lists | None exist (no `related`/`similar` code; only the `forkCount` integer) | Any future one uses the helper | Enforcement test |
| 8 | **Forked-from attribution** | **Leak.** The detail loads `forkedFrom: { id, slug, title }` with no visibility or `deletedAt` filter (`recipe/model.ts:327,354`) and adds `forkedFromSlug` (`recipe/index.ts:579`). Every recipe row payload carries `forkedFromId` (`packages/shared/src/schemas/responses/recipe.ts:27`, `FeedRecipeOutputSchema` `:120`): list, feed, equipment, variety and collection items (`collection/service.ts:74`). Forking U is allowed (`recipe/service.ts:392` blocks only draft/private). An id resolves through `getRecipe(slugOrId)` (`recipe/service.ts:66-75`), and `canViewRecipe` lets anyone open U. So a public fork F of U publishes U's link to every browser of `/recipes`. The same leak exists for soft-deleted and private sources. | Masked unless the source is listable | **Fix** |
| 9 | Versions, diff, compare | `canViewRecipe` on versions (`recipe/index.ts:378`) and diff (`:461`). Compare loads two details by slug. U is reachable by its link. | Link-only | None (API). Web pages lack noindex (#17) |
| 10 | Starred list | `findStarred` is public-only (`recipe/model.ts:1200`). It is viewer-only (`recipe/index.ts:306` `authGuard`, scoped to the caller's favourites). `POST /:id/favourite` has no visibility gate, so a favourited U never shows up in Starred. | Viewer-only record: may include U | **Widen** to `viewableRecipeCondition(userId)` |
| 11 | Likes lists | None exist; `favouriteCount` is a number only | n/a | None |
| 12 | Brew logs | The own list joins recipe title and slug with no visibility filter (`brew-log/model.ts:49-63`). It is viewer-only (`brew-log/index.ts:85,211` `authGuard`, caller-scoped), and the web fetches the profile Brews tab only for the owner (`UserProfilePage.tsx:73-74`). `createBrewLog` rejects another author's U (`brew-log/service.ts:27`), yet "Brew again" is shown on every viewable recipe (`RecipeDetailPage.tsx:293-295`), so link holders get a 404. Per-recipe stats are public by recipe id, as aggregates (`brew-log/index.ts:131-166`). | Viewer-only record; usable by link | **Fix** create (`canViewRecipe`); list unchanged |
| 13 | Comments | `canViewRecipe` gate (`comment/service.ts:56`; main spec `comment-authz`). No per-user comment listing. | Link-only | None |
| 14 | Notifications | Rows are recipient-only snapshots (`referenceId`/`metadata`, `notification/model.ts:12-26`). The follower "new recipe" notification fires only on a `public` create (`recipe/service.ts:232`). | Not discovery | None (open question on mentions) |
| 15 | Collection detail items | **Leak (D4 + OQ1).** `findById` loads every item's recipe unfiltered (`collection/model.ts:10-34`), `toDetailOutput` maps all of them (`collection/service.ts:31-104`), and `recipeCount = items.length` (`:102`). The detail is cached for 10 minutes (`:207-245`). The t3 delta (before this refine) kept U visible to everyone (old scenario "Unlisted recipe stays visible"). | Public, or the viewer is the recipe's author | **Fix** (`recipe-collections`) |
| 16 | Collection list counts | Raw row counts (`collection/model.ts:71-77,159-165`) | Audience-listable only | **Fix** |
| 17 | Collection listings of K | Browse is public-only (`collection/model.ts:142`); the user public list goes through `findPublicByUserId` → `'public'` (`:108-113`); "In collections" is public plus own (`:296-298`); the owner list shows all (`collection/index.ts:559-561`); detail by link is allowed (`collection/service.ts:218,229` forbid only private/draft) | Already right | Lock tests only |
| 18 | Sitemap | Public-only (`apps/api/src/routes/sitemap.ts:55,67`) | Public only | Refactor and lock |
| 19 | Crawler meta / share / meta API | Crawler serves OG only for public (`middleware/crawler.ts:36`) and otherwise falls through with no header. Share returns a 404 page for non-public (`routes/share.ts:78`) with no header. Meta returns 404 for non-public (`recipe/index.ts:348`). | Keep public-only; add `X-Robots-Tag` | **Add header** |
| 20 | QR | The API generates codes for U (`qrcode/service.ts:40` refuses only draft/private), and the web shows the QR and share cards for U (`RecipeQRCode.tsx:22`, `ShareSection.tsx:19`). **Bug:** the landing redirects every non-public `?from=qr` visit to `/recipes/unavailable` (`RecipeDetailPage.tsx:82-84`), so U's QR code never opens U. | QR opens U; only a 404 redirects | **Fix** |
| 21 | SPA meta | Recipe detail: `SEOHead` without `noIndex`, canonical always set, `RecipeJsonLd` always rendered (`RecipeDetailPage.tsx:138-170`). `CollectionDetailPage.tsx` has no `SEOHead`. Versions, diff and compare have no `noIndex` (`RecipeVersionsPage.tsx:85`, `VersionDiffPage.tsx:162`, `RecipeComparePage.tsx:151`). Fork and focus already pass `noIndex`. Production serves the SPA `index.html` for `/recipes/:slug` (`apps/web/Caddyfile` `try_files`), so the API crawler middleware runs only on the API origin, and the SPA robots meta is the mechanism that matters for Googlebot, which renders JS. | noindex for non-public | **Fix** |
| 22 | Admin | Admin module, and the admin `visibility` filter branch (`recipe/model.ts:290-291`) | Exempt | Marked `visibility-exempt` |
| 23 | Web list pages (Home, RecipeList, Starred, equipment/variety detail, profile, collection browse/detail) | They render API results with no client-side visibility logic | n/a | None besides #20 and #21 |

### 1.2 Other observations (out of OQ1 scope, recorded)

- Recipe slugs are derived from the title (the slug design adds a random suffix only on collision). A
  U titled "My V60" is reachable at a guessable `/recipes/my-v60`. "Unlisted" therefore means "not
  listed", not "secret". This is an open question for the user (§6, Q3).
- Like, favourite, rate (`recipe/index.ts:790-900`) and `GET /photos/recipe/:recipeId`
  (`photo/index.ts:136`) skip `canViewRecipe` for draft/private recipes. This is the audit "low"
  finding at `plans/AUDIT-2026-11-18.md:658`, and §6.A has no wave-6 owner. Fork masking means U's id
  no longer leaks, so this does not affect OQ1.

## 2. Design text (paste into design.md as a new subsection after "Slugs, collection visibility and error mapping (t3)")

### Unlisted visibility everywhere (user decisions OQ1 and D4)

**Context.** The user decided (2026-11-19): "Unlisted means unlisted from everywhere. Only with the absolute link can find it. Should not be visible even from search and categories etc." and "Collections hide deleted, private and draft recipes from everyone except the recipe's author." The audit of every surface (`audit/_refine/unlisted-visibility.md` §1) found the following:
- Most discovery surfaces already filter `visibility = 'public'`, but through six hand-written copies.
- Collection items leak deleted, private, draft and unlisted recipes.
- Fork attribution publishes a non-public source's id, slug and title. The id works as a link.
- The QR landing breaks every unlisted QR code.
- No non-public page is marked `noindex`.

1. **One meaning per visibility value, applied by surface class.**
   - Choice: `public` is listed and indexable; `unlisted` is reachable only by its URL or id and never listed or indexed; `private` and `draft` are author-only. The same applies to collections. Each surface is classified as discovery, collection items, direct link, viewer-only record, owner-only list or admin. The class decides the filter (`recipe-visibility` spec table).
   - Alternatives: keep per-surface rules (status quo, six drifting copies), or YouTube-style semantics where unlisted items still appear on the owner's public profile.
   - Rationale: one table settles every future surface, and the user explicitly ruled out every listing.
2. **A shared SQL condition pair and pure predicate pair in the recipe module.**
   - Choice: `listableRecipeCondition(viewerId)` and `viewableRecipeCondition(viewerId)` live in `recipe/model.ts`, next to the existing exported `recipeCoffeeVarietyCondition`. Drizzle builders only, and `deletedAt` is included. `canListRecipe(recipe, viewerId)` lives beside `canViewRecipe` in `recipe/service.ts`. Other models import the conditions, and services import the predicates. A DB-backed parity test proves the SQL and the predicate agree.
   - Alternatives: a `utils/visibility` module (it would import `drizzle-orm` outside a model file), a Postgres view (no raw SQL), or per-module copies.
   - Rationale: the predicate mirrors `canViewRecipe` (the `comment-authz` precedent). Keeping the SQL in a model file respects the 3-layer rule. Model-to-model imports of a pure SQL builder have no side effects.
3. **Discovery surfaces are viewer-independent.**
   - Choice: every discovery query calls `listableRecipeCondition(null)`, so authors do not see their own unlisted, draft or private recipes in browse, search, feed, category pages, profile or sitemap. No author "My recipes" listing is added.
   - Alternatives: pass the viewer, so authors see their own non-public recipes in search and on their profile.
   - Rationale: this is the literal reading of "only with the absolute link". It keeps every list response shareable and cache-safe, and it matches today's behaviour (no regression). A self-listing is a separate feature (open question).
4. **Collection items use `canListRecipe` (reverses the unlisted half of t3 Decision 6).**
   - Choice: an item is shown when its recipe is not deleted and is `public`, or the viewer is the recipe's author. The collection owner gains nothing. Counts follow the audience: `listableRecipeCondition(ownerId)` on the owner's list and `listableRecipeCondition(null)` on public lists. The modal note covers draft, private and unlisted.
   - Alternatives: `canViewRecipe` (shows unlisted to everyone, rejected by the user), or hiding items even from the recipe's author (contradicts D4's "except the recipe's author").
   - Rationale: a collection is a listing, not a link.
5. **Fork attribution is masked unless the source is listable.**
   - Choice: list rows go through `maskUnlistableForkSources(rows)` (one PK `inArray` query, viewer-independent). Collection items use the state lookup they already run. The detail uses `resolveForkAttribution(source, viewerId)`, so the source's author still sees it. Stored data, `forkCount` and response schemas are unchanged, because the fields are already nullable.
   - Alternatives: forbid forking unlisted recipes (it breaks a link-holder action and does not cover private or deleted sources); refuse UUID lookups of unlisted recipes (fork, comments and photos are keyed by id and would break); drop `forkedFromId` from `RecipeRowSchema` (a breaking schema change for every list).
   - Rationale: the id of an unlisted recipe is as good as its link, so it must not appear on any surface a stranger can read.
6. **Viewer-only records.**
   - Choice: Starred uses `viewableRecipeCondition(userId)`. Favourited unlisted recipes now appear, and recipes that became private or draft drop out. The brew journal list is unchanged. `createBrewLog` uses `canViewRecipe`, so "Brew again" works for link holders. Both surfaces were verified viewer-only.
   - Alternatives: keep Starred public-only (the literal reading; favouriting an unlisted recipe then appears to do nothing), or hide brew logs of recipes that are hidden now (the user's own history would vanish).
   - Rationale: these lists show only what the viewer saved, and expose nothing to anyone else (the orchestrator's interpretation of OQ1, flagged for the user).
7. **Non-public pages are never indexed.**
   - Choice:
     - Non-public recipe detail: `noindex, nofollow` robots meta, no canonical link and no JSON-LD.
     - Versions, diff and compare pages: always `noindex`, because their payloads carry no visibility and the pages are derived views.
     - Collection detail: noindex unless public.
     - API: `X-Robots-Tag: noindex, nofollow` on non-public recipe and collection JSON details, on every share 404, and on crawler fall-throughs for recipe paths. Missing and non-public cases look identical, so the header is no existence oracle.
     - Share and crawler stay public-only.
   - Alternatives: a Caddy header (Caddy cannot know visibility), or server-side rendering (out of scope).
   - Rationale: Googlebot renders the SPA, and the headers cover the API origin.
8. **The QR landing redirects only on 404.**
   - Choice: `?from=qr` plus a `404` from the API redirects to `/recipes/unavailable`. A viewable recipe renders.
   - Rationale: this matches the gap-M3 intent ("delisted since printing") and stops breaking unlisted QR codes.
9. **A static enforcement test.**
   - Choice: `apps/api/src/modules/recipe/visibility.enforcement.test.ts` scans model and route files. It rejects inline `recipes.visibility` comparisons and requires every recipe listing unit to reference a helper, with an explicit exemption map that is checked for stale keys.
   - Alternatives: a custom Biome rule (not available), or code review only.
   - Rationale: the same pattern as the OpenAPI coverage test and t5's `architecture.test.ts`. It fails at the exact `file:line`.
10. **Deferred:** an author-only "My recipes" listing, unguessable unlisted URLs, and draft/private gating of like, favourite, rate and photo-list (all in Open Questions / debt ledger).

## 3. Tasks to add

Failing tests come first. Rules the code already meets get regression locks before the refactor. All API DB tests start with `import '../../test-setup.ts'`, use `createRecipe(authorId, visibility)` from `apps/api/src/modules/brew-log/test-helpers.ts`, and hard-delete their fixtures in `afterEach`.

### Group 9 (collections). Insert BEFORE task 9.1, in this order

- [ ] 9.? (before 9.1) Write the failing predicate test `apps/api/src/modules/recipe/service.visibility.test.ts`:
  - `canListRecipe` is evaluated over visibility {`public`, `unlisted`, `private`, `draft`} × `deletedAt` {`null`, a `Date`, an ISO string} × viewer {`null`, the author, another user};
  - it is `true` only for non-deleted `public` (any viewer) and for any non-deleted visibility when the viewer is the author;
  - add a `canViewRecipe` matrix that locks today's behaviour (`public`/`unlisted` → `true` for everyone; `draft`/`private` → only for the author or `isAdmin: true`).
- [ ] 9.? Write the failing DB-backed parity test `apps/api/src/modules/recipe/model.visibility.test.ts`:
  - fixtures: author A owns one recipe in each of the 4 visibilities, plus a soft-deleted copy of each;
  - for viewer ∈ {`null`, A, B}, `db.select({ id: recipes.id }).from(recipes).where(and(inArray(recipes.id, fixtureIds), listableRecipeCondition(viewer)))` returns exactly the fixtures for which `canListRecipe(row, viewer)` is `true`;
  - `viewableRecipeCondition(viewer)` returns exactly those for which `canViewRecipe(row, viewer) && row.deletedAt === null`;
  - leave a `describe.todo('maskUnlistableForkSources')` placeholder for task 10A.4.
- [ ] 9.? Implement the helpers:
  - in `apps/api/src/modules/recipe/model.ts`, the exported `listableRecipeCondition(viewerId: string | null): SQL` and `viewableRecipeCondition(viewerId: string | null): SQL`, built only from Drizzle `and`/`or`/`eq`/`inArray`/`isNull` with no `sql` fragment, both including `isNull(recipes.deletedAt)`, each with a docblock that cites the `recipe-visibility` capability and states "discovery surfaces pass `null`";
  - in `apps/api/src/modules/recipe/service.ts`, the pure `canListRecipe(recipe: { visibility: string; authorId: string; deletedAt?: Date | string | null }, viewerId?: string | null): boolean` beside `canViewRecipe`, with a docblock and no logging (the same deliberate deviation as `canViewRecipe`).
  - Run `make test-specific filter=src/modules/recipe/service.visibility.test.ts` and `make test-specific filter=src/modules/recipe/model.visibility.test.ts`; both pass.

### Group 9. Insert AFTER task 9.7

- [ ] 9.? Add regression locks to `apps/api/src/modules/collection/index.test.ts`. They pass at HEAD and protect the listing rule for collections:
  - an `unlisted` collection K owned by A is absent from `GET /api/v1/collections/public`;
  - K is absent from `GET /api/v1/users/<A>/collections` for an anonymous caller and for B, and present for A;
  - K is absent from `GET /api/v1/recipes/<slug>/collections` for B for a public recipe inside K;
  - anonymous `GET /api/v1/collections/<K>` returns `200` and lists only K's public items (this last assertion fails until 9.4/9.5 land when K holds A's own unlisted recipe);
  - `POST /api/v1/collections/:id/recipes` by B with A's unlisted recipe returns `403`.

### New group (insert directly AFTER group 10): "Unlisted visibility on every discovery surface (recipe-visibility)"

Proposed number 10A. The integrator renumbers as needed. It must follow group 10, because it edits t7's `findListPage`/`findStarred`, and it needs group 9's helpers.

- [ ] 10A.1 Write regression locks first. They pass at HEAD and protect the refactor in 10A.3. Fixtures: author A, public recipe P and unlisted recipe U, both using equipment E and coffee variety V in their current version, and user B following A.
  - `apps/api/src/modules/recipe/service.test.ts`: `listRecipes({ search: U.title }, 1, 20, viewer, false)` for viewer `null`, A and B never returns U and `total` excludes it; `listRecipes({ authorId: A })` returns only P for all three; the cursor path (`listRecipes({ cursor })`) excludes U; an admin `listRecipes({ visibility: 'unlisted' }, 1, 20, adminId, true)` returns U.
  - `apps/api/src/modules/follow/service.test.ts`: `getFeed(B)` excludes U in offset and cursor mode.
  - `apps/api/src/modules/equipment/model.test.ts`: `getRecipesUsingEquipment(E, 1, 10)` excludes U from `data` and `total`.
  - `apps/api/src/modules/coffee-variety/model.test.ts`: `getRecipesUsingVariety(V, 1, 10)` excludes U from `data` and `total`.
  - `apps/api/src/modules/user/service.test.ts`: `getPublicProfile(<A's username>, viewer)` for `undefined`, B and A has `recipes` without U and `recipeCount === 1`.
  - `apps/api/src/routes/sitemap.test.ts`: a new DB-backed `describe` calls the real `deps.getPublicRecipes()` and `deps.getActiveUsers()`. U's slug is absent, and user C, whose only recipe is unlisted, is absent.
  - Run `make test-api`; every new case passes.
- [ ] 10A.2 Write failing Starred tests in `apps/api/src/modules/recipe/service.test.ts`. B favourites A's unlisted U, A's public P, and A's public X, which A then changes to `private`. Then:
  - `listStarredRecipes({}, 1, 20, B)` returns P and U, but not X;
  - A's own favourited draft is returned to A;
  - `total` matches the rows;
  - with `search` set to U's title, it returns U.
  - Confirm the tests fail today, because the Starred list is public-only.
- [ ] 10A.3 Refactor every discovery query to the shared condition. Behaviour is preserved except for Starred:
  - `buildListRecipesWhere` (`recipe/model.ts`): non-admins, and admins without a filter, get `listableRecipeCondition(null)`. The admin filter branch keeps `eq(recipes.visibility, filters.visibility)` with a trailing `// visibility-exempt: admin filter (recipe-visibility)`.
  - `getFeed`: `and(inArray(recipes.authorId, authorIds), listableRecipeCondition(null))`.
  - `findStarred`: base condition `viewableRecipeCondition(userId)` plus the favourites subquery. Its docblock describes the viewer-only rule.
  - `equipment/model.ts`: `const recipeConditions = listableRecipeCondition(null)`.
  - `coffee-variety/model.ts`: both branches of `getRecipesUsingVariety`.
  - `user/model.ts`: `getUserStats` (recipe count) and `getUserPublicRecipes`.
  - `apps/api/src/routes/sitemap.ts`: both `deps` queries.
  - Remove imports that become unused, and update every touched docblock ("public" now names the helper).
  - Run `make test-api`. 10A.1 still passes and 10A.2 now passes.
- [ ] 10A.4 Write failing fork-masking tests. Fixture: B forks A's unlisted U into public F, and separately forks public P into public G.
  - `apps/api/src/modules/recipe/index.test.ts`, anonymous and B: `GET /api/v1/recipes/<F slug>` returns `forkedFrom: null`, `forkedFromId: null`, `forkedFromSlug: null`.
  - The same request by A returns U's `{ id, slug, title }` and no `visibility`/`authorId`/`deletedAt` keys inside `forkedFrom`.
  - G keeps P's attribution.
  - After P is soft-deleted, G is masked for B.
  - F's row has `forkedFromId: null` in `GET /api/v1/recipes`, in the follow feed (`follow/index.test.ts`), in `GET /api/v1/equipment/<E>/recipes` and in `GET /api/v1/coffee-varieties/<V>/recipes`.
  - In `recipe/model.visibility.test.ts`, replace the `describe.todo` with `maskUnlistableForkSources` cases: no query when no row has a source (spy on `db.select`); public sources are kept; unlisted, private and deleted sources are masked.
- [ ] 10A.5 Implement `maskUnlistableForkSources<T extends { forkedFromId: string | null }>(rows: T[]): Promise<T[]>` in `recipe/model.ts`:
  - collect the distinct non-null `forkedFromId`s and return `rows` unchanged when there are none;
  - otherwise run one query, `db.select({ id: recipes.id }).from(recipes).where(and(inArray(recipes.id, ids), listableRecipeCondition(null)))`;
  - map `forkedFromId` to `null` for every source missing from the result;
  - log `modelLog.debug({ rowCount, maskedCount }, 'maskUnlistableForkSources completed')`;
  - write a docblock.
  Apply it to the returned rows of `findListPage` (t7), `findCursor`, `getRecipesUsingEquipment` and `getRecipesUsingVariety`. Run the 10A.4 list cases.
- [ ] 10A.6 Fork attribution on the detail:
  - In `findById`/`findBySlug`, change the relation to `forkedFrom: { columns: { id: true, slug: true, title: true, visibility: true, authorId: true, deletedAt: true } }`.
  - Add `resolveForkAttribution(forkedFrom, viewerId)` to `recipe/service.ts`. It returns `{ forkedFrom: { id, slug, title } | null, forkedFromId: string | null, forkedFromSlug: string | null }` and keeps the source only when `canListRecipe(forkedFrom, viewerId)`. Write a docblock and add entry/exit debug logs with `{ viewerId, masked }`.
  - In the `GET /:slugOrId` handler (`recipe/index.ts` ~:541-585), spread its result after `...r` so the raw `forkedFromId` and `forkedFrom` are overwritten. Delete the `forkedFromSlug: r.forkedFrom?.slug ?? null` line.
  - Run `make test-specific filter=src/modules/recipe/index.test.ts`.
- [ ] 10A.7 Brew log on unlisted recipes:
  - Add failing cases to `apps/api/src/modules/brew-log/service.test.ts`: `createBrewLog(B, { recipeId: U })` succeeds; `createBrewLog(B, { recipeId: <A's private> })` and `<A's draft>` throw `RECIPE_NOT_FOUND`. Add a failing case to `brew-log/index.test.ts`: B's `POST /api/v1/brew-logs` for U returns `201`, and A's `GET /api/v1/brew-logs` does not contain B's log.
  - Then replace the check at `brew-log/service.ts:27` with `if (!recipe || !canViewRecipe(recipe, userId)) throw new Error('RECIPE_NOT_FOUND')`, importing `canViewRecipe` from `../recipe/service.ts`. Keep the existing logs, and update the `createBrewLog` docblock ("visible to the user per `canViewRecipe`").
- [ ] 10A.8 Write failing `X-Robots-Tag` tests:
  - `apps/api/src/routes/share.test.ts`: `GET /share/<U slug>` and `GET /share/<unknown>` both return the same `404` HTML body with `X-Robots-Tag: noindex, nofollow`; public P returns `200` without the header.
  - `apps/api/src/middleware/crawler.test.ts`, `deps.getRecipeMeta` stubbed: a `Googlebot` user agent on `/recipes/<U slug>`, on `/recipes/<unknown>` (stub throws `RECIPE_NOT_FOUND`) and on a stub that throws a generic error each fall through to the next handler, and the response carries the header; public returns OG HTML without it; a non-recipe path gets no header.
  - `apps/api/src/modules/recipe/index.test.ts`: U's detail, versions and diff responses carry the header for anonymous viewers and for A; P's do not.
  - `apps/api/src/modules/collection/index.test.ts`: K's detail carries the header; a public collection's does not; A's private collection detail requested by A carries it.
- [ ] 10A.9 Implement the headers:
  - `routes/share.ts`: set `c.header('X-Robots-Tag', 'noindex, nofollow')` on both 404 returns.
  - `middleware/crawler.ts`: after a recipe-path match, if the meta is missing, not public, or the lookup throws, `await next()` and then `c.res.headers.set('X-Robots-Tag', 'noindex, nofollow')`. Log at debug with `{ slug, reason }`, where `reason` is `missing`/`non-public`/`error`.
  - `recipe/index.ts` `GET /:slugOrId`, `GET /:slug/versions` and `GET /:slug/versions/diff`, and `collection/index.ts` `GET /:id`: set the header when `visibility !== 'public'`.
  - Add `headers: { 'X-Robots-Tag': { schema: { type: 'string' }, description: 'noindex, nofollow for non-public items' } }` to those routes' `describeRoute` 200 responses and to the share 404 response. Keep `zValidator`.
  - Run `make test-specific filter=openapi.coverage.test.ts`.
- [ ] 10A.10 Write `apps/api/src/modules/recipe/visibility.enforcement.test.ts`, the static scan from the `recipe-visibility` requirement "An enforcement test keeps every recipe listing on the shared condition":
  - read the files with `node:fs` relative to `import.meta.dirname`;
  - implement Rule A (no inline comparisons outside the two helpers, except lines ending in `// visibility-exempt:`);
  - implement Rule B (units that touch `recipes` must reference a helper unless they are in `EXEMPT_UNITS`, which starts with the exact list from the spec, each with a reason string);
  - implement Rule C (`buildListRecipesWhere`, `getFeed` and `findStarred` must reference a helper);
  - add the stale-key check and the self-test on an in-memory fixture.
  - Run it. It passes.
  - Add a temporary `eq(recipes.visibility, 'public')` list function to `apps/api/src/modules/user/model.ts`, confirm the test fails and names `user/model.ts#<fn>` with its line, then remove the function.
- [ ] 10A.11 Add a "Visibility" section to `docs/api.md`:
  - the four values and the surface-class table from the `recipe-visibility` spec;
  - "unlisted = direct link only; never listed, searched, counted on public lists or indexed";
  - Starred includes unlisted recipes the caller favourited;
  - fork fields are `null` unless the source is public;
  - the `X-Robots-Tag` header;
  - admin exemption.
  Link it from the collections "Visibility of items" note (task 9.15).
- [ ] 10A.12 Group check: run `make check`, `make lint`, `make test-api` (after `make test-db-provision`) and `make test-shared`, then `make fmt` and `make fmt-check`. Everything must be green.

### Group 14 (web data loading). Insert AFTER task 14.5

- [ ] 14.? Write failing assertions in `apps/web/src/pages/recipes/RecipeVersionsPage.test.tsx`, `VersionDiffPage.test.tsx` and `RecipeComparePage.test.tsx`: after render, `document.head.querySelector('meta[name="robots"]')?.getAttribute('content') === 'noindex, nofollow'`. Then pass `noIndex` to the existing `SEOHead` in `RecipeVersionsPage.tsx` (:85), `VersionDiffPage.tsx` (:162) and `RecipeComparePage.tsx` (:151), and update each component docblock ("never indexed: derived view").

### Group 14. Insert AFTER task 14.8 (the `RecipeDetailPage` loader is in `RecipeDetailPage.data.ts` by then)

- [ ] 14.? Write failing tests in `apps/web/src/pages/recipes/RecipeDetailPage.test.tsx`:
  - (a) the loader with `?from=qr` for an `unlisted` recipe returns data and does not redirect;
  - (b) `?from=qr` where `recipeApi.get` rejects with a 404 `ApiError` throws `redirect('/recipes/unavailable')`;
  - (c) without `from=qr`, a 404 still throws the 404 `Response`;
  - (d) rendering an `unlisted` recipe sets `<meta name="robots" content="noindex, nofollow">`, leaves no `link[rel="canonical"]` and renders no `script[type="application/ld+json"]`;
  - (e) a `draft` recipe viewed by its author behaves like (d);
  - (f) a `public` recipe has no robots meta, a canonical link and the JSON-LD script.
- [ ] 14.? Implement the QR landing and the head rules:
  - In `apps/web/src/pages/recipes/RecipeDetailPage.data.ts`, wrap `recipeApi.get(slug, { signal })`. On a 404 `ApiError`, throw `redirect('/recipes/unavailable')` when `fromQr`, and the 404 `Response` otherwise. Delete the `recipe.visibility !== 'public'` redirect, and log `log.debug({ slug }, 'QR visit to unavailable recipe')` on that redirect.
  - In `RecipeDetailPage.tsx`, compute `const isPublic = recipe.visibility === 'public'`. Pass `noIndex={!isPublic}` and `canonical={isPublic ? <url> : undefined}` to `SEOHead`, and render `<RecipeJsonLd …/>` only when `isPublic`.
  - Update the loader and component docblocks.
  - Run `make test-web`.

### Group 14. Insert AFTER task 14.10

- [ ] 14.? Write failing cases in `apps/web/src/pages/collections/CollectionDetailPage.test.tsx`:
  - an `unlisted` collection sets the robots `noindex, nofollow` meta and `document.title === '<name> | BrewForm'`;
  - a `private` collection rendered for its owner sets the robots meta;
  - a `public` collection has no robots meta.
  Then render `<SEOHead title={collection.name} description={collection.description ?? undefined} noIndex={collection.visibility !== 'public'} />` in `apps/web/src/pages/collections/CollectionDetailPage.tsx`, and update its docblock.

## 4. Tasks to modify or remove

- **9.1** → replace with: "Write failing DB-backed tests first in `apps/api/src/modules/collection/service.test.ts`:
  - a soft-deleted item is hidden from the anonymous viewer, the owner and the recipe author;
  - another author's recipe made private is hidden from anonymous viewers and from the owner, but returned to its author;
  - another author's recipe made unlisted is hidden from anonymous viewers, from the owner and from a third user, but returned to its author;
  - the owner's own draft and own unlisted recipe are hidden from others and returned to the owner;
  - `recipeCount === items.length`;
  - an item that is a public fork of an unlisted recipe has `recipe.forkedFromId === null` for every viewer (collection items mask viewer-independently, because the cached shape is shared);
  - warm cache → recipe made private → the next anonymous hit omits it without calling `model.findById` (spy via the provider test hook);
  - warm cache → recipe made unlisted → the next anonymous hit and the owner's hit omit it;
  - warm cache → recipe soft-deleted → it is omitted;
  - warm cache → fork source made unlisted → the item's `forkedFromId` becomes `null`;
  - reorder with a hidden item succeeds with visible ids and rejects a payload that contains the hidden id.
  In `index.test.ts`, an anonymous `GET /api/v1/collections/:id` body contains neither the private recipe's title and slug nor the unlisted recipe's title and slug."
- **9.3** → replace with: "Change the batched `recipeCount` queries in `findByUserId` and `findAllPublic` (and therefore `findPublicByUserId`) to `innerJoin(recipes, eq(collectionItems.recipeId, recipes.id))`, filtered by the shared condition imported from `../recipe/model.ts`: `listableRecipeCondition(userId)` for the owner's list and `listableRecipeCondition(null)` for public lists. Add an audience parameter so that `findPublicByUserId` counts as anonymous. Do not compare `recipes.visibility` inline. Extend `model.test.ts` with owner-vs-anonymous count cases: public, own draft, own unlisted, another author's unlisted, another author's private, soft-deleted (owner `3`, anonymous `1`)."
- **9.4** → replace with: "In `apps/api/src/modules/collection/service.ts`, add one `filterItemsForViewer(detail, viewerId, states)` helper:
  - drop items whose recipe is missing from `states`, is soft-deleted, or fails `canListRecipe(state, viewerId)` (import the canonical predicate from `../recipe/service.ts`; do not re-implement it);
  - set `item.recipe.forkedFromId` to `null` when its source is absent from `states` or fails `canListRecipe(sourceState, null)`;
  - recompute `recipeCount`.
  Make `toDetailOutput` exclude items whose recipe is null or already deleted at fill time."
- **9.5** → replace with: "Apply the filter in `getCollection` on both paths through the same code:
  - after the collection visibility check (cache miss) or re-check (cache hit), call `model.getRecipeVisibilityStates([...itemRecipeIds, ...itemForkSourceIds])` once and pass the states to `filterItemsForViewer`;
  - on a miss, cache the unfiltered, viewer-independent shape and return the filtered one;
  - apply the same filter in the `createCollection`/`updateCollection` outputs, with the owner as viewer;
  - log `hiddenCount` and `maskedForkCount` (counts only) in the `getCollection completed` / `cache hit` debug lines."
- **9.6** → replace "against the owner-visible set" with "against the owner-listable set (`canListRecipe(recipe, ownerId)` over fresh `getRecipeVisibilityStates`)". The rest of the text is unchanged.
- **9.8** → replace with: "Add failing cases to `apps/web/src/components/collections/AddToCollectionModal.test.tsx`: the hidden-recipe note renders for `recipeVisibility` `draft`, `private` and `unlisted`, and not for `public`."
- **9.9** → replace "when it is `draft` or `private`" with "when it is `draft`, `private` or `unlisted`".
- **9.10** → replace with: "Add `collection.modal.hiddenRecipeNote` to BOTH `packages/shared/src/i18n/en.json` ("Only you can see this recipe in your collections until you make it public.") and `packages/shared/src/i18n/tr.json` ("Bu tarifi herkese açık yapana kadar koleksiyonlarında yalnızca sen görebilirsin.")"
- **9.15** → replace with: "Add a short "Visibility of items" note to the collections section of `docs/api.md`: unlisted, private and draft recipes are shown only to their own author, and deleted recipes to nobody; collection ownership grants nothing; counts follow the audience (the owner's list counts the owner's own non-public recipes, public lists count public recipes only); unlisted collections open by direct link and are never listed to non-owners; link to the "Visibility" section (task 10A.11)."
- **10.13** → in the sentence "Make `findStarred` build its `finalWhere` (starred subquery and public visibility)", replace "public visibility" with "`viewableRecipeCondition(userId)` from group 9 — Starred is a viewer-only record per the `recipe-visibility` capability; the behaviour change itself is tested and finished in task 10A.2/10A.3". The rest is unchanged.
- **14.9** → replace "Keep t3's `recipeVisibility` prop and the `collection.modal.hiddenRecipeNote` line (task 9.9)." with "Keep t3's `recipeVisibility` prop and the `collection.modal.hiddenRecipeNote` line for `draft`, `private` and `unlisted` (task 9.9)."
- **24.5** → append: "Add a database-rules bullet: 'Recipe listings build their visibility filter only from `listableRecipeCondition`/`viewableRecipeCondition` in `apps/api/src/modules/recipe/model.ts` (discovery surfaces pass `null`); services use `canViewRecipe`/`canListRecipe`; never compare `recipes.visibility` inline (enforced by `visibility.enforcement.test.ts`; admin is exempt). Unlisted means direct-link only.'"
- **25.12** → append: "; document that non-public recipe and collection pages render `noindex, nofollow` with no canonical link or JSON-LD, that version, diff and compare pages are always noindex, that the API sends `X-Robots-Tag: noindex, nofollow` for non-public items and for share/crawler misses, and that the sitemap, share and crawler OG pages cover public recipes only"
- **25.15** → append: "; a 'Visibility' subsection with the four values (unlisted = direct link only: never in search, lists, profiles, feeds, category pages, collections of others, the sitemap or OG previews; Starred and the brew journal may show unlisted recipes the user saved; fork attribution is hidden unless the source is public)"
- **9.16 / 10A.12** group checks: no change beyond the new group's own check.

## 5. Cross-folder requests

1. **design.md, t3 subsection "Slugs, collection visibility and error mapping (t3)"**:
   - Replace Decision 6 with: "6. **Collection item predicate = `canListRecipe` (from `recipe-visibility`) + not soft-deleted.** Public recipes are visible to everyone; unlisted, draft and private recipes only to the recipe's author (user decisions OQ1 and D4, 2026-11-19). Collection ownership grants nothing extra, and the admin flag is not passed. Alternatives: let the owner see everything in their own collection (an owner would see another author's now-hidden recipe, which is itself a leak), or `canViewRecipe` (shows unlisted recipes to everyone, which the user rejected)."
   - In Decision 7, replace "On a hit, `model.getRecipeVisibilityStates(recipeIds)` (one PK `inArray`, 4 columns) supplies fresh state first." with "On both paths, one `model.getRecipeVisibilityStates([...recipeIds, ...forkSourceIds])` call (one PK `inArray`, 4 columns) supplies fresh state for the item filter and the fork-source mask."
   - Replace Decision 8's two bullets with "Owner list: `listableRecipeCondition(ownerId)` (non-deleted, public or authored by the owner)." and "Public lists: `listableRecipeCondition(null)` (non-deleted public only)."
   - In Decision 10, replace "When the recipe is draft or private" with "When the recipe is draft, private or unlisted".
2. **design.md**: insert §2 above ("Unlisted visibility everywhere (user decisions OQ1 and D4)") as a new subsection right after the t3 subsection. In the Context table, add the row "| refine | Unlisted visibility across every surface (OQ1, D4) | `audit/_refine/unlisted-visibility.md` |".
3. **design.md, Open Questions**:
   - Move "Should unlisted recipes stay visible inside public collections (current choice: yes, per `canViewRecipe`)?" to "Resolved at integration" as: "**Unlisted semantics (OQ1).** Unlisted is direct-link-only everywhere, including inside collections. See 'Unlisted visibility everywhere'."
   - Add to "Still open" the questions from §6 (Q1–Q5).
4. **proposal.md**:
   - (a) In the t3 bullet, replace "Collections hide soft-deleted recipes from everyone and draft/private recipes from everyone except their author." with "Collections hide soft-deleted recipes from everyone and unlisted, draft and private recipes from everyone except their author."
   - (b) Add a "What Changes" subsection:
     "### Unlisted visibility (user decision OQ1)
     - Unlisted means direct-link-only everywhere: never in search, filters, home, feed, equipment or coffee-variety pages, profiles, other users' collections, the sitemap or OG previews, for any viewer including the author (admin exempt). One shared SQL condition pair and predicate pair (`listableRecipeCondition`/`viewableRecipeCondition`, `canListRecipe`/`canViewRecipe`) back every listing, guarded by a static enforcement test.
     - **BREAKING** (API values): `forkedFromId`, `forkedFrom` and `forkedFromSlug` are `null` unless the fork's source is public (the source's author still sees it on the detail).
     - `GET /recipes/starred` now includes the caller's favourited unlisted recipes and own drafts, and drops recipes that became private. Signed-in link holders can log brews of unlisted recipes. QR codes of unlisted recipes open the recipe instead of 'no longer available'.
     - Non-public recipe and collection pages are `noindex, nofollow` without canonical or JSON-LD, version, diff and compare pages are always noindex, and the API adds `X-Robots-Tag` for non-public items and share/crawler misses."
   - (c) Under New Capabilities, add "- `recipe-visibility`: one meaning per visibility value, the shared listing condition and predicates, discovery/link/viewer-only/admin surface classes, fork-attribution masking, noindex rules and the enforcement test."
   - (d) Under Modified Capabilities, add "- `brew-journal`: `createBrewLog` accepts any recipe the caller can view (`canViewRecipe`), so unlisted recipes can be logged by link holders." and "- `recipe-filter` (also): the base visibility conditions come from the shared `recipe-visibility` helpers, and Starred uses the viewer-scoped condition." Extend the `equipment-recipe-query` entry with "; its shared condition set becomes `listableRecipeCondition(null)` with fork-source masking".
   - (e) In the Impact "APIs" list, add "Changed: `/recipes/starred` scope, fork fields masked, `X-Robots-Tag` on non-public detail responses and share 404s, `POST /brew-logs` accepts unlisted recipes".
   - (f) Under Non-Goals → Deferred, add "An author-only 'My recipes' listing (the profile stays public-only for its owner)", "Unguessable URLs for unlisted recipes (slugs stay title-derived)" and "Visibility gating of like, favourite, rate and the photo list for draft/private recipes".
5. **specs/advanced-search/spec.md (coverage agent)**, requirement "Search never widens the listing's visibility scope":
   - Replace "(which recipes a viewer may see in listings, including the rule that unlisted recipes appear only through their absolute link and in their author's own listings)" with "(which recipes a viewer may see in listings: `listableRecipeCondition(null)` on `GET /api/v1/recipes`, so unlisted, draft and private recipes are never searchable — not even by their author — and `viewableRecipeCondition(userId)` on `GET /api/v1/recipes/starred`)".
   - In its scenario "Hidden recipes never match a search", replace "an anonymous client and signed-in user B each send" with "an anonymous client, signed-in user B and user A each send".
6. **tasks.md header comment**: no change needed. The new group 10A depends on groups 9 and 10, as its intro states.
7. **specs/recipe-slug (slug agent)**, FYI only, no edit requested: §6 Q3 asks the user whether unlisted recipes need unguessable URLs. If the user says yes, the slug agent would add "always append the random 6-char suffix when a recipe is created as non-public", and the link would change on public→unlisted. The default is no change.

## 6. Remaining open questions (each with the default applied in the spec)

- **Q1 (interpretation call, flag to the user): viewer-only records.**
  - Default applied: the caller's own Starred list shows favourited recipes the caller can open, including unlisted ones. This widens today's public-only Starred list. The brew journal keeps showing every non-deleted recipe the user logged.
  - Alternative: keep Starred public-only, the literal reading of "unlisted from everywhere". That is a one-line switch to `listableRecipeCondition(null)` in `findStarred` plus flipping two scenarios. Favouriting an unlisted recipe would then appear to do nothing.
- **Q2: an author-only "My recipes" listing.**
  - Default: none in wave 6. Authors do not see their own unlisted, draft or private recipes in search, on their profile or in the feed, matching "only with the absolute link". Today an author already has no way to list their own drafts.
  - Follow-up (ledger): a self-view on the profile Recipes tab using `listableRecipeCondition(viewerId)` with visibility badges.
- **Q3: guessable unlisted URLs.**
  - Default: slugs stay title-derived and immutable, so "unlisted" means "not listed", not "secret". Use `private` for secrecy, and document this in `docs/recipes.md`.
  - Alternative: always add the random suffix to slugs of non-public recipes, or share unlisted recipes by UUID URL. Either belongs to the slug agent's capability.
- **Q4: @mentions in comments on an unlisted recipe.**
  - Default: still delivered. The commenter holds the link and deliberately shares it with the mentioned user, the same as sending the link directly.
  - Alternative: suppress mention notifications on non-public recipes.
- **Q5: version, diff and compare pages are always noindex, including for public recipes.**
  - Default: yes. They are derived views, not in the sitemap, and their payloads carry no visibility.
  - Alternative: add `visibility` to the versions payload and index public ones.
- **Q6 (no change, recorded):**
  - Merge accepts another user's unlisted version (per `recipe-comparison`), because the caller holds both slugs.
  - The default fork title "Fork of <source title>" can repeat an unlisted source's title (not its link) if the forker publishes the fork.
  - Collection list counts may lag a visibility change by the 5-minute list TTL. They carry no identifiers.

## 7. User-facing summary (what changes for unlisted)

- An unlisted recipe opens only through its link (or its id). Nobody, not even its author, sees it in search, filters, the home page, the follow feed, equipment or coffee-variety pages, profiles, other people's collections, the sitemap or link previews. Admins still see everything in admin screens.
- In collections, unlisted, private and draft recipes are shown only to the recipe's own author. Collection counts follow the same rule. An unlisted collection opens by its link and never appears on profiles, in Browse or in "In collections".
- Things that now work on an unlisted recipe for anyone with the link: its QR code opens it (today it shows "no longer available"), "Brew again" works, and favourites appear in your own Starred list.
- A public fork of an unlisted recipe no longer reveals the original (its "forked from" link and id are hidden from everyone except the original's author).
- Search engines are told not to index unlisted, private and draft pages, or the version-history, diff and compare pages.

| Surface | Before (unlisted) | After |
|---|---|---|
| Search, browse, home, feed, equipment and variety pages, profile, sitemap | hidden | hidden (via one shared rule plus an enforcement test) |
| Other users' collections | **shown to everyone** | hidden except to the recipe's author |
| Fork "forked from" (id, slug, title) | **revealed publicly** | hidden unless the source is public |
| Your own Starred list | hidden (even when you favourited it) | shown |
| QR code scan | **"no longer available"** | opens the recipe |
| Brew again (link holder) | 404 | works; the log is private to you |
| Page indexing | indexable, with JSON-LD | `noindex, nofollow`, no JSON-LD, plus an `X-Robots-Tag` header from the API |
