### t8 — First task of the whole change (run before any other track's tasks)

- [ ] Archive the stale Deno-removal change without applying its deltas: run `openspec archive remove-deno-node24-pnpm --skip-specs -y`, confirm the folder moved to `openspec/changes/archive/<today>-remove-deno-node24-pnpm/`, and confirm `git status openspec/specs` shows no change (its Node 24 / memory-only deltas must never reach the main specs)

### t8 — Code-side remnants and stale comments (no behaviour change)

- [ ] Rewrite stale Deno-era comments: `pnpm-workspace.yaml:5-7` (describe the pnpm catalog only), the `renovate.json` comment block (current managers only), `apps/api/vitest.config.ts:8` (explain serial files for DB count assertions), the Deno mention in `packages/db/src/schema.ts` and in `packages/shared/src/utils/date.ts`, and the sanitizer-options sentence in the docblock at `apps/api/src/modules/auth/model.test.ts:11`
- [ ] In `apps/api/src/utils/openapi/index.ts:27` drop "v1.3.0" from the D34 P3 comment; check with Context7 (`/rhinobase/hono-openapi`) whether the installed 1.x types accept the `z.toJSONSchema` output for `requestBody`; if they do, remove the cast and its `biome-ignore`, otherwise keep both (lint-style "openapi/index.ts as-any cast …")
- [ ] Replace the "D29 or later" reference in the `tasteNoteId` comment at `packages/shared/src/schemas/recipe.ts:149-160` with "D44 (`plans/D44-remove-taste-note-id-phase-2.md`)" (comment only)
- [ ] Change `apps/web/package.json` `"vitest": "^5.1.0"` to `"vitest": "catalog:"` and run `make lockfile-update` (pnpm-workspace "catalog"; coordinate with the dependency/CI owner if it also touches catalog drift)
- [ ] Relabel the `Makefile` `check-web` help text to "Type-check web frontend (tsc)" (pnpm-workspace "Make help text"; t4b rewrites other Makefile targets — whichever lands second rebases)
- [ ] Add `Allow: /equipments` and `Allow: /equipment/` above `Disallow: /equipment` in both the robots generator in `apps/web/vite.config.ts` (~:35-43) and `apps/web/public/robots.txt`, so the public catalog and detail pages stay crawlable while the private `/equipment` page stays disallowed; check the built `apps/web/dist/robots.txt` after `make build-web` (coordinate with t4b, which rewrites the `Sitemap:` line at runtime)

### t8 — Workspace and compose guards

- [ ] Extend `packages/shared/src/workspace.test.ts` (failing first): every catalogued dependency is referenced as `"catalog:"` in every member; `devEngines.runtime.version` shares the `.nvmrc` major; both Dockerfiles use an exact `node:26.<minor>.<patch>-trixie-slim` tag; every `setup-node` step uses `node-version-file: '.nvmrc'`; `packageManager`, `devEngines.packageManager.version`, both Dockerfiles' `npm install -g pnpm@…` and every `pnpm/action-setup` `version:` agree (node-runtime, pnpm-workspace, dependency-management "Renovate and the workspace test …")
- [ ] Extend `packages/shared/src/compose-config.test.ts` (failing first if absent): `app` and `web-dev` mount `node_modules:/app/node_modules` and build `target: deps`; keep the existing remnant, filter, tsx/vite and Caddy-pin assertions (local-dev-environment)
- [ ] Run `make test-shared` and confirm both suites pass on the current tree

### t8 — Recipe comparison truth fixes (failing tests first)

