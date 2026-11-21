## Why

The 2026-11-18 health audit (`plans/AUDIT-2026-11-18.md`, 131 findings, every high/critical one confirmed by adversarial verification) found user-facing bugs, security gaps and documentation/spec drift that nothing tracks: any signed-in user can overwrite any recipe's notes, the rate limiter is spoofable and fails with the cache, S3 keys come from client filenames, the production compose file crash-loops and loses photos, admin pages crash, pagination, recipe edits and slugs are broken, and charts render out of bounds. `plans/ROADMAP.md` still says "all ledgered debt resolved", and 25 of 46 OpenSpec specs plus `AGENTS.md` still describe the removed Deno toolchain. This change fixes the issues the user selected, in one coordinated wave. On 2026-11-19 the user answered every open decision (summarised below and recorded in `design.md` → "Resolved by the user (2026-11-19)"). Design detail is in `design.md`, each track's validated evidence is in `audit/<track>.md`, and the refinement evidence is in `audit/_refine/<topic>.md`.

### User decisions folded into this change (2026-11-19)

- **U1** The admin Toast/Confirm provider crash (top-10 item 6) is fixed (t5, `web-shared-components`).
- **U2** Search moves to database-side ranking and pagination with `LIMIT`/`OFFSET` + `COUNT`, `pg_trgm` indexes, a statement timeout and bounded input (t7, `advanced-search`).
- **U3** Web data loading uses React Router loaders, actions and fetchers only, enforced by tests (t5, `web-data-loading`).
- **U4** Pull requests build and boot-test both Docker images; images publish only after every CI job passes, never in parallel with tests (t4b, `ci-image-publishing`).
- **D1** The notes IDOR is fixed and per-user private notes are added (t1, `recipe-personal-notes`).
- **D2** Both audit-missed findings are fixed: a PATCH that omits `visibility` no longer unpublishes the recipe or resets `isFavourite` (`recipe-write`), and no upload filename can make the server sign an S3 request that changes bucket configuration or overwrites an object (`photo-upload-security`).
- **D3/OQ2** Slugs keep a clean base and get a random suffix only on collision, claimed race-free in the database; account identifiers become case-insensitively unique (`recipe-slug`, `unique-identifiers`).
- **D4/OQ1** Unlisted means direct-link only everywhere; collections hide deleted, private, draft and unlisted recipes from everyone except the recipe's author (`recipe-visibility`, `recipe-collections`).
- **D5** Without S3, production compose keeps uploads on a Docker named volume by default, with a one-variable switch to a host folder (`production-operations`).
- **OQ3** The legacy `POST /api/v1/recipes/:id/notes` is removed outright.
- **OQ4** The API exposes a liveness endpoint (`/health`) and a readiness endpoint (`/ready`); the images, compose and the Coolify guide all use them (`production-operations`, `container-deployment`, `deployment-guide`).

## What Changes

### Private notes and recipe write integrity (t1)
- New per-user private notes: a `user_recipe_note` table and caller-scoped `GET`/`PUT`/`DELETE /api/v1/recipes/:id/notes`. No user can read or change another user's note, and private notes never reach search, detail, diff, fork, OG/SEO, caches or logs.
- **BREAKING** `POST /api/v1/recipes/:id/notes` is removed (it now returns 404); it was the IDOR that let any signed-in user overwrite the author's public notes. Author notes (`personalNotes`, relabelled "Brewer's notes") change only through create/PATCH by the author. Existing values are left untouched.
- **BREAKING** `PATCH /api/v1/recipes/:id` with `bumpVersion: false` amends the current version in place with every provided field. A bump runs in one transaction under a row lock and carries forward taste notes (with intensities), equipment, preparations, photos, `tds` and coffee variety.
- `RecipeUpdateSchema` stops injecting Zod defaults (a PATCH no longer unpublishes the recipe or resets `isFavourite`; Zod 4 keeps `.default()` through `.partial()`), pinned by a key-set test: absent keeps, `null` clears, `[]` clears a relation. `tds` and `coffeeVarietyId` are persisted on create, edit, bump and fork. Update validation matches create, unknown references return 400, and duplicate relation ids return 400.
- **BREAKING** `PATCH /api/v1/recipes/:id` requires a verified email and gets full OpenAPI metadata and error mapping. The edit page labels the bump truthfully, sends `null`/`[]`, and gains equipment and coffee-variety pickers. The create page keeps `?beanId`.

