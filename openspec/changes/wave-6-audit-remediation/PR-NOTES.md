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
credential scoping. Docker Compose installs (often with a self-hosted Garage or MinIO) have the same
check, starting with how to get a Garage audit credential, in
[`docs/deployment_compose.md` → "Photo storage security check (installs that ran before wave 6)"](../../../docs/deployment_compose.md#photo-storage-security-check-installs-that-ran-before-wave-6)
(inside §14 "Upgrading from the pre-wave-6 compose file").

<!-- Task 29.13 turns both paths into links in the PR description. -->

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


## Deploy: migration runner, health probes and API runtime image (t4b, group 20)

### Release notes
- **Health and readiness.** `GET /health` is liveness (no dependency check, always `200 {"status":"ok"}`). `GET /ready` is readiness: `200` only when a Drizzle ping settles within 2000 ms and the process is not shutting down, otherwise `503`. Its body always has `status`, `db`, `cache`, `rateLimitStore`, `storage` and `shuttingDown`. Both send `Cache-Control: no-store` and are not rate limited. On SIGTERM/SIGINT `/ready` turns `503` (`db: "skipped"`) before the HTTP server closes, and a second signal is ignored.
- **API image.** It runs as `node` (UID 1000) under `tini`, with no pnpm, tsx, drizzle-kit, curl or wget. `docker-entrypoint.sh [serve|migrate]` runs `node packages/db/src/migrate.ts`, seeds a database that has never been seeded, then runs `exec node src/main.ts`. `RUN_MIGRATIONS=false` skips migrations in `serve` mode. The image `HEALTHCHECK` runs `node /app/healthcheck.mjs /ready` (15s/5s/180s start period/2s start interval/3 retries). Uptime monitors should use `/health`, never `/ready`.
- **Migrations.** `pnpm --filter @brewform/db run migrate` (so also `make db-migrate` and `make test-db-provision`) runs the drizzle-orm migrator with the `pg_trgm` pre-flight. It uses the same `drizzle.__drizzle_migrations` table as `drizzle-kit migrate`, so existing databases continue where they left off. A dev database created by `make db-reset` (`drizzle-kit push`, with no migration rows) cannot be migrated. That was already true with `drizzle-kit migrate`. Use `make db-reset`/`make db-push` for that database.

### Verification records
- **Spike (task 20.11).** Node 26.13.0 native type stripping loads the whole `apps/api/src/main.ts` graph and `seed.ts`, `check-users-empty.ts`, `migrate.ts` and `check-identifiers.ts` in the `builder` image. The `node --import tsx` fallback is not needed.
- **Image size (task 20.13, linux/arm64 local build).** Before: 1.12 GB (1,117,170,283 B, the full builder tree plus pnpm). After: 424 MB (424,303,181 B).
- **Image checks.** `id -u` is `1000`, and `/app/apps/web` is absent. `files/scaa-2.json`, the drizzle journal and `/app/healthcheck.mjs` are present, and curl/wget are absent. `vitest`, `typescript`, `vite`, `drizzle-kit`, `tsx` and `mjml` cannot be resolved from `/app/apps/api`. The healthcheck config is `["CMD","node","/app/healthcheck.mjs","/ready"]` with 15s/5s/180s/2s/3.
- **Boot against an empty database.** The log order is `Entrypoint mode: serve` → migrations → `Database is empty, running seed...` → `Seeding complete.` → `Starting BrewForm API...`, and the container turns `healthy` through its own `HEALTHCHECK`. The process list shows `tini` plus one `node src/main.ts`. `docker stop` logs `HTTP server closed`, `Database connection closed`, `Email transporter closed`, `Cache connection closed`, `Rate-limit store closed` and `Graceful shutdown complete`, then exits `0`. A restart prints `Seed skipped — database already contains data (N users).`. `migrate` mode exits `0`, and `bogus` exits `2` with usage. A wrong password exits `1` before the API starts. `docker stop` during a hung migration exits at once (143). `RUN_MIGRATIONS=false` prints the skip line. Group 7's `docker run … --entrypoint node <image> /app/packages/db/src/check-identifiers.ts` works with the new image.
- **`app-preview`.** The compose `runner` target built and booted as `healthy` against a migrated database: `/ready` returned `200`, and the OpenAPI and recipes endpoints returned `200`.
- **Judgement calls.** The `prod-deps` install is filtered to `@brewform/api...` (only the API's production closure, not the web app's runtime dependencies). It also deletes `*.test.ts`, `test-helpers.ts`, `test-setup.ts`, `src/test-fixtures` and a stray `apps/api/uploads` from the build context. The shutdown handler keeps group 6's rate-limit store close as a fifth step after the cache.

## Deploy: web edge, build context, data volumes and production compose (t4b, group 21)

### Release notes
- **Self-hosting with `compose.production.yml` now boots, keeps photos and routes same-origin.** The web container is the edge: with `API_UPSTREAM=api:8000` (set by the compose file) it proxies `/api/*`, `/uploads/*`, `/share/*` and `/health` to the API, so the SPA calls `/api/v1` on the web origin. `API_DOMAIN` is gone. Photos are written to `/app/uploads`, which is the mounted uploads source.
- **Before you upgrade an install created with the old compose file**, copy your photos out of the old api container (`docker compose --env-file .env.production -f compose.production.yml cp api:/app/apps/api/uploads ./uploads-rescue`) **before** you pull or recreate anything. They were stored outside the volume and are lost when the container is recreated. Steps: `docs/deployment_compose.md` → "Upgrading from the pre-wave-6 compose file". Set `COMPOSE_PROJECT_NAME` to your old project name to keep the old volumes; the new default project name is `brewform-prod`.
- **Data locations.** `UPLOADS_SOURCE`, `POSTGRES_DATA_SOURCE` and `BACKUPS_SOURCE` default to the named volumes `uploads`, `postgres_data` and `backups`. A value that starts with `/`, `.` or `~` selects a host folder instead. An uploads folder must be owned by `1000:1000`; otherwise the API exits at startup and `make prod-fix-uploads-owner` fixes it.
- **New services.** `migrate` (one-shot, gates the api), `backup` (a `pg_dump -Fc` and uploads archive at start-up and every `BACKUP_INTERVAL_SECONDS`, kept `BACKUP_RETENTION_DAYS`, mode `0600`) and the profile-gated `restore`. Every service has a health check, log rotation and a memory limit. The Valkey password is no longer on any command line.
- **Web image runtime settings.** `PUBLIC_APP_URL` rewrites the `og:image`/`twitter:image` tags and the robots `Sitemap:` line at startup. `TRUSTED_PROXIES` (compose default `private_ranges`; empty = trust no proxy; the Cloudflare ranges when Cloudflare connects directly) and `EDGE_MAX_BODY_SIZE` (default `16MB`, above the API's ~11.06 MiB photo cap) are also read at startup. `GET /healthz` answers locally, and the image has a `HEALTHCHECK`. A `VITE_API_URL` containing a newline is now rejected; before, a valid first line let a second line into `/config.js`.

### Verification records
- **Build context (task 21.6).** A `COPY . /ctx` probe measured 105 MB before the rewrite (57 MB `.opencode`, nested `node_modules`, `uploads/`, `openspec/`, `plans/`) and 12 MB after. Both images build with `docker build --no-cache --progress=plain`. The API image still contains `files/scaa-2.json`, the drizzle journal, `healthcheck.mjs` and the email templates, and no `apps/api/uploads` or `coverage`.
- **Edge (tasks 21.4, 21.5).** `scripts/ci/web-entrypoint.test.sh brewform-web:local` passes 50 assertions. Caddy 2.11.9 applies `header_up X-Forwarded-For {client_ip}` over its default header. With `TRUSTED_PROXIES=private_ranges`, a request carrying `X-Forwarded-For: 1.2.3.4, 203.0.113.9` reaches the upstream as `X-Forwarded-For: 203.0.113.9` and `X-Real-IP: 203.0.113.9` (Caddy's default would have appended the hop), so the `-X-Forwarded-For` fallback is not needed. A spoofed header from an untrusted client is replaced by the connecting address, a body over `EDGE_MAX_BODY_SIZE` gets `413` once the upstream reads it, and an upstream outage gives `502` while `/healthz` and `/` stay `200`.
- **Production stack (task 21.18), local images, throwaway project, `WEB_PORT=8088`.** All services were healthy about 15 s after `up -d`, and `migrate` exited `0`. Through the edge, `/healthz` and `/health` returned `200`, `/api/v1/sitemap.xml` returned XML, and `/ready` returned the SPA (not proxied). A photo uploaded after signing in through the edge (curl with the cookie session; the browser sign-in itself is a human check) still loaded after `down` + `up` and after `--force-recreate api`. With `UPLOADS_SOURCE=./data/uploads`, a new upload landed in that folder. A root-owned uploads source made the api exit with `Upload directory /app/uploads is not writable by uid 1000 gid 1000 (EACCES) … make prod-fix-uploads-owner`. The `prod-fix-uploads-owner` command then recovered it, the old photo loaded again, and the api was healthy. On Docker Desktop for Mac a root-owned *host* folder is still writable (virtiofs does not enforce container UIDs), so this was shown with a root-owned named volume; CI's bind-mount pair (task 22.3) runs on Linux. `docker top` and every health-check string showed no password, and `/tmp/valkey.conf` is `0600`. The api had `Memory=1073741824`, json-file `10m`×`5` and `StopTimeout=30`. Stopping the api exited `0` after `Graceful shutdown complete`. A one-shot backup wrote `db-*.dump` (`pg_restore --list` OK) and `uploads-*.tar.gz` (lists the photo), both `0600`, and `docker compose cp backup:/backups/. <dest>` exported them. Stopping valkey for 50 s kept the api `healthy` (`rateLimitStore: "degraded"`). Stopping postgres made it `unhealthy` after 31 s while `/health` stayed `200`, and it was `healthy` again 15 s after postgres returned, with no restart. The `make prod-*` wrappers are group 22's; these runs used the same `docker compose` commands (task 22.2).
- **Restore drill (task 21.19).** Source: `recipes=18 users=7` (one user registered after the seed). The dump and archive were copied into a fresh second project with `docker compose cp <file> backup:/backups/`, then `stop api web` → `--profile restore run --rm -e RESTORE_DB_DUMP=… -e RESTORE_UPLOADS_ARCHIVE=… restore` → `up -d`. (1) Named volumes: `recipes=18 users=7`, the extra user present, the restored photo `200 image/png`, all services healthy. (2) `UPLOADS_SOURCE=./data/drill/uploads` and `BACKUPS_SOURCE=./data/drill/backups`: the same counts, the photo extracted into the host folder and owned by `1000:1000` inside the container, `200 image/png`, all healthy. `RESTORE_DB_DUMP=../../etc/passwd` and a path-suffixed archive name exited `2` with the expected pattern and changed nothing.

## Deploy: Makefile, CI workflow, deployment docs and env templates (t4b, group 22)

### Release notes
- **One CI workflow; images publish only after every check passed.** `.github/workflows/ci.yml` (name `CI`) replaces `ci.yml`, `pr.yml` and `release.yml`. Jobs: `quality` → `test` and `images` in parallel → `publish`. Every pull request now builds both images (no push, no registry login, no secrets) and boot-tests them: `scripts/ci/compose-config-check.sh`, `scripts/ci/smoke-images.sh` (both images standalone, health and readiness, the edge, the client-IP checks, the uploads bind-mount ownership pair) and `scripts/ci/smoke-compose.sh` (the whole `compose.production.yml` stack). On `main` and `v*` pushes, `publish` runs only after `quality`, `test` and `images` succeeded (no `always()`), loads the images `images` smoke-tested from a 1-day artifact, checks their image IDs and pushes them with `docker/metadata-action` tags: `latest` on `main` only (tag pushes never move it), the full commit SHA, and the version tag. It never builds. `scripts/ci/check-publish-needs.sh` (in `quality`) fails CI when a job is missing from `publish.needs`. Superseded PR runs are cancelled; `main` and tag runs never are.
- **Makefile.** `make images` builds `brewform-api:local` and `brewform-web:local` (no `ghcr.io/…:latest` tag). New `make prod-up`, `prod-down`, `prod-logs`, `prod-ps`, `prod-pull`, `prod-backup`, `prod-backup-export DEST=…`, `prod-restore DUMP=… UPLOADS=…`, `prod-check-identifiers`, `prod-fix-uploads-owner` and `prod-smoke` wrap `compose.production.yml` with `--env-file .env.production` and refuse to run without that file. `make release`, `make images-push` and `make prod-up-build` are gone, and `compose.yml` no longer has the broken `app-prod`/`web-prod` services.
- **Docs and templates.** New `docs/deployment_compose.md` (topology, first install, every variable, `TRUSTED_PROXIES`, data storage, health checks, backups with off-host copies, the restore runbook, upgrade and rollback, the pre-wave-6 upgrade with the photo rescue and the S3 photo storage security check). `docs/deployment_coolify.md` gives the exact Coolify health checks (API `CMD` `node /app/healthcheck.mjs /ready`, web `HTTP` `/healthz`), local photo storage with a volume or directory mount plus the `API_UPSTREAM` edge, the `TRUST_PROXY` topology table behind Cloudflare/Traefik, monitoring URLs and manual redeploys after `publish`. `.env.production.example` drops `API_DOMAIN` and lists every optional setting with its default.
- **Operators of an existing Coolify deployment behind Cloudflare:** set `TRUST_PROXY=cloudflare` on the API resource, or all visitors arriving through one Cloudflare edge share a rate-limit bucket. Switch the API health check to Type `CMD` (the `HTTP` type needs curl/wget, which the image does not have). Remove the unused `COOLIFY_API_WEBHOOK`, `COOLIFY_WEB_WEBHOOK` and `COOLIFY_API_TOKEN` secrets.
- **Repository setting to review after merge:** `main` has no branch protection; requiring the `CI` jobs (`quality`, `test`, `images`) is recommended.

### Verification records
- **`make`** (task 22.2): `make help` lists every `prod-*` target; `make prod-up` without `.env.production` prints the copy instruction and exits non-zero without running Compose; `make release` and `make images-push` report "No rule to make target".
- **Standalone image smoke test** (task 22.3), `scripts/ci/smoke-images.sh` against `brewform-api:local`/`brewform-web:local` on OrbStack: exit `0`, 67 `ok` lines. The API turned `healthy` through its own `HEALTHCHECK`, ran as uid `1000`, `/health` = `{"status":"ok"}`, `/ready` = 200 with exactly the six keys and `status: "ready"`; the web edge turned `healthy`, `/healthz` 200, `/` the SPA, `/health` the API JSON and `/api/v1/sitemap.xml` XML through the edge; `web-entrypoint.test.sh` passed; the 1000-owned bind mount turned `healthy`. The root-owned bind-mount check reported SKIP locally because OrbStack (like Docker Desktop) does not enforce host ownership on bind mounts; the script fails instead of skipping when `CI` is set. The API side of that check was shown with a non-empty root-owned named volume: exit `1` and `Upload directory /app/uploads is not writable by uid 1000 gid 1000 (EACCES) …`.
- **Compose smoke test** (task 22.4), `scripts/ci/smoke-compose.sh` with `IMAGE_TAG=local`: exit `0`; all five services healthy and `migrate` exited `0`; `/healthz` and `/health` through port 8088; `healthcheck.mjs /ready` exit `0`; the PNG survived `--force-recreate api` and came back as `200 image/png`; the one-shot backup's dump passed `pg_restore --list` and the archive listed `ci-probe.png`; `stop api` exited `0` with `Graceful shutdown complete`; `down -v` left no containers or volumes.
- **Workflow** (tasks 22.5-22.7): YAML parses; `actionlint` (rhysd/actionlint, with shellcheck) reports nothing; `shellcheck -s sh` is clean on the three new scripts. `check-publish-needs.sh` (run with mikefarah yq v4) exits `0` on `ci.yml` and `1` naming `images` when `images` is removed from `publish.needs`; it also names a new push job (`doc-drift`), ignores a pull-request-only job and rejects `if: always() && …`. Pins: `pnpm/action-setup@73e46992e05b19abd31f2f3c20e0e7370d762115 # v6.1.1`, `dawidd6/action-download-artifact@a92c7ae74cf1df8810783758581e485ac3aaa309 # v28` (that action publishes major tags only); Renovate extends `helpers:pinGitHubActionDigests`.
- **Make targets against a throwaway stack** (`COMPOSE_PROJECT_NAME=brewform-g22`, local images): `prod-up`, `prod-ps`, `prod-fix-uploads-owner` (`/app/uploads` → `1000:1000`), `prod-check-identifiers` ("no blocking issues", exit `0`), `prod-backup`, `prod-backup-export` (two dumps and two archives, `0600`), `prod-restore` without names (usage, exit before stopping anything), with `DUMP=../../etc/passwd` (pattern error, api/web left stopped with the message) and with real names (restored, `chown 1000:1000`, all services healthy again), `prod-down`.
- **Rate limiting through the edge** (task 22.16): 150 `GET /health` through the web port all returned `200`, also after `/api/v1/recipes` had been answered `429` 30 times (100 allowed per minute), and a request from another client address had its own bucket (`RateLimit: "global";r=99`). The edge sends one `X-Forwarded-For` entry (web-entrypoint test) and the compose api env has `TRUST_PROXY=hops`, `TRUST_PROXY_HOPS=1`.
- **Ordering and caps** (task 22.17): the blank-as-unset env change (e1c8720, task 3.2) landed before the upload env changes (e3be145, task 5.29); `EDGE_MAX_BODY_SIZE=16MB` (16,000,000 bytes) is above `PHOTO_BODY_MAX_BYTES` (11,599,872 bytes by default).
- **Only verifiable on GitHub:** the workflow run itself (job order and timeline, `publish` skipped on PRs and on any failed/cancelled need, the gha cache scopes, the artifact hand-off and the image-ID comparison, the GHCR push and tags, secrets on push events, concurrency cancellation), and the root-owned bind-mount check on a Linux runner with `sudo`.

## Lint policy and merge truth fixes (t8, group 23)

### Per-rule lint counts (task 23.14)
Measured inside Docker before any fix with `pnpm exec biome lint --only=suspicious/useAwait --only=suspicious/noEmptyBlockStatements --only=suspicious/noExplicitAny apps packages` (Biome 2.6.6, `recommended` preset; `noExplicitAny` was a warning, the other two were off):

| Rule | Total | Production | Tests / test utilities | Fix |
|---|---|---|---|---|
| `useAwait` | 63 | 6 (api 2, web 4) | 57 (api 30, web 22, db 3, shared 2) | Production loaders and `findById` keep `async` and `return await`; `RedisCacheProvider.close()` resolves explicitly. Test stubs return `Promise.resolve`/`Promise.reject`, and sync test bodies drop `async`. |
| `noEmptyBlockStatements` | 121 | 2 (api `rate-limit/backend.ts`, db `migrate.ts`) | 119 (api 34, web 75, db 9, logger stream 1) | Every hit was an empty no-op function body; there were no empty `catch` blocks. The two production no-ops now carry an explanatory comment, and the test no-ops are explicit `() => undefined` / `() => Promise.resolve()`. |
| `noExplicitAny` (unsuppressed) | 1 | 0 | 1 (`TasteNotesPage.test.tsx`, a suppression that formatting had moved off its line) | Typed `displayNameOf` helper. |

There are 294 justified line-level `noExplicitAny` suppressions (293 in tests; 1 in production at the `hono-openapi` `requestBody` boundary in `utils/openapi/index.ts`, kept because the installed 1.x types still reject `z.toJSONSchema` output), plus 1 `noMisleadingCharacterClass` suppression in `sanitize.ts`. After the fixes the three rules are `"error"` in `biome.json`, and `make lint` exits 0. `packages/shared/src/lint-policy.test.ts` rejects range and file-level suppressions and any suppression without a rule path or justification.

### Release notes
- **Recipe merge.** `POST /api/v1/recipes/merge` now treats a source version whose recipe is soft-deleted as missing (`404 NOT_FOUND`, also for its author). Source access follows the shared `canViewRecipe` rule: another user's `unlisted` recipe can now be merged, and their `private` and `draft` recipes stay `403 FORBIDDEN`.
- **robots.txt.** `Allow: /equipments` and `Allow: /equipment/` now sit before `Disallow: /equipment`, so the public equipment catalog and detail pages are crawlable again. The private `/equipment` page stays disallowed.

### Small fixes found while finishing groups 23-24
- **Seed vs the `lower()` identifier indexes.** Re-running `make db-seed` on a database whose admin or demo account differed only in letter case from the seed's identity (an older install, or data written before migration 0017) failed with `23505 user_email_lower_unique`: `onConflictDoNothing({ target: users.email })` only absorbs the exact constraint. The seed now lower-cases emails, reuses an account that holds the email or username case-insensitively (soft-deleted rows included, like the indexes), and inserts with an untargeted `onConflictDoNothing()`; existing accounts are never rewritten. Covered by a new case in `packages/db/src/seed.idempotent.test.ts` (pre-inserted mixed-case variants, seed run twice).
- **First backup of a fresh install.** The `backup` service only waited for a healthy postgres, so on a fresh `compose.production.yml` install its start-up dump ran before `migrate` finished and held an empty schema (reproduced: the smoke test's new start-up-dump check fails on the old file with "the backup start-up dump does not hold the migrated schema"). `backup` now also waits for `migrate: service_completed_successfully`; `scripts/ci/compose-config-check.sh` asserts it and `scripts/ci/smoke-compose.sh` checks that the first dump lists `TABLE public user`. Because `docker compose run` restarts a completed one-shot dependency, `make prod-backup` (and the smoke test's one-shot backup) now pass `--no-deps`: a manual backup never re-runs `migrate`, so a backup taken after `make prod-pull` still holds the old schema. The stack must be running for `make prod-backup`.
