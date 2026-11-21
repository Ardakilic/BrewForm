## ADDED Requirements

### Requirement: Admin and catalog substring searches match literally and ignore letter case

Every free-text substring filter outside the recipe list SHALL normalise its term with `normalizeSearchTerm` and match with `ilike(<column>, toContainsPattern(term))` from `apps/api/src/utils/search.ts`, so letter case is ignored and `%`, `_` and `\` match literally.

- This covers the admin user list (`GET /api/v1/admin/users?q=`, matched against email, username and
  display name), the admin coffee-variety list (`listCoffeeVarieties` in `admin/model.ts`), the public
  coffee-variety list and search (`coffee-variety/model.ts#findMany`), the equipment search and list
  (`equipment/model.ts#search`, `#findManyWithFilters`), the vendor search (`vendor/model.ts#search`) and
  the taste-note search (`taste/model.ts#searchByName`). Plain `like()` SHALL NOT be used for
  user-supplied search terms.
- A term that is empty after trimming SHALL apply no filter in the paginated lists, and SHALL return no
  rows in the `search` functions that require a term.
- The admin user-search term SHALL NOT be logged, because admins search by email; logs MAY include its
  length.

#### Scenario: Admin user search ignores letter case

- **WHEN** user `Arda<m>` with email `arda<m>@example.com` exists and an admin lists users with `q=ARDA<m>`, and again with `q=Arda<m>@Example.com`
- **THEN** both responses contain that user

#### Scenario: Underscore in an admin search is literal

- **WHEN** users `a_c<m>` and `abc<m>` exist and an admin lists users with `q=a_c<m>`
- **THEN** only `a_c<m>` is returned

#### Scenario: The admin search term is not logged

- **WHEN** an admin lists users with `q=someone@example.com`
- **THEN** no log entry contains `someone@example.com`

#### Scenario: Catalog searches ignore letter case

- **WHEN** equipment with brand `Hario<m>`, vendor `Onyx<m>` and taste note `Fruity<m>` exist, and clients search equipment for `hario<m>`, vendors for `onyx<m>` and taste notes for `fruity<m>`
- **THEN** each search returns the matching row

#### Scenario: Catalog searches treat metacharacters literally

- **WHEN** taste notes `100%<m>` and `1000<m>` exist and a client searches taste notes for `100%<m>`, and coffee varieties `a_c<m>` and `abc<m>` exist and a client lists coffee varieties with `search=a_c<m>`
- **THEN** only `100%<m>` and only `a_c<m>` are returned

## MODIFIED Requirements

### Requirement: Date range filter

The `RecipeFilterSchema` SHALL include optional `dateFrom` and `dateTo` fields, each a calendar day in `YYYY-MM-DD` form (`z.iso.date().optional()`, kept as a string) interpreted as a UTC day: for `dateFrom`, `buildRecipeFilters` SHALL generate `gte(recipes.createdAt, <dateFrom at 00:00:00.000Z>)`, and for `dateTo` it SHALL generate `lt(recipes.createdAt, <the day after dateTo at 00:00:00.000Z>)`.

- `dateFrom` and `dateTo` SHALL be usable independently — either, both, or neither may be provided.
- Both ends are inclusive whole days: `dateFrom=D&dateTo=D` returns every recipe created on UTC day D.
- A timestamp, a non-ISO date or an impossible date (for example `2025-02-30`) is a 400 validation error.
- The filter operates on `recipes.createdAt` (the recipe creation timestamp), NOT on recipe-version creation timestamps, for `GET /api/v1/recipes` and `GET /api/v1/recipes/starred`.
- The web's `extractListParams` (`apps/web/src/utils/recipe-filters.ts`) forwards `dateFrom` and `dateTo` only when they match `YYYY-MM-DD`, so a hand-edited URL value is dropped instead of failing the list loader.

#### Scenario: dateFrom filters to recent recipes only
- **WHEN** recipes exist with createdAt values spanning 2025-01-01 to 2025-12-01 and the client sends `GET /api/v1/recipes?dateFrom=2025-06-01`
- **THEN** only recipes created on or after 2025-06-01T00:00:00Z are returned

#### Scenario: dateTo filters to older recipes only
- **WHEN** the same recipe set exists and the client sends `GET /api/v1/recipes?dateTo=2025-06-01`
- **THEN** only recipes created before 2025-06-02T00:00:00Z (on or before UTC day 2025-06-01) are returned

