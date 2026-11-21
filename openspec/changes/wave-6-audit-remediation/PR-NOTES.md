# wave-6-audit-remediation: PR notes (draft)

Release-note and PR-description text collected while the change is applied. Each group appends
its own section below; group 29 (task 29.13) builds the single pull request description from
this file.

---

## Release notes: private recipe notes and recipe edits (t1, task 17.17)

### Your notes on other people's recipes were not private

Until this release, the "Personal Notes" box on a recipe page was not a private note. On another
user's recipe it was pre-filled with the recipe author's own notes, and saving it **replaced the
author's public notes**: the text everyone who can view the recipe sees, which also feeds the
recipe description and search. Any signed-in account could do this, through the box or the API,
on any recipe it could address, private and draft recipes included.

What changes:

- **"My private notes"** is a new, separate note per user and recipe that only you can see (the
  recipe author included, admins excluded). It **starts empty for everyone**: nothing typed into
  the old box was moved, because it cannot be told apart from the author's own text.
- The author's notes are now labelled **"Brewer's notes"**, with a hint that everyone who can view
  the recipe sees them. Only the author edits them, from the create and edit pages.
- **Authors: please review your brewer notes.** If other users typed into the old box on one of
  your recipes, their text replaced yours. There is no record of who wrote what, so nothing was
  rolled back automatically. Open the recipe's edit page and correct "Brewer's notes" if needed.

### Recipe edits now save what you changed