### Rate limiting and cache driver (t2)
- Replace the cache-backed limiter with named per-route policies on `rate-limiter-flexible` 11.5.0 behind an in-house Hono adapter: atomic counting on Valkey, fail-soft to per-process memory and then fail-open on an outage, and independence from `CACHE_ENABLED`.
- **BREAKING** (operators): the client IP comes from `TRUST_PROXY` (`none`|`hops`|`cloudflare`, with `TRUST_PROXY_HOPS` and `TRUST_PROXY_CIDRS`) instead of raw `X-Forwarded-For`. Deployments behind a proxy must set it. The production templates do.
- Login is protected per IP and per account following OWASP (failure-only, reset on success and by a password reset). Forgot-password and `send-verification` are limited per account. Comments and reports are also limited per user. Health probes and local `/uploads` leave the global bucket.
- Every 429 carries `Retry-After` plus IETF `RateLimit`/`RateLimit-Policy` headers exposed via CORS, and the web shows a localised "try again in N seconds".
- The memory cache gets an LRU cap and an expiry sweep. The Redis cache fails soft, with a reconciliation flush after an outage. `/ready` reports cache and limiter-store health. Logs and keys never hold raw IPs or emails.

### Slugs, account identifiers, collection visibility and error mapping (t3)
- Built-in slug pipeline (Turkish and Latin transliteration, `recipe-<suffix>` fallback) with real uniqueness across active and soft-deleted rows: the bare slug first, then a random 6-character suffix from a no-vowel alphabet, claimed inside the transaction with `ON CONFLICT (slug) DO NOTHING` (no retry loop, no savepoints), reserved-word and UUID guards with drift tests, and `409 SLUG_CONFLICT` on exhaustion. Duplicate titles, repeat forks and repeat merges stop returning 500. Slugs stay immutable, and legacy `_` slugs get QR codes.
- Account identifiers: emails are trimmed and lower-cased by one shared schema; email and username uniqueness becomes case-insensitive through `lower()` unique indexes (usernames keep their display case); availability checks cover soft-deleted accounts; reserved usernames are refused; one active default setup per user is enforced; an operator script (`make db-check-identifiers`, `make prod-check-identifiers`) detects and fixes conflicting data before the migration.
- Collections hide soft-deleted recipes from everyone and unlisted, draft and private recipes from everyone except their author. Counts follow the audience, cached details re-check recipe visibility on every hit, and reorder works with hidden items.
- **BREAKING** (status codes only): the global error handler unwraps Drizzle-wrapped Postgres errors and maps `HTTPException`. Unique conflicts return 409, bad references and values 400, malformed JSON 400, slug exhaustion 409 `SLUG_CONFLICT`. A typed `AppError` hierarchy and shared Postgres helpers are added, DB error logs drop query parameters, and rating, follow and registration races stop returning 500.

### Unlisted visibility (user decision OQ1)
- Unlisted means direct-link-only everywhere: never in search, filters, home, feed, equipment or coffee-variety pages, profiles, the sitemap or OG previews, for any viewer including the author; inside any collection only the recipe's own author sees it (admin exempt). One shared SQL condition pair and predicate pair (`listableRecipeCondition`/`viewableRecipeCondition`, `canListRecipe`/`canViewRecipe`) back every listing, guarded by a static enforcement test. Unlisted collections follow the same rule.
- **BREAKING** (API values): `forkedFromId`, `forkedFrom` and `forkedFromSlug` are `null` unless the fork's source is public (the source's author still sees it on the detail).
- `GET /recipes/starred` now includes the caller's favourited unlisted recipes and own drafts, and drops recipes that became private (a viewer-only record). Signed-in link holders can log brews of unlisted recipes. QR codes of unlisted recipes open the recipe instead of "no longer available".
- Non-public recipe and collection pages are `noindex, nofollow` without canonical or JSON-LD, version, diff and compare pages are always noindex, and the API adds `X-Robots-Tag` for non-public items and share/crawler misses.

