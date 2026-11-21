## ADDED Requirements

### Requirement: The QR route answers 404 for recipes it does not encode
`GET /api/v1/qrcode/recipe/:filename` SHALL encode only recipes that pass `canViewRecipe` for an anonymous viewer (`public` and `unlisted`) and SHALL answer every other slug — unknown, soft-deleted, `draft` or `private` — with the same 404 `NOT_FOUND` "Recipe not found" envelope, never 403.

The route is anonymous and slugs derive from titles, so a distinct answer for hidden recipes would
confirm that a guessed title exists. `qrcode/model.ts#findBySlug` returns `id`, `visibility` and
`authorId` for the predicate, and the route documents no 403 response.

#### Scenario: Draft and unknown slugs are indistinguishable
- **WHEN** an anonymous client requests `/api/v1/qrcode/recipe/<a draft recipe's slug>.png` and `/api/v1/qrcode/recipe/<an unused slug>.png`
- **THEN** both responses are 404 with envelope code `NOT_FOUND` and message "Recipe not found"

#### Scenario: Unlisted recipe still gets a QR code
- **WHEN** an anonymous client requests the QR code of an `unlisted` recipe
- **THEN** the response is 200 with the image

### Requirement: The sitemap is a root-level sitemap index with bounded pages
`GET /sitemap.xml` SHALL answer, without a `part` query, a sitemaps.org sitemap index that lists `?part=static` and one `?part=recipes&page=N` and `?part=users&page=N` entry per 50,000 rows, and with `part` that page as a `<urlset>` of at most 50,000 URLs read with a SQL `limit` and `offset` in a stable order.

- The route is served by the API at the site root and proxied by the web edge, so the index, its
  pages and the `/recipes/…` and `/u/…` URLs they list share the root directory (search engines
  apply a sitemap only to URLs under its own directory, and index children must sit in the index's
  directory or lower). `robots.txt` announces `<public origin>/sitemap.xml`.
  `GET /api/v1/sitemap.xml` answers 301 to it, and `docs/seo.md` and both deployment guides SHALL
  tell operators who submitted the old URL to a search console to resubmit `/sitemap.xml`.
- Page counts come from `count()` queries with the same conditions as the rows. Recipe pages order
  by `createdAt`, then `id`; user pages by the user's `createdAt`, then `id`. `SITEMAP_PAGE_SIZE`
  (50,000) is a module constant of `apps/api/src/routes/sitemap.ts`, and `page` is capped at
  50,000 by `SitemapQuerySchema` in `packages/shared/src/schemas/sitemap.ts`.
- A page without rows answers 404 `NOT_FOUND`; an invalid query answers 400 `VALIDATION_ERROR`.
- The index and every page are cached separately for 24 hours through the injected
  `CacheProvider`, with one in-flight build per document.

#### Scenario: Large catalogue is split into pages
- **WHEN** 120,000 public recipes exist and a crawler requests `GET /sitemap.xml`
- **THEN** the index lists the static page, recipe pages 1, 2 and 3, and the user pages, and `GET /sitemap.xml?part=recipes&page=3` returns a `<urlset>` with the last 20,000 recipes

#### Scenario: Every page stays within the protocol limits
- **WHEN** any `?part=recipes` or `?part=users` page is requested
- **THEN** it lists at most 50,000 URLs and is smaller than 50 MB

#### Scenario: A page past the end is not found
- **WHEN** `GET /sitemap.xml?part=recipes&page=4` is requested for that catalogue
- **THEN** the response is 404 `NOT_FOUND`

#### Scenario: The old sitemap URL redirects
- **WHEN** a crawler requests `GET /api/v1/sitemap.xml`
- **THEN** the response is 301 with `Location: <public origin>/sitemap.xml`

## MODIFIED Requirements

### Requirement: Discovery surfaces list only public recipes

The system SHALL return only non-deleted `public` recipes, for every viewer including the recipe's author, from each discovery surface, and each surface's query SHALL use `listableRecipeCondition(null)`.

