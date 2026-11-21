# recipe-visibility Specification

## Purpose

Gives each visibility value one meaning for recipes and collections, decided by a single shared
listing condition and predicate pair. Discovery surfaces list only public recipes, unlisted recipes
stay usable through their direct link, fork attribution never reveals a recipe the viewer could not
list, and non-public pages and responses are never indexed. An enforcement test keeps every recipe
listing on the shared condition, and every surface has failing-first regression tests.

## Requirements
### Requirement: Visibility values have one meaning for recipes and collections

The system SHALL give each `visibility` value the same meaning for recipes and for collections: `public` items are listed on discovery surfaces and may be indexed; `unlisted` items are reachable only through their direct URL or id, are never indexed, and are never listed to anyone other than their author (collection: owner), who sees them only on the collection-item and owner-only surfaces below; `private` and `draft` items are visible only to their author (collection: owner).

Every surface belongs to exactly one class, and the class decides what it shows:

| Class | Surfaces | Recipes shown |
|---|---|---|
| Discovery (shared by all viewers) | `GET /api/v1/recipes` browse, search, filters and sorts (non-admin); the home "latest" and "popular" grids; the follow feed `GET /api/v1/follow/feed`; equipment and coffee-variety detail recipe lists; the profile `recipes` array and `recipeCount` of `GET /api/v1/users/:username` (every viewer, including the profile owner); the sitemap; share and crawler Open Graph pages; any future related, similar or fork list | non-deleted `public` only, for every viewer including the recipe's author |
| Collection items (mixed authors) | collection detail items and collection `recipeCount` | non-deleted `public`, plus recipes authored by the viewer (see `recipe-collections`) |
| Direct link | recipe detail by slug or id, versions, version diff, compare and merge, focus mode, fork, comments, like, favourite, rating, brew-log create, QR code, collection detail by id | `canViewRecipe`: `public` and `unlisted` for anyone; `draft` and `private` for the author |
| Viewer-only records | the caller's own Starred list and own brew journal | entries the caller can open (see "Viewer-only records may include unlisted recipes the viewer can open") |
| Owner-only lists | the owner's own collection list (`GET /api/v1/collections`, and `GET /api/v1/users/:userId/collections` when the caller is that user) | every visibility of the owner's own collections |
| Admin | `/api/v1/admin/*`, and `GET /api/v1/recipes` when an admin passes a `visibility` filter | exempt from this capability |

- Bean, vendor and taste-note pages list no recipes. Taste-note filtering runs through
  `GET /api/v1/recipes` and inherits its discovery rule.