#### Scenario: dateTo includes the whole chosen day
- **WHEN** recipes were created at 2026-11-20T23:59:59.999Z, 2026-11-21T00:00:00.000Z, 2026-11-21T12:00:00Z, 2026-11-21T23:59:59.999Z and 2026-11-22T00:00:00.000Z, and the client sends `GET /api/v1/recipes?dateFrom=2026-11-21&dateTo=2026-11-21`
- **THEN** exactly the three recipes created on 2026-11-21 are returned

#### Scenario: Both dateFrom and dateTo define an inclusive range
- **WHEN** the client sends `GET /api/v1/recipes?dateFrom=2025-03-01&dateTo=2025-09-01`
- **THEN** only recipes created from 2025-03-01T00:00:00Z up to the end of 2025-09-01 (UTC) are returned

#### Scenario: Invalid date string is rejected by Zod
- **WHEN** the client sends `GET /api/v1/recipes?dateFrom=not-a-date` or `GET /api/v1/recipes?dateTo=2026-11-21T10:00:00Z`
- **THEN** the response is a 400 validation error

### Requirement: Search term bounds and pattern sanitization

The `search` query parameter SHALL be trimmed and limited to 200 characters by `RecipeFilterSchema`, and user-supplied `%`, `_` and `\` characters SHALL be escaped so they match literally and never act as `ilike` pattern metacharacters.

- A `search` longer than 200 characters (after trimming) SHALL be rejected with 400 and the standard validation error envelope.
- The term SHALL be normalized once by the exported pure helper `normalizeSearchTerm(raw)` in `apps/api/src/utils/search.ts` (trim only; `undefined` becomes `''`), and the `ilike` pattern SHALL be built once by the exported pure helper `toContainsPattern(term)` in the same module, which escapes with `\` (PostgreSQL's default `LIKE` escape character) in this order: `\` → `\\`, `%` → `\%`, `_` → `\_`, then wraps the result as `%<escaped>%`. The pattern is a bound parameter of Drizzle's `ilike()`, so no `ESCAPE` clause and no raw SQL is needed, and `pg_trgm` honours the escapes. That same normalized term and pattern SHALL drive search-active detection, the filter predicate and the relevance score, and the same pattern helper SHALL be used for the `mainBrewer` and `author` filters.
- A term that is empty after trimming SHALL be treated as no search: no filter, no score, and cursor pagination remains available. A term made only of metacharacters (for example `\` or `%`) is a real search for those literal characters.
- The raw search term SHALL NOT be logged on any path, including query failures; logs MAY include its length.
- The OpenAPI `search` parameter on `GET /api/v1/recipes` and `GET /api/v1/recipes/starred` SHALL declare `maxLength: 200` and describe the behaviour as a case-insensitive literal substring match on title, coffee name and personal notes, ordered by relevance.
- The web recipe-list search input SHALL set `maxLength={200}` so the UI cannot produce a 400.

#### Scenario: Over-long search is rejected

- **WHEN** the client sends `GET /api/v1/recipes` with a `search` value of 201 characters
- **THEN** the response is 400 with `error.code` `VALIDATION_ERROR` and a detail for field `search`

#### Scenario: Surrounding whitespace is ignored

- **WHEN** a public recipe is titled `Espresso Martini` and the client sends `GET /api/v1/recipes?search=%20%20espresso%20%20`
- **THEN** the recipe is returned

#### Scenario: Whitespace-only search is treated as no search

- **WHEN** the client sends `GET /api/v1/recipes?search=%20%20%20`
- **THEN** the response is 200, no search filter or score is applied, and the result equals `GET /api/v1/recipes`

#### Scenario: Underscore matches literally

- **WHEN** public recipes titled `abc` and `a_c` exist and the client sends `GET /api/v1/recipes?search=a_c`
- **THEN** the recipe titled `a_c` is returned and the recipe titled `abc` is NOT returned

#### Scenario: Percent matches literally

- **WHEN** public recipes titled `100% Arabica` and `1000 Arabica` exist and the client sends `GET /api/v1/recipes?search=100%25`
- **THEN** only `100% Arabica` is returned

#### Scenario: Backslash matches literally and never errors

- **WHEN** a public recipe has productName `C:\beans` and the client sends `GET /api/v1/recipes?search=%5C`
- **THEN** the response is 200 and contains exactly the recipes whose title, productName or personalNotes contain a backslash

#### Scenario: Pattern helper escapes in the right order

- **WHEN** `toContainsPattern('50%_\\')` is called with the five-character term `50%_\`
- **THEN** it returns the pattern `%50\%\_\\%` (each metacharacter preceded by one backslash, the backslash itself doubled)

#### Scenario: OpenAPI documents the bound

- **WHEN** `GET /api/v1/openapi.json` is fetched
- **THEN** the `search` query parameter of `GET /recipes` and `GET /recipes/starred` has `maxLength` 200
