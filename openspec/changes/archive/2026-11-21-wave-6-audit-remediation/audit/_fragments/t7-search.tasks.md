### Search: pre-flight

- [ ] Verify `pg_trgm` is available in both images: `docker compose exec -T postgres psql -U brewform -d brewform -c "SELECT name, default_version FROM pg_available_extensions WHERE name = 'pg_trgm'"` (compose, `postgres:18-trixie`), and the same query in a throwaway `postgres:18-alpine` container (CI image). If either lacks it, stop and switch to the documented fallback (ship the SQL-ranking tasks only; skip the "Search: trigram indexes" group).
- [ ] Re-read `apps/api/src/modules/recipe/model.ts:101-150,359-432,1191-1232` and `service.ts:407-611` to confirm the line references in the design before editing. Note any drift in the PR description.

### Search: failing regression tests first

- [ ] Create DB-backed `apps/api/src/modules/recipe/model.search.test.ts` (fixture helpers modelled on `model.cursor.test.ts`; clean up inserted rows in `afterEach`). Add failing cases: (a) 25 productName-only matches newer than one title-only match, `perPage=10`: title match is first on page 1. (b) Best single version scored, not summed across versions. (c) Equal scores ordered by `sortBy=likeCount desc`, then `id`. (d) `İstanbul Blend` title ranked ahead of productName-only matches for `istanbul`. (e) 250 matches, `page=3&perPage=10`: 10 rows, `total` 250. (f) Page 30 is empty with `total` 250. (g) `sortBy=rating` desc/asc with unrated last. (h) 30 recipes with `likeCount` 0: pages 1–3 are disjoint and complete. (i) No `versions` key on list items.
- [ ] Add a failing unit test in `model.search.test.ts` asserting `buildListPageQuery({ search: 'espresso', page: 3, perPage: 10, … }).toSQL()` contains `limit` and `offset` with params 10 and 20, and that `'findAllForRanking' in model` is `false`.
- [ ] Add failing cases to `packages/shared/src/schemas/recipe.test.ts`: `search` of 201 chars is rejected, `'  espresso  '` parses to `'espresso'`, 200 chars accepted.
- [ ] Add failing route tests to `apps/api/src/modules/recipe/index.test.ts`: `perPage=101` → 400 envelope. 201-char `search` → 400 with a `search` detail. `search=%5C` → 200 and the same result as no search. A model/service stub throwing `Object.assign(new Error('Failed query'), { name: 'DrizzleQueryError', cause: Object.assign(new Error('canceling statement due to statement timeout'), { name: 'PostgresError', code: '57014' }) })` → 503 with `error.code` `QUERY_TIMEOUT`, and the captured logs contain neither the search term nor `params:`.
- [ ] Run `make test-specific filter=src/modules/recipe/model.search.test.ts` and `make test-shared` and confirm the new cases fail for the expected reasons (unbounded fetch, rating no-op, missing bound).

### Search: shared schema

- [ ] In `packages/shared/src/schemas/recipe.ts`, change `search` to `z.string().trim().max(200).optional()` and update its JSDoc (case-insensitive substring on title, coffee name and personal notes, relevance-ranked, max 200). Run `make test-shared`.

### Search: model (bounded, database-side ranking)