### Photo upload security (t4a)
- Storage keys are fully server-generated (`<uuid>.<ext>`). This closes the S3 bucket-escape and the bucket-subresource injection (`?policy=`, `?acl=`, `?cors=`, `?tagging=`). Images are typed by built-in magic-byte detection with header-only dimension limits. `/api/v1/photos` gets a bounded body cap, and thumbnails are validated like originals. Drivers validate keys, and S3 signs the exact path plus `Content-Type`. The controller never reads the client filename, the local driver never replaces an existing file, `S3_ENDPOINT` must be the bare account endpoint, and the deployment docs give a bucket audit and credential-scoping runbook for S3 installs that ran earlier versions.
- **BREAKING** (API): `POST /api/v1/photos` returns `400 VALIDATION_ERROR | FILE_TOO_LARGE | INVALID_IMAGE`, `415 UNSUPPORTED_MEDIA_TYPE` or `413 PAYLOAD_TOO_LARGE` instead of `400 UPLOAD_ERROR` with raw error text. **BREAKING** (config): the API refuses to boot on an `UPLOAD_ALLOWED_TYPES` outside jpeg/png/webp, or on an `S3_ENDPOINT` with a path, query or fragment. **BREAKING** (internal): `StorageDriver.save(data, key, { contentType })`.

### Production compose, health, env config and CI pipeline (t4b)
- Blank env values count as unset (fixes the compose boot loop), and ports and sizes are range-checked. `UPLOAD_DIR` resolves to `/app/uploads` and is verified writable at startup with a real write (fixes silent photo loss).
- The web Caddy can act as the single edge (`API_UPSTREAM`) for same-origin `/api`, `/uploads`, `/share` and `/health`, with normalised client-IP headers and a runtime `PUBLIC_APP_URL`. The API image runs non-root with `tini` and `exec node`, and ships no web or dev tooling.
- Health and readiness everywhere: `GET /health` is liveness (no dependency checks) and `GET /ready` is readiness (a 2 s database ping; Valkey and storage state reported without failing; `503` while shutting down), both exempt from rate limiting and documented in OpenAPI. Both images declare a `HEALTHCHECK` (the API runs the bundled `node /app/healthcheck.mjs /ready`, the web runs `wget /healthz`), every long-running compose service has a health check, and the Coolify guide gives the exact dashboard settings.
- Without S3, uploads persist on a named volume by default. One variable (`UPLOADS_SOURCE`, likewise `POSTGRES_DATA_SOURCE` and `BACKUPS_SOURCE`) switches each location to a host folder. An unwritable folder stops startup with the exact `chown` fix, and `make prod-fix-uploads-owner` applies it.
- Compose gains a one-shot `migrate` service, restart policies, log rotation, memory limits, a `pg_dump` + uploads backup sidecar (named `backups` volume by default), a profile-gated `restore` service with `make prod-restore`, and a restore/upgrade/rollback runbook.
- **BREAKING** (CI): `release.yml` and `pr.yml` are deleted. One `ci.yml` builds and smoke-tests both images (standalone and as the full production compose stack) on every PR, and its `publish` job pushes the exact smoke-tested images to GHCR only after every other job has passed; a guard fails CI when a job is missing from `publish.needs`. **BREAKING** (maintainers and self-hosters): `make release`/`images-push`/`prod-up-build` and the `compose.yml` `prod` profile are removed, `compose.production.yml` is renamed to project `brewform-prod`, `BACKUP_DIR` is replaced by `BACKUPS_SOURCE`, and pre-wave-6 installs follow upgrade notes to rescue in-container photos.