- [ ] Add failing cases to `apps/api/src/modules/recipe/merge.test.ts`: a version whose recipe has `deletedAt` set throws `RECIPE_NOT_FOUND`; another user's `unlisted` recipe can be merged; another user's `private` and `draft` recipes throw `FORBIDDEN`
- [ ] Add failing cases to `apps/api/src/modules/recipe/merge.route.test.ts`: `403 FORBIDDEN` for another user's private source and `404 NOT_FOUND` for a soft-deleted source; add a self-merge rejection case to `packages/shared/src/schemas/recipe.merge.test.ts` if it is missing
- [ ] In `apps/api/src/modules/recipe/service.ts` `mergeRecipes` (~:847-858), treat `v.recipe.deletedAt != null` as missing and replace the local `canAccess` with `canViewRecipe(v.recipe, authorId)` (or the shared visibility helper if t1/t3 extract one — coordinate); keep the existing entry/exit/error logs; make the tests pass
- [ ] Update the merge route's `describeRoute` texts in `apps/api/src/modules/recipe/index.ts` (~:647-680): 403 "Email not verified, source recipe not viewable, or equipment compatibility violation"; 404 "Version not found or recipe deleted" (metadata only; `openapi.coverage.test.ts` stays green)

### t8 — Lint policy restored (fix first, flip last)