- No author-only "my recipes" listing is added in wave 6: the profile Recipes tab stays public-only
  for the owner too, so an author reaches their own `unlisted` recipe through its link (or through a
  collection they own, where they are the recipe's author).
- Notifications are recipient-only snapshots, not discovery surfaces. The follower "new recipe"
  notification is still sent only for recipes created as `public` (`recipe/service.ts:232`), and
  existing notification rows are not rewritten when a recipe's visibility changes.
- The `unlisted` description in `packages/shared/src/constants/visibility.ts` ("Accessible via direct
  link only") stays as is.

#### Scenario: Unlisted recipe is absent from discovery but opens by link

- **WHEN** author A saves recipe U with `visibility: 'unlisted'`, and user B follows A
- **THEN** U is absent, for an anonymous visitor, for B and for A, from `GET /api/v1/recipes` (with and without `search` set to U's exact title), the home grids, B's feed, the recipe lists of every equipment item and coffee variety U uses, the `recipes` array of `GET /api/v1/users/<A's username>`, and `GET /api/v1/sitemap.xml`
- **AND** `GET /api/v1/recipes/<U's slug>` returns `200` to the anonymous visitor

#### Scenario: Private and draft recipes stay author-only

- **WHEN** an anonymous visitor or user B requests A's `private` or `draft` recipe by slug or id
- **THEN** the response is `404 NOT_FOUND`, and only A receives `200`

#### Scenario: Admin listing is exempt

- **WHEN** an admin requests `GET /api/v1/recipes?visibility=unlisted`
- **THEN** U is returned

### Requirement: One shared listing condition and predicate pair decides visibility

The recipe module SHALL expose exactly one SQL condition pair and one pure predicate pair for recipe visibility, and every recipe listing outside the admin module SHALL build its visibility filter from them instead of comparing `recipes.visibility` inline.

```ts
// apps/api/src/modules/recipe/model.ts (model layer: Drizzle only, no `sql` fragments)
/** Non-deleted recipes the viewer may see in a LIST: public, plus the viewer's own. */
export function listableRecipeCondition(viewerId: string | null): SQL;
/** Non-deleted recipes the viewer may OPEN: public and unlisted, plus the viewer's own. */
export function viewableRecipeCondition(viewerId: string | null): SQL;

// apps/api/src/modules/recipe/service.ts (pure, beside the existing canViewRecipe)
export function canViewRecipe(
  recipe: { visibility: string; authorId: string },
  userId?: string | null,
  isAdmin?: boolean,
): boolean; // unchanged
export function canListRecipe(
  recipe: { visibility: string; authorId: string; deletedAt?: Date | string | null },
  viewerId?: string | null,
): boolean;
```

- `listableRecipeCondition(null)` is `and(isNull(recipes.deletedAt), eq(recipes.visibility, 'public'))`.
  `listableRecipeCondition(id)` is `and(isNull(recipes.deletedAt), or(eq(recipes.visibility, 'public'), eq(recipes.authorId, id)))`.
- `viewableRecipeCondition(null)` is `and(isNull(recipes.deletedAt), inArray(recipes.visibility, ['public', 'unlisted']))`.
  `viewableRecipeCondition(id)` adds `or(..., eq(recipes.authorId, id))`.
- `canListRecipe` returns `true` exactly when `deletedAt` is null or absent AND (`visibility === 'public'`
  OR `viewerId` equals `authorId`). It has no admin parameter, because admin surfaces do not use it.
- Discovery surfaces SHALL call `listableRecipeCondition(null)`. They are viewer-independent, which keeps
  any cached result safe to share, and it means an author does not see their own `unlisted`, `draft` or
  `private` recipes on them.
- Other modules' model files (equipment, coffee-variety, collection, user) and `routes/sitemap.ts` import
  the conditions from `../recipe/model.ts`. Services import the predicates from `../recipe/service.ts`.
  Services never import `drizzle-orm`.
- Both predicates follow the `canViewRecipe` precedent: pure, with no logging. The callers log.

#### Scenario: SQL condition and predicate agree

- **WHEN** the parity test inserts recipes by author A in all four visibilities, each both active and soft-deleted, and evaluates each condition for viewer `null`, A and B
- **THEN** the ids that `listableRecipeCondition(viewer)` selects equal the ids for which `canListRecipe(recipe, viewer)` is `true`
- **AND** the ids that `viewableRecipeCondition(viewer)` selects equal the ids for which `canViewRecipe(recipe, viewer)` is `true` and `deletedAt` is null

#### Scenario: Predicate matrix

- **WHEN** `canListRecipe` is called for a non-deleted recipe by A
- **THEN** it returns `true` for `public` with viewer `null`, A or B, `true` for `unlisted`, `private` and `draft` only with viewer A, and `false` for every soft-deleted recipe

### Requirement: Discovery surfaces list only public recipes

The system SHALL return only non-deleted `public` recipes, for every viewer including the recipe's author, from each discovery surface, and each surface's query SHALL use `listableRecipeCondition(null)`.

| Surface | Query |
|---|---|
| `GET /api/v1/recipes` (non-admin, offset and cursor; every filter, sort and search) and the home grids | `buildListRecipesWhere` in `recipe/model.ts`, executed by `findListPage`/`findCursor` |
| Follow feed (offset and cursor) | `getFeed` in `recipe/model.ts` |
| `GET /api/v1/equipment/:id/recipes` | `getRecipesUsingEquipment` in `equipment/model.ts` |
| `GET /api/v1/coffee-varieties/:id/recipes` | `getRecipesUsingVariety` in `coffee-variety/model.ts` |
| `GET /api/v1/users/:username` `recipes` and `recipeCount` | `getUserPublicRecipes` and `getUserStats` in `user/model.ts` |
| `GET /api/v1/sitemap.xml` recipe and user entries | `deps.getPublicRecipes` and `deps.getActiveUsers` in `routes/sitemap.ts` |

- Totals and counts SHALL use the same condition as the rows they count.
- `buildListRecipesWhere` keeps one exemption: when an admin passes `visibility`, it filters on that
  value (marked `// visibility-exempt: admin filter`). An admin without a filter gets the public list.
- The sitemap lists a user only when they have at least one listable recipe.

#### Scenario: Search never finds an unlisted recipe

- **WHEN** anyone, including U's author, sends `GET /api/v1/recipes?search=<U's exact title>` or `GET /api/v1/recipes?authorId=<A>`
- **THEN** U is not in `data` and is not counted in `meta.pagination.total`

#### Scenario: Category pages exclude unlisted recipes

- **WHEN** U's current version uses equipment E and coffee variety V
- **THEN** `GET /api/v1/equipment/<E>/recipes` and `GET /api/v1/coffee-varieties/<V>/recipes` omit U and their `total` excludes it

#### Scenario: Feed excludes unlisted recipes

- **WHEN** B follows A and requests the feed in offset mode and in cursor mode
- **THEN** neither response contains U

#### Scenario: Profile shows public recipes to everyone, including the owner

- **WHEN** an anonymous visitor, B and A each request `GET /api/v1/users/<A's username>`
- **THEN** every response's `recipes` omits U, and `recipeCount` counts only A's non-deleted public recipes

#### Scenario: Sitemap skips unlisted recipes and their authors

- **WHEN** user C's only recipe is unlisted
- **THEN** the sitemap contains neither that recipe's `/recipes/<slug>` URL nor `/u/<C's username>`

### Requirement: Unlisted recipes stay usable through their direct link

The system SHALL let anyone who holds an `unlisted` recipe's URL or id use it like a public recipe page, without making it discoverable.

- Recipe detail, versions and version diff use `canViewRecipe` (unchanged). Compare and merge follow
  `recipe-comparison`, fork follows `recipe-fork-page`, and comments follow `comment-authz`.
  Like, favourite and rating are unchanged.
- Brew logs: `createBrewLog` accepts any recipe that passes `canViewRecipe` (see the `brew-journal`
  delta), so "Brew again" works on an unlisted recipe for any signed-in link holder.
- Share and QR: the web share card and QR card stay visible for `unlisted` recipes
  (`ShareSection.tsx:19`, `RecipeQRCode.tsx:22`), and the QR service refuses only `draft`/`private`
  (`qrcode/service.ts:40`).
- QR landing: the recipe detail loader SHALL redirect a `?from=qr` visit to `/recipes/unavailable`
  only when the recipe request returns `404`. A recipe the caller can open renders normally, whatever
  its visibility. Today every non-public recipe redirects (`RecipeDetailPage.tsx:82`), so every QR
  code of an unlisted recipe lands on "no longer available".
- Adding another author's `unlisted` recipe to a collection stays forbidden (`recipe-collections`
  add rule: other authors' `public` recipes only).

#### Scenario: QR scan of an unlisted recipe opens it

- **WHEN** an anonymous visitor opens `/recipes/<U's slug>?from=qr`
- **THEN** the recipe detail page renders U and no redirect happens

#### Scenario: QR scan of a recipe that is no longer viewable

- **WHEN** a visitor opens `/recipes/<slug>?from=qr` and `GET /api/v1/recipes/<slug>` returns `404` (the recipe became private or draft, or was deleted)
- **THEN** the loader redirects to `/recipes/unavailable`

#### Scenario: Link holder logs a brew of an unlisted recipe

- **WHEN** signed-in user B posts `/api/v1/brew-logs` for A's unlisted recipe U
- **THEN** the response is `201` and the log appears only in B's own brew journal

### Requirement: Fork attribution never reveals a recipe the viewer could not list

The system SHALL expose a fork's source (`forkedFromId`, `forkedFrom` and `forkedFromSlug`) only when the source is listable, and SHALL return all three as `null` otherwise, because an unlisted recipe's id resolves through `GET /api/v1/recipes/:slugOrId` and `POST /api/v1/recipes/:id/fork` and so works as its link.

- Lists are viewer-independent. Every recipe row returned by `findListPage`, `findCursor`,
  `getRecipesUsingEquipment` and `getRecipesUsingVariety` passes through
  `maskUnlistableForkSources(rows)` in `recipe/model.ts`. It runs one query,
  `select id from recipes where id in (<distinct forkedFromIds>) and listableRecipeCondition(null)`,
  and sets `forkedFromId` to `null` for every row whose source is not in the result. It makes no
  query when no row has a source.
- Collection items mask `recipe.forkedFromId` in the same way, from the state lookup the collection
  service already runs (see `recipe-collections`).
- Detail: `findById`/`findBySlug` load `forkedFrom` with `id`, `slug`, `title`, `visibility`,
  `authorId` and `deletedAt`. The `GET /api/v1/recipes/:slugOrId` handler takes its fork fields from
  `resolveForkAttribution(recipe.forkedFrom, viewerId)` in `recipe/service.ts`. The function returns
  `{ forkedFrom: { id, slug, title } | null, forkedFromId, forkedFromSlug }` and keeps the source
  only when `canListRecipe(source, viewerId)` is true. The response never carries the source's
  `visibility`, `authorId` or `deletedAt`.
- The stored `forkedFromId` column, the source's `forkCount` and fork-based badge counts are unchanged.
- The response schemas are unchanged: every field is already nullable.

#### Scenario: Public fork of an unlisted source hides the source everywhere

- **WHEN** user B forks A's unlisted recipe U into public recipe F
- **THEN** an anonymous `GET /api/v1/recipes/<F's slug>` returns `forkedFrom: null`, `forkedFromId: null` and `forkedFromSlug: null`
- **AND** F's row in `GET /api/v1/recipes`, in the feed, on the equipment and coffee-variety pages, and in any collection detail has `forkedFromId: null`

#### Scenario: The source's author still sees the attribution on the detail page

- **WHEN** A requests `GET /api/v1/recipes/<F's slug>`
- **THEN** `forkedFrom` is `{ id: U.id, slug: U.slug, title: U.title }`

#### Scenario: Public sources keep their attribution

- **WHEN** F is forked from public recipe P
- **THEN** every surface returns `forkedFromId: P.id`, and the detail returns P's slug and title

#### Scenario: Deleted or private sources are masked

- **WHEN** F's source is soft-deleted, or becomes `private`
- **THEN** every viewer except the source's author receives `null` for all three fork fields

### Requirement: Viewer-only records may include unlisted recipes the viewer can open

The system SHALL treat the caller's own Starred list and own brew journal as viewer-only records that MAY show `unlisted` recipes, and every surface another person can see SHALL exclude `unlisted` recipes.

- Both surfaces are viewer-only. `GET /api/v1/recipes/starred` requires auth (`recipe/index.ts:306`)
  and reads only the caller's favourites. `GET /api/v1/brew-logs` and
  `GET /api/v1/brew-logs/recipe/:recipeId` require auth and are scoped to the caller
  (`brew-log/index.ts:85,212`). The web profile fetches the Brews tab only when the viewer is the
  profile owner (`UserProfilePage.tsx:73-74`). No endpoint returns another user's favourites or brew
  logs.
- Starred: `findStarred` SHALL filter with `viewableRecipeCondition(userId)` instead of
  `eq(recipes.visibility, 'public')`. The list then shows favourited recipes that are `public` or
  `unlisted`, plus the caller's own `draft`/`private` recipes. Another author's recipe that became
  `private` or `draft`, or was soft-deleted, drops out. This widens today's public-only Starred list.
- Brew journal: the list keeps today's behaviour. It shows every non-deleted recipe the user has
  logged, whatever its visibility.
- Aggregates expose no other recipes: `favouriteCount` and
  `GET /api/v1/brew-logs/stats/recipe/:recipeId` only describe the recipe that was asked for.

#### Scenario: Favourited unlisted recipe appears in the caller's Starred list

- **WHEN** B favourites A's unlisted recipe U and requests `GET /api/v1/recipes/starred`
- **THEN** U is in B's list

#### Scenario: Recipe that became private leaves the Starred list

- **WHEN** B favourited A's public recipe P and A later changes P to `private`
- **THEN** B's Starred list no longer contains P, and A's own Starred list still contains P when A favourited it

#### Scenario: Nobody else can read the list

- **WHEN** user C requests `GET /api/v1/recipes/starred`
- **THEN** the response lists only C's own favourites and never B's

### Requirement: Collections follow the same listing rule

The system SHALL list an `unlisted` collection only to its owner and SHALL open it by direct link for anyone.

- `GET /api/v1/collections/public` (`findAllPublic`), `GET /api/v1/users/:userId/collections` for
  anonymous or other callers (`findPublicByUserId`), and the "In collections" list
  `GET /api/v1/recipes/:slugOrId/collections` for non-owners (`getCollectionsForRecipe`) SHALL return
  only `public` collections (today's behaviour, now locked by tests).
- The owner's `GET /api/v1/collections`, and `GET /api/v1/users/:userId/collections` when the caller
  is that user, return every visibility.
- `GET /api/v1/collections/:id` for an `unlisted` collection returns `200` to anyone. Its items follow
  `recipe-collections` ("Collection items show only recipes the viewer may list").
- A `private` or `draft` collection still returns `403` to non-owners.

#### Scenario: Unlisted collection is not listed

- **WHEN** A owns unlisted collection K
- **THEN** K is absent from `GET /api/v1/collections/public`, from `GET /api/v1/users/<A>/collections` for an anonymous visitor and for B, and from `GET /api/v1/recipes/<slug>/collections` for B for any recipe in K
- **AND** K is present in A's `GET /api/v1/collections`

#### Scenario: Unlisted collection opens by direct link

- **WHEN** an anonymous visitor requests `GET /api/v1/collections/<K>`
- **THEN** the response is `200` with K's public items only

### Requirement: Non-public pages and responses are never indexed

The system SHALL mark every page and API response for a non-public recipe or collection as `noindex, nofollow`, and SHALL keep serving Open Graph previews only for public recipes.

- Web recipe detail (`RecipeDetailPage.tsx`): when `recipe.visibility !== 'public'`, `SEOHead` gets
  `noIndex`, no `canonical` is passed (so the canonical link is removed), and `RecipeJsonLd` is not
  rendered. Public recipes are unchanged.
- `RecipeVersionsPage`, `VersionDiffPage` and `RecipeComparePage` always pass `noIndex`. These derived
  views are not in the sitemap, and their payloads do not carry visibility. `RecipeFocusModePage` and
  `RecipeForkPage` already do.
- `CollectionDetailPage` renders `SEOHead` with `title` set to the collection name, `description` set
  to its description, and `noIndex` unless `collection.visibility === 'public'`.
- API: `X-Robots-Tag: noindex, nofollow` SHALL be set on:
  - `GET /api/v1/recipes/:slugOrId`, `GET /api/v1/recipes/:slug/versions` and
    `GET /api/v1/recipes/:slug/versions/diff` responses for a recipe whose visibility is not `public`;
  - `GET /api/v1/collections/:id` responses for a collection whose visibility is not `public`;
  - every `404` from `GET /share/:slug`, whether the slug is unknown or the recipe is not public.
    Both cases return an identical status, body and header, so the header is no existence oracle;
  - every crawler-middleware fall-through for a path matching `/recipes/:slug` when the recipe is
    missing, not public, or its lookup failed. The header is set on `c.res` after `await next()`.
- `share.ts` (`:78`) and `crawler.ts` (`:36`) keep rendering OG HTML only for `public` recipes, and
  `GET /api/v1/recipes/meta/:slug` keeps returning `404` for non-public recipes. None of them is widened.
- The `describeRoute()` metadata of the four JSON routes and the share route documents the
  `X-Robots-Tag` response header. The change is additive, and `zValidator` is kept.

#### Scenario: Unlisted recipe page is noindex and has no structured data

- **WHEN** the recipe detail page renders an `unlisted` recipe
- **THEN** the document head contains `<meta name="robots" content="noindex, nofollow">`, no `link[rel="canonical"]` and no `script[type="application/ld+json"]`

#### Scenario: Public recipe page stays indexable

- **WHEN** the recipe detail page renders a `public` recipe
- **THEN** the head has no robots meta, has the canonical link, and has the recipe JSON-LD

#### Scenario: Unlisted collection page is noindex

- **WHEN** `CollectionDetailPage` renders an `unlisted` collection
- **THEN** the head contains `<meta name="robots" content="noindex, nofollow">` and the title is the collection name

#### Scenario: API marks non-public responses

- **WHEN** `GET /api/v1/recipes/<U's slug>` is requested
- **THEN** the response carries `X-Robots-Tag: noindex, nofollow`, and the same request for a public recipe carries no such header

#### Scenario: Share and crawler do not distinguish unlisted from missing

- **WHEN** `GET /share/<U's slug>` and `GET /share/<unknown slug>` are requested, and a `Googlebot` user agent requests `/recipes/<U's slug>` and `/recipes/<unknown slug>` from the API origin
- **THEN** both share responses are the same `404` HTML with `X-Robots-Tag: noindex, nofollow`, and both crawler requests fall through without OG HTML and carry the same header

### Requirement: An enforcement test keeps every recipe listing on the shared condition

The API test suite SHALL include `apps/api/src/modules/recipe/visibility.enforcement.test.ts`, a static source scan (no database) that fails when a recipe query bypasses the shared visibility condition.

- Scope: every non-test `apps/api/src/modules/*/model.ts` and `apps/api/src/routes/*.ts`, except
  `apps/api/src/modules/admin/**` (admin is exempt).
- Rule A, no inline comparisons: a line matching `(eq|ne|inArray|notInArray)\(\s*recipes\.visibility`
  is allowed only inside `listableRecipeCondition` or `viewableRecipeCondition`, or on a line ending in a
  `// visibility-exempt: <reason>` comment. Each violation is reported as `file:line`.
- Rule B, listings use the helper: the scan splits each file into top-level units (`function` /
  `async function` / `export function` / `export async function` declarations and `export const`
  objects, each starting at column 0, so the non-exported `async function list` in
  `brew-log/model.ts` is its own unit). A unit that
  contains `.query.recipes.findMany(`, `.from(recipes)`, `.innerJoin(recipes` or `.leftJoin(recipes`
  SHALL reference `listableRecipeCondition(` or `viewableRecipeCondition(`, unless it is a key of the
  test's `EXEMPT_UNITS` map (`'<module>/model.ts#<unit>' → reason`). Single-row
  `.query.recipes.findFirst(` lookups (`recipe#findById`, `recipe#findBySlug`) do not match. The
  exemptions expected after groups 9 and 10 are:
  - point lookups whose callers apply `canViewRecipe`: `comment#getRecipeAuthorId`,
    `comment#getRecipeForNotification`, `comment#getRecipeForAccessCheck`, `qrcode#findBySlug`;
  - executors that run a WHERE built by a helper-using unit: `recipe#findListPage`,
    `recipe#buildListPageQuery`, `recipe#findCursor`. Any other unit that only executes a
    caller-supplied `where` is added with the reason `executor`;
  - the state lookup that must see deleted rows: `collection#getRecipeVisibilityStates`;
  - viewer-only records and aggregates: `brew-log#list`, `brew-log#findById`,
    `brew-log#getRecipeBrewStats`, `brew-log#getUserBrewStats`;
  - counts without recipe identifiers: `badge#evaluateBadges`.
- Rule C, required references: `recipe#buildListRecipesWhere`, `recipe#getFeed` and `recipe#findStarred`
  SHALL reference a helper.
- Every `EXEMPT_UNITS` key SHALL name a unit that exists and still matches a Rule B pattern. A stale
  exemption fails the test, so the map stays minimal.
- A self-test runs the scanner on an in-memory fixture with a hand-written
  `eq(recipes.visibility, 'public')` list function and expects both Rule A and Rule B to report it.

#### Scenario: A hand-rolled visibility filter fails the suite

- **WHEN** a developer adds `db.query.recipes.findMany({ where: eq(recipes.visibility, 'public') })` to any model function
- **THEN** `make test-api` fails and names the file, the line and the unit

#### Scenario: Current code passes

- **WHEN** `make test-specific filter=src/modules/recipe/visibility.enforcement.test.ts` runs after the change
- **THEN** it passes, with no stale exemption

### Requirement: Visibility rules have failing-first regression coverage on every surface

The system SHALL lock each rule of this capability with tests. Behaviour changes are written failing first: Starred widening, fork masking, QR landing, brew-log create, the noindex markers and collection unlisted-item hiding. Rules the code already meets are written as regression locks before the helper refactor.

- API, DB-backed against `brewform_test`, with fixtures from `apps/api/src/modules/brew-log/test-helpers.ts`
  (`createRecipe(authorId, visibility)`):
  - `recipe/service.visibility.test.ts` (predicate matrix);
  - `recipe/model.visibility.test.ts` (SQL/predicate parity and `maskUnlistableForkSources`);
  - `recipe/service.test.ts` (search, `authorId`, cursor, Starred);
  - `recipe/index.test.ts` (fork attribution and `X-Robots-Tag`);
  - `follow/service.test.ts` (feed);
  - `equipment/model.test.ts` and `coffee-variety/model.test.ts` (category lists and fork masking);
  - `user/service.test.ts` (profile);
  - `routes/sitemap.test.ts` (DB-backed `deps`);
  - `routes/share.test.ts` and `middleware/crawler.test.ts` (headers);
  - `brew-log/service.test.ts` and `brew-log/index.test.ts` (unlisted create);
  - `collection/index.test.ts` (unlisted collections).
- Web (Vitest):
  - `RecipeDetailPage.test.tsx` (QR landing, robots, canonical, JSON-LD);
  - `RecipeVersionsPage.test.tsx`, `VersionDiffPage.test.tsx` and `RecipeComparePage.test.tsx` (robots);
  - `CollectionDetailPage.test.tsx` (title, robots).
- Every touched service function keeps its entry/exit debug logs, with ids and counts only.

#### Scenario: Behaviour-change tests fail before the fix

- **WHEN** the Starred, fork-masking, QR-landing, brew-log and noindex tests run against the pre-change code
- **THEN** each fails for the documented reason (Starred public-only, raw `forkedFromId`, visibility-based QR redirect, `RECIPE_NOT_FOUND` on unlisted, missing robots meta or header)

#### Scenario: Suites pass after the change

- **WHEN** `make check`, `make lint`, `make test-api` (after `make test-db-provision`) and `make test-web` run
- **THEN** all pass