### Web providers, URL state and data loading (t5)
- The five crashing admin pages are fixed by mounting Toast/Confirm providers once in a new `AppProviders`, plus a router smoke test that renders every route, including all 14 `/admin` routes. `useConfirm()` throws outside its provider (**BREAKING**, internal).
- Recipe pagination is fixed, and every list page keeps filters, sort, page, tab and search in the URL (shareable). A filter change resets the page, and text inputs debounce for 300 ms.
- The web app standardises on React Router loaders, actions and fetchers (no TanStack Query; ADR-018) and migrates 65 modules (41 `useEffect` fetch blocks in 38 files, 13 inline page loaders, 12 mutation-only modules and 2 raw-fetch QR downloads), enforced by a static test that allows the API client only in `*.data.ts`, `routes/**` and the `AuthContext` session bootstrap. Guarded routes redirect to `/login?next=`. The API client gains `AbortSignal`, single-flight refresh and safe parsing. Comment failures no longer replace the page, social toggles no longer refetch it, and the static cache is single-flight and stops cross-tab ping-pong.

### Charts and visualisations (t6)
- A shared chart helper module (`apps/web/src/utils/chart/`) is added. The SCAA radar is rebuilt to stay in bounds, with translated categories and clamped values. BrewTimeline is rebuilt with HTML labels, at most 8 axis ticks for any duration, and clamped phases. StarRating becomes keyboard accessible, with whole-star arrows and one image label in read-only mode.
- Durations, ratios and ratings use locale-aware formatters. One star scale is used everywhere, a `--rating-star` token meets contrast, and geometry and guard tests keep every chart inside its box.