- [ ] Add exported pure `normalizeSearchTerm(raw: string | undefined): string` to `apps/api/src/modules/recipe/model.ts` (trim, strip `%`, `_`, `\`) with a docblock. Use it in the `search` branch of `buildRecipeFilters` (and for `mainBrewer`/`author` so `\` is neutralized there too).
- [ ] Restructure the `search` branch of `buildRecipeFilters` into `inArray(recipes.id, union(titleIdsSelect, versionRecipeIdsSelect))` (`union` from `drizzle-orm/pg-core`), keeping the null guard. If Drizzle 0.45 rejects a set operator inside `inArray`, use the documented `sql` fallback with a `// D03 raw-SQL exception:` comment. Update the inline mirror of `buildRecipeFilters` in `apps/api/src/modules/recipe/model.test.ts` accordingly.
- [ ] Add `buildListPageQuery(opts: { where; page; perPage; sortBy; sortOrder; search?: string })` to `model.ts`. Use a core select of `getTableColumns(recipes)` plus the `{ id, username, displayName }` author via `innerJoin(users)` and `$dynamic()`. Left-join the grouped version-score subquery when `search` is non-empty, and the `avg(userRecipeRatings.rating)` aggregate when `sortBy === 'rating'`. ORDER BY `[score desc], <sort key> (rating: nulls last), recipes.id` in the `sortOrder` direction. `.limit(perPage).offset((page - 1) * perPage)`. Add `// D03 raw-SQL exception:` comments on the `CASE` and `NULLS LAST` fragments and a docblock covering weights, best-version semantics, tie-breaks and the LIMIT guarantee.
- [ ] Add `findListPage(opts)` to `model.ts`: run `buildListPageQuery` and `db.select({ count: count() }).from(recipes).where(finalWhere)` in parallel, and return `{ recipes, total }` with no `score` key. Add `modelLog.debug` entry and exit logs with `{ page, perPage, sortBy, hasSearch, searchLength, resultCount }` (never the term).
- [ ] Make `findMany` delegate to `findListPage` (no `versions` relation; remove the stale "F11: versions loaded for rankRecipes" comment). Make `findStarred` build its `finalWhere` (starred subquery and public visibility) and delegate to `findListPage` with `search`/`sortBy`/`sortOrder`. Delete `findAllForRanking`. Confirm `getFeed`'s offset path still compiles against `findMany`.

### Search: service

- [ ] In `apps/api/src/modules/recipe/service.ts`, delete `RankableRecipe`, `rankRecipes` and the `hasSearch` JS-ranking branch (`:586-603`). `listRecipes` calls `model.findMany`/`findListPage` with the normalized `search`. Compute `hasSearch` via `model.normalizeSearchTerm`. Keep the cursor fallback and its debug log unchanged. Update the `listRecipes` docblock (no "fetch ALL matching recipes").
- [ ] Pass the normalized `search` through `listStarredRecipes` so starred search is ranked by the same query.
- [ ] In `listRecipes`/`listStarredRecipes`, catch statement-timeout errors (SQLSTATE `57014` on the error or its `cause`). Log `logger.warn({ requestId, searchLength, pgCode: '57014' }, 'Recipe list query timed out')` and rethrow `new Error('QUERY_TIMEOUT')` with no cause, so SQL and params are never logged.
- [ ] Remove the `rankRecipes` import and `describe('rankRecipes')` block from `apps/api/src/modules/recipe/model.test.ts` (`:25`, `:504-600`), porting each ordering expectation into `model.search.test.ts` as a DB-backed case.

### Search: trigram indexes and migrations

- [ ] Generate the extension migration first: `docker compose run --rm app pnpm --filter @brewform/db exec drizzle-kit generate --custom --name=enable_pg_trgm`. Write `CREATE EXTENSION IF NOT EXISTS pg_trgm;` into the new empty SQL file (this is the custom-migration workflow, not an edit of a generated migration). No snapshot change is needed because extensions are not tracked. Then run `make db-generate` and assert "No schema changes, nothing to migrate".
- [ ] In `packages/db/src/schema.ts`, add `index('recipe_title_trgm_idx').using('gin', table.title.op('gin_trgm_ops'))` to `recipes`, and `index('recipe_version_product_name_trgm_idx').using('gin', table.productName.op('gin_trgm_ops'))` and `index('recipe_version_personal_notes_trgm_idx').using('gin', table.personalNotes.op('gin_trgm_ops'))` to `recipeVersions`, each with a docblock naming the search predicate it serves.
- [ ] Run `make db-generate` (inspect, do not edit, the generated `CREATE INDEX … USING gin (… gin_trgm_ops)` SQL; confirm its sequence number is after `enable_pg_trgm`). Then run `make db-migrate`, `make test-db-provision`, and `make db-generate` again, which must print "No schema changes, nothing to migrate".
- [ ] Update the `db-reset` target in `Makefile` to run `docker compose exec -T postgres psql -U brewform -d brewform -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"` after `CREATE DATABASE` and before `$(MAKE) db-push`. Run `make db-reset` and confirm the three indexes exist (`\di *trgm*`).
- [ ] Create DB-backed `apps/api/src/modules/recipe/model.search.explain.test.ts`. Inside `client.begin(...)` run `SET LOCAL enable_seqscan = off`, then `client.unsafe('EXPLAIN (FORMAT JSON) ' + q.sql, q.params)` for the compiled search page query and count query (term `espresso`). Assert Bitmap Index Scan nodes on all three trigram indexes. Also assert the same ids, in the same order, with seqscan on and off for `espresso` and for `istanbul` against `İstanbul Blend`. Add a comment justifying the test-only raw SQL.
- [ ] Record `pg_relation_size` of the three indexes on seeded data in the PR description (index-size check).

### Search: database time budget

- [ ] In `packages/db/src/index.ts`, parse `DB_STATEMENT_TIMEOUT_MS` (default 10000; a non-integer or negative value falls back to the default; `0` disables) and create the pool with `{ max: 10, connect_timeout: 10, idle_timeout: 20, connection: timeoutMs > 0 ? { statement_timeout: timeoutMs } : {} }`. Update the docblock. Coordinate with any ops track editing the same file.
- [ ] In `apps/api/src/middleware/errorHandler.ts` (or the `AppError` mapping, if the error-contract track has landed), map `QUERY_TIMEOUT` and SQLSTATE `57014` (checking `err.code` and `err.cause?.code`) to 503 `{ success: false, error: { code: 'QUERY_TIMEOUT', message: 'The query took too long. Try a more specific search.', requestId } }`. Log without `err.message` (no SQL or params). Add cases to `errorHandler.test.ts`.
- [ ] Add a DB-backed assertion (in `model.search.test.ts`) that `db.execute(sql\`show statement_timeout\`)` returns `10s` by default. Add a unit test for the env parsing helper covering `0`, unset, and garbage values.
- [ ] Add `DB_STATEMENT_TIMEOUT_MS` (commented, default `10000`) to `.env.example` and as an optional passthrough to the app service environment in `compose.yml` and `compose.production.yml`.

### Search: OpenAPI

- [ ] In `apps/api/src/modules/recipe/index.ts` `describeRoute` for `GET /` and `GET /starred`: give `search` `schema: { type: 'string', maxLength: 200 }` and a description ("Case-insensitive substring match on title, coffee name and personal notes; results ordered by relevance (title 3, coffee name 2, notes 1), then sortBy"). Describe `sortBy=rating` as "average rating, unrated last". Add `400` (validation) and `503` (`QUERY_TIMEOUT`) responses with `resolver(ErrorEnvelopeSchema)`. Keep `zValidator`. Run `make test-api` (includes `openapi.coverage.test.ts`).

### Search: web

- [ ] In `apps/web/src/components/recipe-list/RecipeListView.tsx`, add `maxLength={200}` to the search input and `maxLength={100}` to the author input (or pass them through the debounced input component if t5-web-state has replaced these inputs). Add assertions to `RecipeListView.test.tsx`. No new i18n keys are needed.

### Search: docs and rules

- [ ] Add an ADR to `docs/decisions.md` (next free number, ADR-015 at time of writing): "Database-side search ranking with pg_trgm (instead of in-app ranking or full-text search)". Use the Decision / Why / Trade-off format, list the rejected alternatives (FTS `tsvector` + `ts_rank`, bounded top-K + JS ranking, the previous unbounded JS ranking), and state the approved `sql` fragments (`CASE` score, `NULLS LAST`) and the `pg_trgm` extension.
- [ ] Amend the AGENTS.md "Database rules": replace the first bullet and add the "Bounded reads" bullet using the exact wording in `openspec/changes/wave-6-audit-remediation/audit/t7-search.md` §4.
- [ ] Update `docs/architecture.md` "Portability Rules" (`:115-130`) to match the amended AGENTS.md wording, and add the three trigram indexes and the `pg_trgm` extension to the schema/index notes.
- [ ] Add `DB_STATEMENT_TIMEOUT_MS` to the env table in `docs/deployment_coolify.md`, with a note that the migration needs `CREATE` privilege for `pg_trgm` and briefly locks `recipe`/`recipe_version` writes while the GIN indexes build.
- [ ] Update `docs/api.md` (coordinate with the docs track): `search` (max 200, relevance-ranked, trigram-indexed), `sortBy=rating` semantics, the 503 `QUERY_TIMEOUT` error code, and the removal of `versions` from list items.

### Search: verification

- [ ] Run `make check`, `make lint`, `make test-shared`, `make test-api` (with `brewform_test` provisioned via `make test-db-provision`), and `make test-web` for the RecipeListView change. Then run `make fmt` and confirm `pnpm run fmt-check` passes.
- [ ] Run `make db-generate` and confirm "No schema changes, nothing to migrate". Run `openspec validate wave-6-audit-remediation --strict`.
- [ ] Manual acceptance: with the dev stack up, run `GET /api/v1/recipes?search=a&perPage=20` and `?search=espresso&page=2`. Confirm 20 items, no `versions` keys, the correct `meta.pagination.total`, and `sortBy=rating` ordering in the UI ("Top rated"). Paste `EXPLAIN (ANALYZE, BUFFERS)` of the search page query (with `enable_seqscan = off`) into the PR description.