- [ ] Measure inside Docker: `docker compose run --rm --no-deps app pnpm exec biome lint --only=suspicious/useAwait --only=suspicious/noEmptyBlockStatements --only=suspicious/noExplicitAny apps packages`; record per-rule counts in the PR description
- [ ] Add `packages/shared/src/lint-policy.test.ts` (Vitest, paths from `import.meta.url`, docblocked helpers): fails with `file:line` for any `biome-ignore-all`/`biome-ignore-start`/`biome-ignore-end` under `apps/*/src` and `packages/*/src`, and for any `biome-ignore` comment without a `<category>/<group>/<rule>` path or with an empty or `<explanation>` justification
- [ ] Fix `useAwait` violations (drop `async` or await the promise) in per-workspace commits
- [ ] Fix `noEmptyBlockStatements` violations: user-facing catches call `toast.error(t('…'))` (new strings added to BOTH `packages/shared/src/i18n/en.json` and `tr.json`), service catches log `log.error({ err, …ids }, '<fn> failed')`, genuine fire-and-forget catches get an explanatory comment inside the block
- [ ] Fix production `noExplicitAny` diagnostics with typed fixes, or justified line-level `biome-ignore` comments at true library boundaries
- [ ] Final commit of the group: set `linter.rules.suspicious.noExplicitAny`, `useAwait` and `noEmptyBlockStatements` to `"error"` in `biome.json` (coordinate with the CI owner's `biome.json`/warnings changes); `make lint` exits 0

### t8 — Docblock scanner

- [ ] Port `openspec/changes/archive/2026-07-27-wave-5-debt-clearance/audit/docblock-scan.ts` to `scripts/docblock-scan.ts` (`node:fs/promises`, erasable syntax only, runnable with plain `node`; same export forms and scope; `--check` exits 1 listing `file:line symbol`; `--json` for tests)
- [ ] Add docblock fixtures under `packages/shared/src/__fixtures__/docblock/` and cases in `packages/shared/src/doc-drift.test.ts` (documented export passes; `export const`, `export default X`, local `export { X }` without `/** */` fail; `//` comments do not count)
- [ ] Run `node scripts/docblock-scan.ts --check`; backfill house-style `/** */` docblocks on exports added since wave 5 (brew-log, notification, search, merge, diff and any other flagged files) in docblock-only commits; `make check` and the test suites stay unchanged
- [ ] Add a "Documentation comments" section to `docs/architecture.md` with the five house-style conventions and the bulk-category one-liners from the wave-5 inventory (code-documentation "Docblocks follow the captured house style")

### t8 — Doc-drift guard

- [ ] Create fixture trees under `packages/shared/src/__fixtures__/doc-drift/` (`pass`, `fail-token`, `fail-allowlist-reason`, `fail-allowlist-stale`, `fail-archived-capability`, `fail-purpose`, `fail-link`, `fail-code-remnant`) and `packages/shared/src/doc-drift.test.ts`, which spawns `node scripts/doc-drift-check.ts --root <fixture> --json` with `node:child_process` and asserts exit codes and reported `file:line` entries, plus one run against the repository root (fails until the script exists)
- [ ] Implement `scripts/doc-drift-check.ts` (plain `node`, `node:` built-ins): documentation scope and token pattern `(?<![A-Za-z])deno(?:kv|land)?(?![A-Za-z])|jsr:` (case-insensitive) per the doc-drift-check spec; code-remnant scan over the node-runtime path list; allowlist loader rejecting empty reasons and globs that match nothing; archived-capability check with `retiredCapabilities`; "Purpose: TBD" check; relative-link check (skip URLs with a scheme, `mailto:` and pure `#anchors`); exclude `**/__fixtures__/**` and `openspec/changes/**` from the repository scan; `--root`, `--json`; output `file:line: rule: detail`; exit 1 on any finding
- [ ] Create `scripts/doc-drift-allowlist.json` with the initial entries and reasons from the spec and `retiredCapabilities` = `deno-runtime`, `deno-workspace-management`, `remote-cache` → `wave-6-audit-remediation`
- [ ] Add root `package.json` script `docs:check` (`node scripts/doc-drift-check.ts && node scripts/docblock-scan.ts --check`) and append it to the root `ci` script; add `make docs-check` (`docker compose run --rm --no-deps app pnpm run docs:check`, with a `##` help line) and add it to `make ci`
- [ ] Add `.github/pull_request_template.md` with Summary and Testing sections and the "Docs & specs" checklist from the doc-drift-check spec
- [ ] Run `node scripts/doc-drift-check.ts` locally and keep its findings list as the to-do list for the doc tasks below (expected to pass only after the final archive group)

### t8 — Generated API reference

- [ ] Export the `openAPIRouteHandler` documentation options from `apps/api/src/routes/openapi.ts` as `openApiDocumentation` (no runtime change; coordinate with tracks adding tags — t2, t4a, OpenAPI owner) and confirm `routes/openapi.test.ts` and `openapi.coverage.test.ts` still pass
- [ ] Add `apps/api/src/utils/openapi/reference.ts` (pure function: OpenAPI document → Markdown, one section per tag, rows with method, path, summary, auth marker from `security`, parameters, documented response codes, deterministic ordering, docblocked) and `reference.test.ts` covering grouping, ordering, auth marker and parameter rendering
- [ ] Add `apps/api/scripts/generate-api-reference.ts` (sets test-safe env before a dynamic import like `openapi.coverage.test.ts`, builds the route tree from `routes/index.ts`, registers OpenAPI, requests `/api/v1/openapi.json`, writes `docs/api-reference.md` with a "Generated — do not edit" banner, warns about mounted routes missing from the spec; `createLogger('api-reference')` entry/exit debug logs, no PII) and the `docs:api` script in `apps/api/package.json`
- [ ] Generate and commit `docs/api-reference.md`; confirm it lists brew logs, collections, notifications, `POST /api/v1/recipes/merge`, the version diff route, the sitemap and the cursor and advanced-search parameters
- [ ] Add a step to the `quality` job of `.github/workflows/ci.yml`: `pnpm --filter @brewform/api run docs:api && git diff --exit-code docs/api-reference.md` (coordinate with t4b's `ci.yml` rewrite)
- [ ] Rewrite `docs/api.md` as conventions only: base URL and versioning; success/error envelope; error codes (including the 409 conflict mapping from the error-handling track, 413, 429, and t7's `503 QUERY_TIMEOUT` if adopted); authentication; offset and cursor pagination (`cursor`, `includeTotal`); advanced-search parameters (`author`, `dateFrom`/`dateTo`, `minRating`/`maxRating`, `search` max length, `sortBy=rating` per t7); t2's rate-limit contract (body, `Retry-After`, `RateLimit-*`); t4a's photo upload limits; deprecations (`tasteNoteId` + `Deprecation` header → D44); delete the endpoint tables, the removed `grinder` row (`:235`), the broken d28 link (`:234`) and the pre-F05 `emailNewFollowers` example (`:468`); link `docs/api-reference.md` and `/api/v1/docs`

### t8 — AGENTS.md (final consolidation pass after the code tracks)

- [ ] Development commands: `make up` service list as shipped (devex/t4b outcome); granular targets add `make test-web`, `make check-tests`, `make test-coverage`, `make docs-check`; `make test-db-provision` mirrors `.github/workflows/ci.yml` (not `pr.yml`); state truthfully whether the pre-commit hook needs host pnpm (devex outcome)
- [ ] Architecture: Vite proxies `/api/*` to `VITE_API_PROXY_TARGET` (compose sets `http://app:8000`, default `http://localhost:8000`) — remove "host networking auto-detected"
- [ ] API module pattern: middleware line updated with t4a's `bodyLimit` (1 MB global, photo cap on `/api/v1/photos`) and t2's trusted-proxy client identity / separate rate-limit store; cache DI rule worded per the cache owner (t2/t3)
- [ ] OpenAPI section: replace "hono-openapi v1.3.0" with "the installed hono-openapi 1.x" while keeping the `jsonRequestBody` rule; state the coverage test's real scope (auth, recipes and admin excluded until covered); add "regenerate `docs/api-reference.md` with `pnpm --filter @brewform/api run docs:api`"
- [ ] Database rules: replace the first bullet with t7's wording (Drizzle builders, `ilike` accepted, `sql` fragments only per the lint-style registry with a `// D03 raw-SQL exception:` comment, ADR-approved extensions such as `pg_trgm` through `drizzle-kit generate --custom`, bounded reads); soft-delete bullet → "filter with `isNull(t.deletedAt)`, e.g. `and(eq(t.id, id), isNull(t.deletedAt))`" and drop `findUnique`; seed bullet per the seed owner's demo-data gating; `db-reset` per the devex outcome
- [ ] Testing: Vitest imports, `import '../../test-setup.ts'` first in API DB tests, serial DB files (`fileParallelism: false`), logger assertions with `vi.spyOn(log, '<level>')`
- [ ] Code style: replace "Lint exclusions" with the Biome policy (recommended preset; `noExplicitAny`/`useAwait`/`noEmptyBlockStatements` are errors; web a11y/hook-deps overrides; the CI owner's warnings policy); suppressions are line-level `// biome-ignore <category>/<group>/<rule>: <justification>` with no file-level or range form (enforced by `lint-policy.test.ts`); every exported production symbol has a docblock (enforced by `scripts/docblock-scan.ts`)
- [ ] Add an i18n rule: every user-visible string goes through `t()`; flat keys are added to BOTH `en.json` and `tr.json` (deterministic parity test)
- [ ] Logging: delete the `TODO_logs.md` pointer (`:162`); add "rate-limit keys and request logs never contain raw IPs or emails" (t2)
- [ ] Insert t5's "Web data loading" section (loaders/actions/fetchers, `request.signal`, URL-state rules, `useEffect` allowlist)
- [ ] Add a "Docs & specs" section: `make docs-check` and the PR template checklist; OpenSpec rules (first line of every requirement contains SHALL/MUST; use RENAMED to change a title; never ship an all-REMOVED delta — delete the folder and add it to `retiredCapabilities`; replace the TBD Purpose after archiving; `openspec validate <change> --strict`); historical docs live in `docs/history/`; ADR numbering in `docs/decisions.md`
- [ ] Other conventions: deployment docs are `docs/deployment_compose.md` (compose) and `docs/deployment_coolify.md` (Coolify); images publish from the CI-gated `publish` job in `ci.yml` (no `release.yml`, no `make release`); cache: in-memory default, `CACHE_DRIVER=redis` + `REDIS_URL` (Valkey 9.1 in the compose files), `CACHE_ENABLED=false` → `NullCacheProvider`, rate-limit state independent of the cache (t2)

### t8 — README.md

- [ ] Features: add brew journal (F02), collections (F01), in-app notifications and @mentions (F05/F04), version diff and recipe comparison/merge (F09/F08), advanced search (F11), sitemap and social previews; reword "Admin Dashboard" to what ships (users, bans, audit log, dashboard stats; moderation queue and analytics charts are API-only until F15/F17 UI ships)
- [ ] Tech stack table: Node 26 LTS (tsx in development), Biome, Vitest + Testing Library, PostgreSQL 18, cache "in-memory default or Redis-protocol via `CACHE_DRIVER=redis` (Valkey 9.1 in compose), `CACHE_ENABLED`", CI/CD "GitHub Actions → GHCR (CI-gated publish)"
- [ ] Quick start: real clone URL (`https://github.com/Ardakilic/BrewForm.git`); admin credentials and the seed's demo accounts described per the seed owner's outcome (development only); `make test-db-provision` before DB-backed tests
- [ ] Development and Database blocks: `check-web` is a type-check; add `make test-web`, `make test-specific filter=…`, `make test-db-provision`, `make docs-check`; `db-push` = "prototyping only — use `db-generate` + `db-migrate` for schema changes" (matches AGENTS.md); `db-reset` and seed-count descriptions verified against the Makefile and `packages/db/src/seed*.ts`
- [ ] Services table: add Valkey (dev compose) and align with t4b's compose changes; add a "Self-hosting" section linking `docs/deployment_compose.md`, `docs/deployment_coolify.md` and `make prod-*`
- [ ] API section: link `docs/api.md`, `docs/api-reference.md` and the Scalar UI `/api/v1/docs`; drop "100+ endpoints"
- [ ] Documentation table: add `api-reference.md`, `comments.md`, `logging.md`, `seo.md`, `deployment_compose.md`; move `deployment.md` to a "History" row per t4b's decision; fix the `:252` link to the superseded guide

### t8 — docs/

- [ ] `docs/architecture.md`: suppression wording at `:60-61`; cache section `:76-101` per the cache-driver spec (bounded memory, namespacing, degradation) and `c.get('cache')` per the DI decision; replace "Portability Rules (§6.2)" `:115-130` with the AGENTS.md database rules (drop the multi-database claim); schema overview `:136-144` → 32 tables and 15 enums including collections, collection items, brew logs and notifications; soft deletes `:146-150` → `isNull`; middleware stack `:179-186` → the full order from AGENTS.md with t2's rate-limit identity; OpenAPI `:195-226` → all mounted groups incl. brew-logs, collections, notifications, the real coverage scope, the generated reference; notifications `:223-233` → in-app + email; Background Jobs → per-replica note (node-runtime); Testing → Vitest conventions, `make test-web`, `make test-db-provision`; "Lint exclusions" `:303-306` → Biome policy; add t5's web data-flow section
- [ ] `docs/request-lifecycle.md`: middleware table `:54-60` → cors, requestId, secureHeaders, rateLimit, bodyLimit, cache injector, crawler, `onError`, `/uploads`, routes, with t2's client-identity text (`:17`, `:58`); side-effect path covers the in-app notification record and the email; background jobs per-replica note
- [ ] `docs/notifications.md`: retitle "Notifications"; categories table with in-app + email channels, the flat `notify*` flags (`notifyNewFollower`, `notifyRecipeLiked`, `notifyRecipeCommented`, `notifyFollowedUserPosted`, `notifyMentionedInComment`), one flag gating both the record and the email, @mention rules (F04), the `notifications` table and bell/list UI (F05), `APP_ENV=test` suppression, and "adding a notification type" (enum, both channels, preference, en+tr i18n, tests) — verify against `apps/api/src/modules/notification/` and `apps/api/src/utils/notify/`
- [ ] `docs/decisions.md`: add an ADR index table; ADR-001 link → `openspec/changes/archive/<date>-remove-deno-node24-pnpm/` and the exact `node:26.13.0-trixie-slim` tag; ADR-006 marked "Superseded by ADR-015 and ADR-016"; ADR-013 marked "Superseded by ADR-020"; add ADR-015 (cache driver + `CACHE_ENABLED`, valkey), ADR-016 (rate-limit store and client identity), ADR-017 (pg_trgm search ranking), ADR-018 (web data loading), ADR-019 (server-generated upload keys), ADR-020 (JSDoc on every exported symbol, `scripts/docblock-scan.ts`), ADR-021 (generated API reference), taking content from the owning tracks' designs; refresh ADR-012's hono-openapi version note
- [ ] `docs/seo.md`: replace `https://brewform.app` (`:47`, `:63`) with `${VITE_PUBLIC_APP_URL}`; document the sitemap (`/api/v1/sitemap.xml` and the robots `Sitemap:` line), the new robots `Allow` lines, and the share/OG topology after t4b's edge routing
- [ ] `docs/logging.md`: the AGENTS.md rules (entry/exit debug logs in services, mount/unmount in pages, never passwords, tokens, emails or IPs, `err` on error logs), request id propagation (`X-Request-ID`), `LOG_LEVEL=silent` in tests, t2's hashed rate-limit keys; no `TODO_logs.md` reference
- [ ] `docs/auth.md`: `:52` registration-disabled logging without the raw IP (t2), login limits per IP and per account (t2), and the email-verification gate on fork/PATCH (t1 W11)
- [ ] `docs/recipes.md`: `:26` `bumpVersion: false` semantics as implemented by t1, personal-notes ownership (t1 recipe-personal-notes), slug behaviour (recipe-slug owner), links to merge and version diff
- [ ] Spot-check `docs/comments.md`, `docs/coffee-data.md`, `docs/coffee-equipments.md` and `docs/taste-notes.md` against code (paths, counts, behaviour) and fix any stale statement
- [ ] `git mv docs/requirements-audit-report.md docs/history/2026-05-03-requirements-audit-report.md`, add a "Historical snapshot (2026-05-03), superseded — do not use as a work list" banner, and fix inbound links
- [ ] Add `docs/README.md` indexing current docs and `docs/history/`, linked from the README documentation table
- [ ] Verify t4b's `docs/deployment_coolify.md` / `docs/deployment_compose.md` / `coolify_deployment_plan.md` edits satisfy the deployment-guide requirements (Node 26 + pin pointers, frozen pnpm install, entrypoint start command, drizzle-kit via `@brewform/db` scripts, per-replica jobs note, prerequisites table) and pass `node scripts/doc-drift-check.ts`; raise gaps with t4b

### t8 — Root stale files

- [ ] Re-check each open item in `TODO_logs.md` against code after the logging/API tracks land; move the still-open ones into `plans/D99-debts.md` as D99.20+ entries, then `git rm TODO_logs.md`
- [ ] Note in the PR description that `pr_description.md` is git-ignored and untracked (`.gitignore:49`), so no repository change is needed

### t8 — plans/

- [ ] `plans/ROADMAP.md`: replace "All ledgered debt … resolved" with a "Wave 6 — 2026-11-18 audit remediation" entry (link `plans/AUDIT-2026-11-18.md` and the archived change), add D44 and any D99.20+ deferrals to Remaining Debt, add a "Platform changes" history line (#135 Node 26/pnpm, #166 production compose + redis driver + `CACHE_ENABLED`, #168 valkey, wave 6), reconcile the F01/F11 ship dates with their merge commits, drop F24 from "quick wins", and record F03/F20/F25/F26/F28 as unblocked by F02
- [ ] `plans/FEATURE_SUGGESTIONS.md`: replace the Priority Matrix (`:236-256`) with a link to ROADMAP; rewrite the 34 `](plans/F…md)` links as `](F…md)`; update the header counts (21 API modules, 32 tables) and the "Notifications are email-only" line (`:116`); remove its Deno mention
- [ ] `plans/F23-image-optimisation.md`: replace the "Deno/WASM codec" blocker with a sharp-based design (Node-API v9, Node ≥ 20.9, prebuilt glibc ≥ 2.28 binaries for the trixie images, no install script so no `allowBuilds` entry; server-side WebP/AVIF + responsive sizes, ADR-009 client thumbnails kept as fallback; t4a's sniffing remains the type check) and update its status in ROADMAP
- [ ] `plans/F29-weekly-email-digest.md`, `plans/F30-bean-freshness-tracking.md`, `plans/F16-badge-expansion.md`: replace `Deno.cron` with `node-cron` (`cron.schedule(expr, fn, { name })` in `apps/api/src/utils/jobs/cron.ts`), `deno task email-build` with `pnpm run email-build`, and add the per-replica caveat with the `SET NX PX` lock option when `CACHE_DRIVER=redis`
- [ ] `plans/F07-batch-calculator.md`, `plans/F17-admin-analytics.md`, `plans/F27-equipment-reviews.md`: replace Deno test notes and commands with Vitest / pnpm equivalents; re-scope F17 to "UI over the existing `/admin/analytics/*` endpoints first" using t6's chart primitive
- [ ] `plans/F24-version-snapshots.md`: cut the diff/`computeVersionDiff` scope (shipped as F09) and keep only the immutability guards
- [ ] `plans/F03-user-profile-stats.md`, `plans/F20-brew-logger-integration.md`, `plans/F25-pwa-offline.md`, `plans/F26-activity-feed.md`, `plans/F28-guided-brew-mode.md`: replace the "blocked by F02" banners with refresh notes pointing at `brewLogs` (`packages/db/src/schema.ts`), `/api/v1/brew-logs` and the existing `getUserBrewStats` / `/stats/recipe/:recipeId`
- [ ] `plans/F31-recipe-embed-widgets.md`: note the global `xFrameOptions: 'DENY'` / `frameAncestors: ['none']` (`apps/api/src/main.ts:49-74`) and require an explicit per-route override for the embed route; `plans/F15-admin-moderation.md`: split into F15a (Report button/dialog + admin reports page) and F15b (auto-flagging)
- [ ] `plans/TECHNICAL_DEBT.md:256`: "D28 phase 1 (deprecation headers) resolved 2026-06-22; phase 2 removal tracked as D44"; create `plans/D44-remove-taste-note-id-phase-2.md` (problem, telemetry/sunset criterion, removal steps for schema field, deprecation branch and docs row); update `plans/D99-debts.md` status line if D99.20+ entries are added

### t8 — OpenSpec hygiene

- [ ] Add a `context:` block to `openspec/config.yaml` (stack: Node 26, pnpm 12 workspaces, Hono, Drizzle/postgres-js, React 19 + react-router data router, Vite, Tailwind 4, base-ui, Vitest, Biome; key AGENTS.md rules; the first-line SHALL/MUST quirk; the no all-REMOVED-delta rule)
- [ ] Coordinate ownership of `openspec/specs/text-sanitization/spec.md` (unowned; `jsr:` imports and sanitizer options in two requirements); if assigned to t8, add `specs/text-sanitization/spec.md` with the MODIFIED deltas drafted in `audit/t8-docs-specs.md` §6 before the archive group

### t8 — Archive and guard (last group of the whole change, after every track's tasks)

- [ ] `git rm -r openspec/specs/deno-runtime openspec/specs/deno-workspace-management openspec/specs/remote-cache` (retired capabilities; replaced by `node-runtime`, `pnpm-workspace`, `cache-driver`)
- [ ] Run `openspec validate wave-6-audit-remediation --strict`, then `openspec archive wave-6-audit-remediation -y`, and confirm "Specs updated successfully"
- [ ] Replace every "Purpose: TBD - created by archiving change …" in `openspec/specs/*/spec.md` (44 after the wave-6 archive per the sandbox run: 29 pre-existing plus the capabilities wave 6 creates) with a 2-4 sentence purpose, and rewrite the Deno-era Purpose text of `lint-style`, `local-dev-environment` and `deployment-guide`; ask t4b to rephrase the "Deno KV no longer…" remark at `container-deployment` (~:294) if it survives
- [ ] Run `node scripts/doc-drift-check.ts` and fix every remaining finding until it exits 0
- [ ] Add the `doc-drift` job to `.github/workflows/ci.yml` (no `needs:`, checkout, `setup-node` with `node-version-file: '.nvmrc'`, `node scripts/doc-drift-check.ts`, `node scripts/docblock-scan.ts --check`, no dependency install) and list it in the `publish` job's `needs:` (coordinate with t4b)
- [ ] Run `openspec validate --all --strict` and confirm every spec passes

### t8 — Verification

- [ ] Run `make check`, `make lint`, `make test-shared`, `make test-api`, `make test-web`, `make docs-check`, then `make fmt` and confirm `make fmt-check` is clean; confirm `pnpm --filter @brewform/api run docs:api` leaves no diff; read AGENTS.md and README.md once more against the Makefile, root `package.json`, `biome.json` and `ci.yml`