| Surface | Query |
|---|---|
| `GET /api/v1/recipes` (non-admin, offset and cursor; every filter, sort and search) and the home grids | `buildListRecipesWhere` in `recipe/model.ts`, executed by `findListPage`/`findCursor` |
| Follow feed (offset and cursor) | `getFeed` in `recipe/model.ts` |
| `GET /api/v1/equipment/:id/recipes` | `getRecipesUsingEquipment` in `equipment/model.ts` |
| `GET /api/v1/coffee-varieties/:id/recipes` | `getRecipesUsingVariety` in `coffee-variety/model.ts` |
| `GET /api/v1/users/:username` `recipes` and `recipeCount` | `getUserPublicRecipes` and `getUserStats` in `user/model.ts` |
| `GET /sitemap.xml` recipe and user pages and the index's page counts | `deps.getPublicRecipes`, `deps.countPublicRecipes`, `deps.getListedAuthors` and `deps.countListedAuthors` in `routes/sitemap.ts` |

- Totals and counts SHALL use the same condition as the rows they count.
- `buildListRecipesWhere` keeps one exemption: when an admin passes `visibility`, it filters on that
  value (marked `// visibility-exempt: admin filter`). An admin without a filter gets the public list.
- The sitemap lists a user only when they have at least one listable recipe and their account is
  not soft-deleted.

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
- **THEN** no sitemap page contains that recipe's `/recipes/<slug>` URL or `/u/<C's username>`

#### Scenario: Sitemap skips deleted accounts

- **WHEN** user D has public recipes and deletes their account
- **THEN** no sitemap page contains `/u/<D's username>`, and D's public recipes stay listed

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
  contains `.query.recipes.findMany(`, `.from(recipes)`, `.innerJoin(recipes`, `.leftJoin(recipes`
  or a relational recipe load (`recipe: true` or `recipe: {`)
  SHALL reference `listableRecipeCondition(` or `viewableRecipeCondition(`, unless it is a key of the
  test's `EXEMPT_UNITS` map (`'<module>/model.ts#<unit>' → reason`). Single-row
  `.query.recipes.findFirst(` lookups (`recipe#findById`, `recipe#findBySlug`) do not match. The
  exemptions are:
  - point lookups whose callers apply `canViewRecipe`: `comment#getRecipeForNotification`,
    `comment#getRecipeForAccessCheck`, `qrcode#findBySlug`, `recipe-note#findRecipeForNotes`,
    `recipe#fetchRecipeVersionWithRelations`, and `recipe#updateRecipeWithVersion` (the author's
    write locks its own recipe row);
  - executors and fragments that run or build part of a WHERE composed by a helper-using unit:
    `recipe#buildListPageQuery`, `recipe#buildListCountQuery`, `recipe#findCursor`,
    `recipe#buildRecipeFilters`. Any other unit that only executes a caller-supplied `where` is
    added with the reason `executor`;
  - the collection reads whose service re-checks every item: `collection#getRecipeVisibilityStates`
    (must see deleted rows) and `collection#findById` (relational item load filtered by the service
    with `canListRecipe`);
  - viewer-only records and aggregates: `brew-log#list`, `brew-log#findById`,
    `brew-log#getRecipeBrewStats`, `brew-log#getUserBrewStats`;
  - counts without recipe identifiers: `badge#evaluateBadges`.
- Rule C, required references: `recipe#buildListRecipesWhere`, `recipe#getFeed` and `recipe#findStarred`
  SHALL reference a helper.
- Every `EXEMPT_UNITS` key SHALL name a unit that exists and still matches a Rule B pattern. A stale
  exemption fails the test, so the map stays minimal.
- A self-test runs the scanner on an in-memory fixture with a hand-written
  `eq(recipes.visibility, 'public')` list function, which both Rule A and Rule B must report, and a
  relational `with: { recipe: true }` list function, which Rule B must report.

#### Scenario: A hand-rolled visibility filter fails the suite

- **WHEN** a developer adds `db.query.recipes.findMany({ where: eq(recipes.visibility, 'public') })` to any model function
- **THEN** `make test-api` fails and names the file, the line and the unit

#### Scenario: An unfiltered relational recipe load fails the suite

- **WHEN** a developer adds `db.query.collectionItems.findMany({ with: { recipe: true } })` to a model function without a helper or an exemption
- **THEN** `make test-api` fails under Rule B and names the unit

#### Scenario: Current code passes

- **WHEN** `make test-specific filter=src/modules/recipe/visibility.enforcement.test.ts` runs after the change
- **THEN** it passes, with no stale exemption