### Search (t7)
- Ranking, sorting and pagination move into Postgres (O(perPage) memory, one page query plus a COUNT), with `pg_trgm` GIN indexes on the three search columns and a migration pre-flight that fails early when the extension cannot be created. `sortBy=rating` works (unrated last). Every listing gets an `id` tie-break, and a pool `statement_timeout` maps timeouts to 503 `QUERY_TIMEOUT`. Search never widens the listing's visibility condition.
- **BREAKING** list items drop the undocumented `versions[]` array. **BREAKING** `search` is trimmed and capped at 200 characters, and `%`/`_`/`\` are escaped, so they match literally and are never wildcards.

### Documentation and OpenSpec truth (t8)
- Archive the stale `remove-deno-node24-pnpm` change with `--skip-specs` first. Retire `deno-runtime`, `deno-workspace-management` and `remote-cache` by folder deletion. Add `node-runtime` and `pnpm-workspace`. Rewrite every Deno-era requirement, and sync the five shipped-but-unsynced capabilities (with a merge soft-delete/visibility fix).
- Restore the lapsed lint rules as errors, enforce docblocks in CI, add a doc-drift guard and a PR template checklist, and generate `docs/api-reference.md` from OpenAPI.
- Rewrite `AGENTS.md` and refresh README, `docs/` and ADR-015..021. Make ROADMAP the single status table, refresh the stale F-plans, and backfill every "Purpose: TBD".

## Capabilities

### New Capabilities
- `recipe-personal-notes`: per-user private notes with caller-scoped endpoints, no leakage, and removal of the legacy notes `POST`.
- `recipe-slug`: built-in transliterating slugs, random no-vowel suffixes claimed in-transaction with `ON CONFLICT DO NOTHING`, reserved guards, `SLUG_CONFLICT`, immutability and legacy-slug addressability.
- `unique-identifiers`: normalized, case-insensitive email and username uniqueness, reserved identifiers of deleted accounts, reserved usernames, one default setup per user, join-row re-creation, and the identifier-check script.
- `recipe-visibility`: one meaning per visibility value, the shared listing condition and predicates, discovery/link/viewer-only/admin surface classes, fork-attribution masking, noindex rules and the enforcement test.
- `api-rate-limiting`: trusted client-IP resolution, named policies, atomic shared counters, outage behaviour and the 429 contract.
- `cache-driver`: memory/redis/null drivers, the bounded LRU, namespaced fail-soft Redis and `/ready` health (replaces `remote-cache`).
- `photo-upload-security`: server-generated keys, magic-byte and dimension checks, the bounded body, S3 request integrity (no filename-driven subresource or overwrite), the bucket-audit runbook and safe errors.
- `api-env-config`: blank-as-unset env values, range checks and a verified absolute `UPLOAD_DIR`.
- `production-operations`: the single production compose definition with one-variable data sources (named volume or host folder), liveness and readiness probes, health checks on every service, migrate service, limits, backups, restore service and runbooks.
- `web-data-loading`: loaders/actions/fetchers as the only data paradigm, auth guards, the action result contract and lint/test enforcement guards.
- `web-url-state`: the URL as the source of truth for list navigation, with debounced text inputs and canonical URLs.
- `chart-rendering`: the shared chart helpers, in-bounds radar and timeline, accessible ratings, formatting and contrast.
- `node-runtime`: Node 26 pins, TypeScript from source, boot and shutdown (readiness flips first), and no Deno remnants (replaces `deno-runtime`).
- `pnpm-workspace`: the pnpm 12 workspace, catalog usage, frozen installs and the toolchain (replaces `deno-workspace-management`).
- `doc-drift-check`: the CI and local guard against stale docs/specs, the generated API reference and the PR checklist.
- `recipe-comparison`: the shipped F08 compare/merge capability, corrected (soft-deleted sources rejected, `canViewRecipe` access).
- `recipe-drink-type-sync`: `DrinkType` from the single `DRINK_TYPES` source (archived d06, synced).
- `recipe-fork-page`: the lazy, auth-guarded fork page (archived d04, synced and corrected).
- `type-consolidation`: `User.emailVerifiedAt` and one shared `AuthUser` type (archived d08, synced).
- `unit-system-display`: unit display follows the auth preference reactively (archived, synced).

### Modified Capabilities
- `recipe-write`: create/amend/bump/fork persist every version field; absent/null/[] semantics with no injected defaults; duplicate relation ids rejected; transactional bump; PATCH gate, mapping and OpenAPI.
- `recipe-collections`: viewer-aware item visibility (unlisted, draft and private recipes only for their author), audience counts through the shared visibility condition, fork-source masking, a cache re-check and hidden-safe reorder; Vitest wording; the collection components load and mutate through fetchers and resource routes, with the hidden-recipe note.
- `brew-journal`: `createBrewLog` accepts any recipe the caller can view (`canViewRecipe`), so unlisted recipes can be logged by link holders.
- `error-handling`: Drizzle-wrapped Postgres and `HTTPException` mapping, typed `AppError`, sanitized DB logs, race paths, and the slug claim and case-insensitive identifier constraints.
- `advanced-search`: SQL ranking, bounded queries, rating sort, input bounds with literal (escaped) matching, trigram indexes with a migration pre-flight, the statement timeout, and no widening of visibility. "Application-level relevance ranking" is removed.
- `recipe-filter`: the search branch of `buildRecipeFilters` becomes one `inArray(recipes.id, union(...))` condition with escaped `toContainsPattern` patterns, and the D03-commented SQL-fragment fallback is named (integration fix for t7). The base visibility conditions come from the shared `recipe-visibility` helpers, and Starred uses the viewer-scoped condition.
- `equipment-recipe-query`: test commands and patterns moved to Vitest/pnpm; its shared condition set becomes `listableRecipeCondition(null)` with fork-source masking.
- `cursor-pagination`: the search-fallback rationale now says ranking happens in SQL. The fallback behaviour is unchanged (integration fix for t7).
- `report-rate-limit`: report limits as named IP and user policies on the trusted client IP, independent of the cache.
- `api-middleware-logging`: the rate-limit exceeded log carries `{ policy, limit, userId? }` (integration fix for t2).
- `request-body-limit`: photo routes are bounded by the photo body cap; the stack order uses the global rate-limit policy; Vitest test list (t8 plus t4a integration fix).
- `recipe-list`: pagination navigates to the selected page, debounced inputs, thin pages with `*.data.ts` loaders.
- `web-shared-components`: app-wide providers, Toast/Confirm mounted once, `useConfirm` throws, a route smoke test over every route, and `useBanUser` submitting through the admin user route action (RENAMED + MODIFIED).
- `web-page-logging`: the two requirements that assumed `useEffect` fetching are RENAMED and moved to loaders, actions and resource routes (same log lines; integration fix for t5).
- `static-cache`: cross-tab sync clears without re-broadcasting (`clearStaticCache()`), which ends the ping-pong (integration fix for t5).
- `container-deployment`: Node 26/pnpm slim non-root image, entrypoint modes, the Caddy edge, recursive `.dockerignore`, built-in readiness `HEALTHCHECK`s in both images and `/health` proxied by the edge. The `compose.yml` prod profile is removed.
- `ci-image-publishing`: single gated `ci.yml` with PR image smoke tests (standalone and the production compose stack); publish pushes the smoke-tested images (artifact hand-off) only after every job, with a `publish.needs` completeness guard. `release.yml` and the webhook requirements are removed.
- `deployment-guide`: Deno-era requirements rewritten (see below), plus the exact Coolify health-check and persistent-storage settings; production migrations described only as the image runs them.
- `lint-style`, `local-dev-environment`, `dependency-management`, `code-documentation`, `api-type-safety`, `web-api-boundary`, `model-test-coverage`, `logging-test-coverage`, `notifications`: Deno-era requirements rewritten for Biome, Vitest and pnpm (titles RENAMED where needed; wave-5 one-off requirements removed). `web-api-boundary`, `model-test-coverage` and `logging-test-coverage` also stop naming functions wave 6 deletes (`recipeApi.saveNotes`; `generateFilename`, `generateThumbnailFilename`, `validateImageUpload`; `rateLimitMiddleware`, `authRateLimitMiddleware`).
- `join-table-audit`, `report-status-enum`, `error-pages`, `i18n`, `text-sanitization`: test commands and patterns moved to Vitest/pnpm (`text-sanitization` added at integration so the doc-drift guard passes).
- `deno-runtime` (removed): retired by deleting `openspec/specs/deno-runtime/`; migration → `node-runtime`.
- `deno-workspace-management` (removed): retired by folder deletion; migration → `pnpm-workspace`.
- `remote-cache` (removed): retired by folder deletion; migration → `cache-driver`.

The three removed capabilities ship no delta folders, because openspec 1.4.1 aborts an archive when a delta removes every requirement of a spec (see `design.md` → Documentation and OpenSpec truth). Every other capability above has exactly one folder under `specs/`.

## Non-Goals

- **Production demo-account seed** (audit item 2): the user answered "No problems". The seed is unchanged.
- **Admin module parallel CRUD** (audit §6.C): the user answered "No problems I believe, admin has more access". The admin write paths are left as they are, apart from the shared unique-violation helper and the `_lower_unique` identifier mapping. Admin surfaces are exempt from the unlisted rule.
- Deferred by the tracks and recorded in `plans/TECHNICAL_DEBT.md` / `plans/D99-debts.md` (each has a named follow-up; none blocks this change):
  - Merge field parity (intensities, `tds`, variety), and whether merge should stop copying another user's public brewer notes.
  - The `SetupUpdateSchema` default trap.
  - A "My notes" listing and an `amendedAt` column.
  - An author-only "My recipes" listing (the profile stays public-only for its owner).
  - Unguessable URLs for unlisted recipes (slugs stay title-derived).
  - Visibility gating of like, favourite, rate and the photo list for draft/private recipes.
  - Releasing the email or username of deleted accounts (tombstoning on self-deletion, with account-deletion anonymisation), catalog-name uniqueness, and dropping the redundant plain indexes.
  - EXIF/GPS stripping (F23, sharp).
  - A per-user upload rate limit and env-configurable image dimension limits.
  - Full-text search, keyset-on-score paging, current-version-only search scope and a minimum search length.
  - Playwright screenshot tests.
  - Multi-arch images, a TLS compose overlay and a non-root web image.
  - An admin lockout-reset action, more env-tunable rate-limit policies, and a Valkey service in CI for the RESP3 integration test.
  - Pre-infusion/flow-rate form inputs and an `extractionTimeSeconds` upper bound.
  - OpenAPI coverage for admin/auth routes.
  - A top-level error boundary above the providers and safe `localStorage` access.
- Audit findings with no wave-6 owner: account-deletion anonymisation, auth session hygiene (refresh rotation, hashed reset tokens), the equipment 20-item cap and admin list pagination, the `.input` class, photo gallery wiring, cross-recipe comment replies, the moderation UI (F15a), notification spam, multi-instance jobs, observability, web edge security headers and Renovate fixes. They are recorded as D99.20+ by the ROADMAP task.

## Impact

- **API code:**
  - New modules and utilities: `modules/recipe-note`, `modules/health`, `utils/errors.ts`, `utils/lifecycle.ts`, `utils/client-ip`, `utils/rate-limit`, `utils/redis`, `utils/cache/failSoft.ts`, `utils/upload/{sniff,mime,limits,errors}.ts`, `utils/storage/{key,startup}.ts`, `utils/openapi/reference.ts` and `apps/api/scripts/healthcheck.mjs`.
  - Reworked: `recipe` model/service/index (write path, slugs, search, merge, shared visibility conditions, fork masking), `collection`, `auth`, `admin`, `user`, `notification`, `setup`, `brew-log`, `equipment`, `coffee-variety`, `follow`, `comment`, `report`, `contact`, `photo`, `routes/{sitemap,share}.ts`, `middleware/{errorHandler,rateLimit,bodyLimit,cors,crawler}.ts`, `config/env.ts`, `routes/health.ts` (moved to `modules/health`) and `main.ts`.
- **Web code:** `AppProviders`, `router.tsx` (exports `routes`/`createAppRouter`), `*.data.ts` loaders and `routes/resources/*` across 65 pages and components, the hardened `api/client.ts` (`getText`), `useListUrlState`, `useRecipeQrDownload`, `utils/chart/*`, the enforcement and architecture tests, and rebuilt `ScaaRadarChart`, `BrewTimeline`, `StarRating` and `RecipeNotesSection`; noindex rules on non-public pages.
- **Shared and DB code:** `packages/shared` (slug utils, `EmailSchema`, reserved usernames, recipe schemas, health and other output schemas, en/tr i18n keys), `packages/db` (`schema.ts` with the `lower()` helper, the `migrate.ts` runner and its `preflight.ts`, `check-identifiers.ts`, pool timeouts).
- **APIs:**
  - New: `GET`/`PUT`/`DELETE /api/v1/recipes/:id/notes`.
  - Removed: `POST /recipes/:id/notes`.
  - Changed: `PATCH /recipes/:id` (amend semantics, email gate), `POST /recipes` (`tds`, `coffeeVarietyId`, duplicate ids 400), `POST /auth/register` (case-insensitive identifiers, reserved usernames, deleted identifiers stay taken), `POST /photos` (error codes, 413/415), recipe list/search (`versions[]` removed, `search` ≤ 200 and literal, rating sort, 503), `/recipes/starred` scope, fork fields masked, `X-Robots-Tag` on non-public detail responses and share 404s, `POST /brew-logs` accepts unlisted recipes, and `/health` and `/ready` (fixed readiness keys `status`, `db`, `cache`, `rateLimitStore`, `storage`, `shuttingDown`; `503` while shutting down).
  - Status codes: many paths move from 500 to 400/409.
  - Headers: `RateLimit`/`RateLimit-Policy`/`Retry-After` added, and 429 is now possible on `send-verification`, `reset-password` and `verify-email`.
- **DB migrations** (generated with `make db-generate`, never hand-edited, except the `--custom` extension shell), in this order:
  1. The `user_recipe_note` table.
  2. The unique indexes `user_email_lower_unique`, `user_username_lower_unique` and `setup_user_default_unique`.
  3. A custom `enable_pg_trgm` migration.
  4. Three GIN `gin_trgm_ops` indexes.
  `make db-reset` creates `pg_trgm` before `db-push`. The migrate runner pre-flights `pg_trgm` before applying anything.
- **New env vars** (all optional, with defaults):
  - API: `TRUST_PROXY`, `TRUST_PROXY_HOPS`, `TRUST_PROXY_CIDRS`, `RATE_LIMIT_ENABLED`, `RATE_LIMIT_STORE`, `RATE_LIMIT_GLOBAL_MAX`, `CACHE_MEMORY_MAX_ENTRIES`, `DB_STATEMENT_TIMEOUT_MS` and `RUN_MIGRATIONS`.
  - Web image: `API_UPSTREAM`, `PUBLIC_APP_URL`, `TRUSTED_PROXIES` and `EDGE_MAX_BODY_SIZE`.
  - Compose: `IMAGE_TAG`, `API_IMAGE`/`WEB_IMAGE`, `DOCKER_LOG_*`, `*_MEMORY_LIMIT`, `VALKEY_MAXMEMORY`, `BACKUP_INTERVAL_SECONDS`, `BACKUP_RETENTION_DAYS`, `BACKUP_UPLOADS`, `UPLOADS_SOURCE`, `POSTGRES_DATA_SOURCE` and `BACKUPS_SOURCE`.
  - `API_DOMAIN` is no longer required, and `BACKUP_DIR` is gone.
- **Dependencies:** `rate-limiter-flexible@11.5.0` is added (exact pin, zero transitive deps). `apps/web` `vitest` moves to `catalog:`. No slug, upload, chart, URL-state or data-fetching libraries are added. `tsx` moves to runtime deps only if the native type-stripping spike fails.
- **CI and infra:**
  - CI: a single `ci.yml` (`quality` → `test` ∥ `images` → `publish`, plus `doc-drift`), with SHA-pinned actions, concurrency, the image artifact hand-off and `scripts/ci/check-publish-needs.sh`. `pr.yml` and `release.yml` are deleted.
  - Images and compose: Dockerfile and Dockerfile.web hardening with `HEALTHCHECK`s, the Caddyfile edge, a rewritten `compose.production.yml` with health checks, data-source variables and a `restore` service, and the `compose.yml` prod profile removed. New scripts: `scripts/ci/smoke-images.sh`, `scripts/ci/smoke-compose.sh`, `scripts/ci/compose-config-check.sh`, `scripts/ci/compose-smoke.env` and `scripts/ci/web-entrypoint.test.sh`.
  - Makefile: `prod-*` (including `prod-restore`, `prod-backup-export`, `prod-fix-uploads-owner` and `prod-check-identifiers`), `db-check-identifiers` and `docs-check` added; `release` and `images-push` removed.
- **Docs and specs:**
  - `AGENTS.md`, README, `docs/` (the new `deployment_compose.md`, the generated `api-reference.md`, ADR-015..021, the photo storage security check, health-check and storage settings) and `plans/` (ROADMAP, FEATURE_SUGGESTIONS, F-plans, D44).
  - OpenSpec: the `remove-deno-node24-pnpm` archive, three retired spec folders, the `config.yaml` context, and the Purpose backfill.
  - Also: `.github/pull_request_template.md`, `scripts/doc-drift-check.ts` and `scripts/docblock-scan.ts`.