- Saving an edit without ticking **"Save as a new version"** now saves every field to the current
  version. Before, only the title and visibility were saved and every other change was silently
  dropped. The hint under the checkbox says which version changes ("Updates the current version
  (v3) in place" or "Creates version v4; v3 stays unchanged").
- A title-only edit no longer turns a public recipe back into a draft, and saving a new version
  keeps the taste notes and their intensities, equipment, additional preparations, photos, TDS,
  coffee variety and the favourite flag.
- Clearing a field (for example the grinder) or removing every taste note or equipment item now
  really clears it.
- The edit page can change the equipment and the coffee variety. Recipes created from a bean stay
  linked to it, and the recipe page links the coffee variety to its variety page.
- Editing a recipe now needs a verified email, like creating one.

### For API clients

- **Removed: `POST /api/v1/recipes/:id/notes`** now returns `404`. Save the caller's own private
  note with `PUT /api/v1/recipes/:id/notes` and `{ "notes": "…" }`; `GET` and `DELETE` on the
  same path read and delete it. These responses carry `Cache-Control: private, no-store`, and a
  recipe the caller cannot view returns `404`. A browser tab opened before the upgrade gets an
  error when saving a note in the old box; reloading the page fixes it.
- `PATCH /api/v1/recipes/:id`: an absent key keeps the stored value, `null` clears it, and `[]`
  removes every taste note, equipment item or preparation. `bumpVersion: false` amends the
  current version in place; `bumpVersion: true` creates a new version that carries forward
  everything the body does not provide. An omitted `visibility` or `isFavourite` is kept (it used
  to reset to `draft`/`false`). Unverified authors get `403 EMAIL_NOT_VERIFIED`.
- `tds` and `coffeeVarietyId` are now stored on create, edit, new version and fork (the variety
  name is filled in by the server). `brewRatio` and `flowRate` in request bodies are ignored;
  the server computes them.
- Details: `docs/api.md` (Recipes → `PATCH /recipes/:id` and "Private notes") and
  `docs/recipes.md` (Versioning, Brewer notes and private notes).

### For operators: S3 photo storage

If your install stored photos in S3-compatible storage (`STORAGE_DRIVER=s3`) before this release,
run the **"Photo storage security check (installs that ran before wave 6)"** in
`docs/deployment_coolify.md` §10: bucket policy, ACL and CORS audit, unexpected object keys, and
credential scoping.

<!-- Task 22.10 adds the same section to docs/deployment_compose.md and links it here. Task 29.13
turns both paths into links in the PR description. -->

---

## Web data loading migration (t5, task 17.19)

Data-loading migration: 41 useEffect fetch blocks in 38 files, 13 inline loaders moved to
`*.data.ts`, 12 mutation-only modules moved to actions, 2 raw-fetch QR downloads moved to a
resource route (65 modules); AuthContext is the only API-client exception.

- Pages read through route loaders (`<Page>.data.ts`), write through route actions that return
  `{ ok: true, … } | { ok: false, error }`, and components read and write through `useFetcher()`
  against `resources/*` routes (ADR-018). The last module migrated was the add-to-collection modal
  (`resources/collections/mine`).
- The guards are now final: `apps/web/src/architecture.test.ts` (no API call inside a
  `useEffect`) and `apps/web/src/data-loading.enforcement.test.ts` (no API-client import, raw
  `fetch(`, misplaced loader/action or data-module import outside the data layer) carry no pending
  list, and the Biome `style/noRestrictedImports` override on `apps/web/src/**` is at `error`, so
  `make lint` fails on a page or component that imports `api/client.ts`, `api/index.ts` or
  `api/static-cache.ts`.
- `make test-web` passes with both pending lists deleted (188 files, 2254 tests).

---

## Search: database-side ranking, bounds and time budget (t7, group 10)

### Release notes

- Recipe search (`GET /api/v1/recipes?search=…` and `/recipes/starred`) is now ranked, ordered and
  paginated by PostgreSQL. The API reads one page plus one `COUNT`, never the whole result set.
  The ranking weights are unchanged (title 3, coffee name 2, personal notes 1, best single version).
- `search` is trimmed and limited to 200 characters (longer → `400 VALIDATION_ERROR`). `%`, `_`
  and `\` now match literally, and a whitespace-only search means no search.
- `sortBy=rating` ("Top rated") now really orders by average rating, with unrated recipes last.
  Before, it silently sorted by newest. Every offset listing breaks ties by `id`, so pages no
  longer repeat or skip recipes.
- List items (`/recipes`, `/recipes/starred`, the follow feed) no longer include `versions[]`, so
  version coffee names and personal notes are no longer sent in list payloads.
- New error: `503 QUERY_TIMEOUT` when a statement runs longer than `DB_STATEMENT_TIMEOUT_MS`
  (default 10000 ms, `0` disables).
- **Operators:** the migrations enable `pg_trgm` (`CREATE EXTENSION IF NOT EXISTS pg_trgm;`) and
  build three GIN trigram indexes. The migrating role needs `CREATE` on the database. The GIN
  index build briefly locks `recipe`/`recipe_version` writes. ADR-017 records the decision.

### Verification records

- **`pg_trgm` availability (task 10.1).** `pg_available_extensions` lists `pg_trgm` with
  `default_version` **1.6** in both official images: compose `postgres:18-trixie` (PostgreSQL
  18.4, Debian) and a throwaway CI-image container `postgres:18-alpine` (PostgreSQL 18.7, musl).
- **Line-reference drift (task 10.2).** The design's line references predate groups 2-9: the search
  branch of `buildRecipeFilters` was at `model.ts:178-200` (design: 128-150), `findMany` /
  `findAllForRanking` at `model.ts:409-482` (design: 359-432), `findStarred` at `model.ts:1655-1693`
  (design: 1191-1232), and `rankRecipes` / `listRecipes` / `listStarredRecipes` at
  `service.ts:657-896` (design: 407-611). The code matched the design's description, so no design
  change was needed.
- **Migrations.** `0018_enable_pg_trgm.sql` (the `--custom` shell, the only hand-written migration
  SQL) and `0019_numerous_fallen_one.sql` (generated `CREATE INDEX … USING gin (… gin_trgm_ops)`,
  numbered after the extension). `make db-generate` prints "No schema changes, nothing to migrate".
- **Index sizes on seeded data (task 10.25)** (`make db-reset`, 18 recipes and 18 versions):
  `recipe_title_trgm_idx` 32 kB (32768 B), `recipe_version_product_name_trgm_idx` 32 kB
  (32768 B), `recipe_version_personal_notes_trgm_idx` 40 kB (40960 B).
- **Manual acceptance (task 10.36)**, dev API with the seed plus 30 temporary public recipes:
  - `GET /api/v1/recipes?search=a&perPage=20` returned 20 items, no `versions` keys, and
    `meta.pagination.total` 48, which matches a direct SQL count of 48.
  - `?search=espresso&page=2` returned 0 items with total 17 (correct: one page of 20).
  - `?search=espresso&perPage=5&page=2` returned 5 items with total 17.
  - `?sortBy=rating&sortOrder=desc` returned the average-10 recipes first, then the 9s, and
    unrated recipes last.
- **`EXPLAIN (ANALYZE, BUFFERS)`** of the search page query (`search=espresso`, `page=2`,
  `perPage=5`, `SET LOCAL enable_seqscan = off`) on the 48-recipe dev database, after merging the
  GIN pending lists and running `ANALYZE`. On a table this small the planner prefers a full B-tree
  index scan with a filter over the trigram bitmap path (both cost far less than a millisecond).
  `model.search.explain.test.ts` proves the trigram path on production-like sizes (4000 filler
  recipes): Bitmap Index Scans on all three trigram indexes for the page and count queries, and
  the same ids in the same order with seqscan on and off.


```text
Limit  (cost=78.32..78.33 rows=5 width=1404) (actual time=0.169..0.170 rows=5.00 loops=1)
  Buffers: shared hit=97
  ->  Sort  (cost=78.31..78.33 rows=10 width=1404) (actual time=0.168..0.169 rows=10.00 loops=1)
        Sort Key: ((CASE WHEN ((recipe.title)::text ~~* '%espresso%'::text) THEN 3 ELSE 0 END + COALESCE(version_score.best, 0))) DESC, recipe.created_at DESC, recipe.id DESC
        Sort Method: quicksort  Memory: 30kB
        Buffers: shared hit=97
        ->  Nested Loop Left Join  (cost=46.61..78.14 rows=10 width=1404) (actual time=0.129..0.154 rows=17.00 loops=1)
              Join Filter: ((version_score.recipe_id)::text = (recipe.id)::text)
              Rows Removed by Join Filter: 81
              Buffers: shared hit=88
              ->  Nested Loop  (cost=46.47..56.69 rows=10 width=1400) (actual time=0.085..0.098 rows=17.00 loops=1)
                    Buffers: shared hit=60
                    ->  Hash Join  (cost=46.32..49.06 rows=10 width=278) (actual time=0.080..0.087 rows=17.00 loops=1)
                          Hash Cond: ((recipe.id)::text = (recipe_1.id)::text)
                          Buffers: shared hit=54
                          ->  Bitmap Heap Scan on recipe  (cost=8.51..11.11 rows=48 width=278) (actual time=0.008..0.011 rows=48.00 loops=1)
                                Recheck Cond: (visibility = 'public'::visibility)
                                Filter: (deleted_at IS NULL)
                                Heap Blocks: exact=2
                                Buffers: shared hit=3
                                ->  Bitmap Index Scan on recipe_visibility_featured_idx  (cost=0.00..8.50 rows=48 width=0) (actual time=0.002..0.002 rows=48.00 loops=1)
                                      Index Cond: (visibility = 'public'::visibility)
                                      Index Searches: 1
                                      Buffers: shared hit=1
                          ->  Hash  (cost=37.68..37.68 rows=10 width=90) (actual time=0.069..0.069 rows=17.00 loops=1)
                                Buckets: 1024  Batches: 1  Memory Usage: 10kB
                                Buffers: shared hit=51
                                ->  Unique  (cost=37.63..37.68 rows=10 width=90) (actual time=0.065..0.067 rows=17.00 loops=1)
                                      Buffers: shared hit=51
                                      ->  Sort  (cost=37.63..37.66 rows=10 width=90) (actual time=0.064..0.065 rows=18.00 loops=1)
                                            Sort Key: recipe_1.id
                                            Sort Method: quicksort  Memory: 25kB
                                            Buffers: shared hit=51
                                            ->  Append  (cost=0.14..37.47 rows=10 width=90) (actual time=0.007..0.058 rows=18.00 loops=1)
                                                  Buffers: shared hit=51
                                                  ->  Index Scan using recipe_pkey on recipe recipe_1  (cost=0.14..16.76 rows=6 width=37) (actual time=0.007..0.020 rows=12.00 loops=1)
                                                        Filter: ((title)::text ~~* '%espresso%'::text)
                                                        Rows Removed by Filter: 36
                                                        Index Searches: 1
                                                        Buffers: shared hit=23
                                                  ->  Index Scan using recipe_version_recipe_id_idx on recipe_version  (cost=0.14..20.66 rows=4 width=37) (actual time=0.005..0.036 rows=6.00 loops=1)
                                                        Filter: (((product_name)::text ~~* '%espresso%'::text) OR (personal_notes ~~* '%espresso%'::text))
                                                        Rows Removed by Filter: 42
                                                        Index Searches: 1
                                                        Buffers: shared hit=28
                    ->  Memoize  (cost=0.15..1.17 rows=1 width=1122) (actual time=0.000..0.001 rows=1.00 loops=17)
                          Cache Key: recipe.author_id
                          Cache Mode: logical
                          Hits: 14  Misses: 3  Evictions: 0  Overflows: 0  Memory Usage: 1kB
                          Buffers: shared hit=6
                          ->  Index Scan using user_pkey on "user"  (cost=0.14..1.16 rows=1 width=1122) (actual time=0.002..0.002 rows=1.00 loops=3)
                                Index Cond: ((id)::text = (recipe.author_id)::text)
                                Index Searches: 3
                                Buffers: shared hit=6
              ->  Materialize  (cost=0.14..20.81 rows=4 width=41) (actual time=0.001..0.003 rows=5.12 loops=17)
                    Storage: Memory  Maximum Storage: 17kB
                    Buffers: shared hit=28
                    ->  Subquery Scan on version_score  (cost=0.14..20.79 rows=4 width=41) (actual time=0.013..0.041 rows=6.00 loops=1)
                          Buffers: shared hit=28
                          ->  GroupAggregate  (cost=0.14..20.75 rows=4 width=41) (actual time=0.013..0.040 rows=6.00 loops=1)
                                Group Key: recipe_version_1.recipe_id
                                Buffers: shared hit=28
                                ->  Index Scan using recipe_version_recipe_id_idx on recipe_version recipe_version_1  (cost=0.14..20.66 rows=4 width=79) (actual time=0.003..0.033 rows=6.00 loops=1)
                                      Filter: (((product_name)::text ~~* '%espresso%'::text) OR (personal_notes ~~* '%espresso%'::text))
                                      Rows Removed by Filter: 42
                                      Index Searches: 1
                                      Buffers: shared hit=28
Planning:
  Buffers: shared hit=794
Planning Time: 0.920 ms
Execution Time: 0.218 ms
```

