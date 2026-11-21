# t4b: Production compose, env config and CI image pipeline (research and validation)

Track owner of specs: `container-deployment` (modified), `ci-image-publishing` (modified),
`api-env-config` (new), `production-operations` (new).

Audit inputs: `plans/AUDIT-2026-11-18.md` §3.5 and §7, plus the raw findings
`api-architecture/prod-compose-empty-s3-env-boot-failure`, `security/prod-uploads-outside-volume`,
`devex-infra-ci/release-ungated-no-pr-image-build`, `devex-infra-ci/prod-compose-api-unreachable`,
`devex-infra-ci/migrations-build-generate-boot-race`, `devex-infra-ci/runtime-image-hardening`,
`devex-infra-ci/dockerignore-root-anchored-local-release`, `devex-infra-ci/ci-duplicated-pipelines`,
`devex-infra-ci/prod-ops-backups-healthchecks` and `devex-infra-ci/divergent-prod-definitions`.

## 1. User decisions (verbatim)

- Compose loses photos and won't boot: "This should be validated and fixed."
- Images published to `:latest` without waiting for CI, never built on PRs: "what does it mean
  that images are never built on prs ? do you mean image testing? do it sequentially yes."
- Compose doesn't route to the API, no backups or healthchecks: "Fix this as well indeed."

## 2. Plain-language answer: what "images are never built on PRs" means

Yes, it is about testing the images. Today a pull request runs type-checks, lint and the test
suites, but **nobody runs `docker build`** on `Dockerfile` or `Dockerfile.web`, and nobody starts the
resulting containers. So a broken Dockerfile, a missing file in the image (for example the seed's
`files/scaa-2.json`) or a crashing `docker-entrypoint.sh` is only discovered **after merge**, when
`release.yml` builds the images on `main`.

Second problem: on `main`, `release.yml` and the CI workflow start **at the same time** and do not
wait for each other. `release.yml` is faster, so it pushes `:latest` before the tests have finished,
and it pushes even if they then fail. Evidence from `gh run list --branch main --event push`: for
#168 both started at 2026-11-11T20:06:55Z; "Release (Build & Push Images)" finished in 1m29s, "CI &
Deploy" in 3m40s.

"Do it sequentially" therefore becomes:

1. On every PR: build both images (no push) and boot them together against a throwaway Postgres;
   fail the PR if the API never becomes ready or the web container cannot serve and proxy.
2. On `main` and `v*` tags: the same build and smoke test, then a `publish` job that `needs:` every
   quality, test and image job. If anything fails, nothing is pushed and `:latest` stays on the last
   good commit.

## 3. Claim validation

| # | Claim | Verdict | Evidence |
|---|-------|---------|----------|
| C1 | Empty `S3_*` strings from compose crash the API | **Confirmed** | `compose.production.yml:107,112` inject `S3_ENDPOINT: ${S3_ENDPOINT:-}` / `S3_PUBLIC_URL: ${S3_PUBLIC_URL:-}` (empty strings); `apps/api/src/config/env.ts:64,69` declare `z.url().optional()`; `env.ts:115-121` throws on any failure. Reproduced with the repo's zod 4.4.3: `{S3_ENDPOINT:''}` fails with `invalid_format`. |
| C1b | (new) Other blank values are silently wrong | **Confirmed** | Same repro: `APP_PORT=''` coerces to `0`, `UPLOAD_MAX_SIZE_BYTES=''` to `0` (every upload rejected), `CACHE_ENABLED=''` fails the enum. A whole-object preprocess that drops blank strings fixes all of them (repro: all-blank input parses to the defaults). |
| C2 | Uploads land outside the `/app/uploads` volume | **Confirmed** | `docker-entrypoint.sh:32` runs `pnpm --filter @brewform/api exec tsx src/main.ts`; the relative `src/main.ts` only resolves because pnpm runs the command in the package directory (`/app/apps/api`; the comment at `:12-14` says the same). `compose.production.yml:113` sets `UPLOAD_DIR=./uploads`; `utils/storage/local.ts:14,32` and `main.ts:91` resolve it against cwd, giving `/app/apps/api/uploads`, while the volume is at `/app/uploads` (`:117`). The working tree shows the same cwd split: 288 files in `./uploads`, 176 in `apps/api/uploads`. Photos sit in the container's writable layer and disappear on every recreate. |
| C3 | Nothing routes browser traffic to the API in `compose.production.yml` | **Confirmed for plain compose** | api has only `expose: 8000` (`:114-115`); web points the SPA at `https://${API_DOMAIN}/api/v1` (`:127`); `apps/web/Caddyfile:1-14` has no `reverse_proxy`. Default local storage returns root-relative `/uploads/<file>` (`utils/upload/index.ts:74-77`), which the web host answers with `index.html`. Coolify is **not** affected (separate API domain with its own Traefik route). Side finding: `robots.txt` advertises `${VITE_PUBLIC_APP_URL}/api/v1/sitemap.xml` on the web origin, which today returns `index.html` in every topology. |
| C4 | Release publishes `:latest` without waiting for CI | **Confirmed** (medium) | `.github/workflows/release.yml:3-6` (`push` to `main` and tags, no `needs`/`workflow_run`), `:35,:66` always tag `latest`. Timing evidence above. Mitigation that keeps it at medium: `main` only changes through PRs that already passed CI, so only semantic merge breakage and tag pushes slip through. |
| C5 | Images never built on PRs | **Confirmed** | No `docker build` / `build-push-action` in `ci.yml` or `pr.yml`. |
| C6 | `ci.yml` and `pr.yml` both run on every PR | **Confirmed** | Both `on: pull_request: branches: [main]`; `gh run list` shows "CI & Deploy" (~4.5–5 min) and "PR Checks" (~2–2.6 min) for each PR (for example the vite 8.3.8 and postgres 4.1.1 Renovate PRs on 2026-11-16). `pr.yml:26-27` runs `db:generate` without `git diff --exit-code`; `ci.yml` has no top-level `permissions`; no workflow has `concurrency`; `dawidd6/action-download-artifact@v28` is tag-pinned in a job with `pull-requests: write` (`ci.yml:51-54,119`). `ci.yml:1` is named "CI & Deploy" but deploys nothing (`:269-270`). |
| C7 | No backups, api/web healthchecks, log rotation or limits | **Confirmed** | `compose.production.yml:43-130`: only postgres and valkey have healthchecks; web uses `service_started` (`:122-124`); no `logging:` or `deploy.resources`; no backup service or restore doc (Coolify guide only says "Coolify Database → Backups", `docs/deployment_coolify.md:346`). |
| C8 | Two competing production definitions | **Confirmed** | `compose.yml:214-246` `app-prod`/`web-prod` read only `env_file: .env`; `.env.example` has no `DATABASE_URL`/`JWT_SECRET` (required by `env.ts:17,27`), so the API exits; no uploads volume; the web-prod comment says "No runtime env", which `docker-web-entrypoint.sh:18-34` contradicts. `Makefile:238-245` `prod-*` targets use this broken profile; nothing wraps `compose.production.yml`. |
| C9 | Runtime image runs as root, no HEALTHCHECK, no curl/wget, full tree, pnpm as PID 1 | **Confirmed** | `Dockerfile:48-57` (no `USER`, no `HEALTHCHECK`, `COPY --from=builder /app /app` copies `apps/web`, devDependencies, `plans/`, `openspec/`); `docker-entrypoint.sh:32` makes pnpm PID 1, which spawns tsx, which spawns node. Extra: Coolify's dashboard HTTP health check **runs inside the container and needs curl or wget** (Coolify docs), yet `docs/deployment_coolify.md:147` tells operators to configure a `/health` check on an image that has neither. Either that check is not actually enabled on brewform.cc, or the container shows as unhealthy; verify on the server. |
| C10 | `.dockerignore` patterns are root-anchored | **Confirmed** | `.dockerignore:1-4`; Docker matches patterns relative to the context root, so `apps/*/node_modules` and `apps/*/coverage` are sent; `uploads/`, `.opencode/`, `.kiro/`, `.claude/`, `plans/`, `openspec/` are not excluded. `Makefile:227-236,247` `make release` pushes these local images to `:latest`. |
| C11 | Image build generates migrations, boot migrations race between replicas | **Partially confirmed** | `Dockerfile:35` runs `drizzle-kit generate`. All 33 migration files are committed and CI enforces freshness (`ci.yml:28-31`), so today the step is a no-op, but with an ungated release a drifted schema would bake an uncommitted migration into the image. The race needs two containers migrating at once (more than one replica, or a Coolify rolling update overlap). Postgres DDL is transactional, so the loser fails and restarts rather than corrupting data; the bigger real risk is a destructive migration running while the old release still serves (expand/contract needed). |

### Additional findings from this validation

- **Project-name collision.** `compose.yml` and `compose.production.yml` live in the same directory
  and declare no `name:`, so both default to the directory name. Running both from one checkout
  shares the `postgres` and `valkey` containers and the `postgres_data` / `valkey_data` volumes
  (the prod Postgres would start on the dev volume, initialised with the dev password).
- **`.env.production` and `backups/` are not gitignored** (`git check-ignore` reports nothing;
  `.gitignore` only covers `.env`, `.env.local`, `.env.*.local`).
- **Cache-scope collision.** `release.yml` uses `cache-from/to: type=gha` without `scope` in both
  the `api` and `web` jobs; the two builds overwrite each other's cache index on every run.
- **Tag pushes move `:latest`.** Tagging an older commit would roll `latest` back.
- **Hard-coded image namespace.** Tags are hard-coded to `ghcr.io/ardakilic/...`, so the existing
  spec's claim that a fork "pushes to the fork's GHCR namespace" is false (the push would fail).
- **Native TypeScript is viable for the runtime.** The root `tsconfig.json` already enforces
  `erasableSyntaxOnly`, `verbatimModuleSyntax` and `rewriteRelativeImportExtensions`. Locally, Node
  26.13.1 loaded `@brewform/shared/schemas` (through the workspace symlink) and
  `apps/api/src/config/env.ts` with no loader. A full graph load could not be checked locally
  because the host `node_modules` are stale (Deno era). Workspace packages must stay symlinked
  (resolved outside `node_modules`), because Node refuses to strip types under `node_modules`. That
  rules out `pnpm deploy` (which copies workspace packages into `node_modules`) for the native
  route.
- **The seed reads `files/scaa-2.json`** (`packages/db/src/seed.ts:1166`, resolved relative to the
  module), so a slimmed runner must keep `/app/files`.
- **Spec drift.** `openspec/specs/container-deployment` still describes `denoland/deno` images,
  `deno run` entrypoints, `--unstable-kv`, `denokv` and a Deno KV log line;
  `openspec/specs/ci-image-publishing` still describes the Coolify webhook `deploy` job removed in
  df9ccd5 and setup/login actions at `@v3`.
- **Docs drift.** `docs/deployment_coolify.md` §5 still mentions a `redis` service (now `valkey`),
  §12 documents the removed webhook job, §13 says "release.yml rebuilds/pushes". `AGENTS.md`
  ("Images publish to GHCR via `.github/workflows/release.yml`") will also go stale with this change.
- **`main` has no branch protection** (`gh api .../branches/main/protection` returns 404), so
  renaming or merging workflows breaks no required-check configuration. Enabling protection that
  requires the new `CI` jobs is recommended (open question).

## 4. Options evaluated

### 4.1 Routing browser traffic to the API in compose

| Option | Pros | Cons |
|---|---|---|
| **A. Web Caddy as the single edge** (reverse-proxy `/api/*`, `/uploads/*`, `/share/*` to `api:8000`; `VITE_API_URL=/api/v1`) | One public port and one origin, so no CORS preflights; `/uploads` and `/share` work on the web domain; reuses the existing Caddy; opt-in through `API_UPSTREAM`, so Coolify's split-domain setup is unchanged | The web image gains proxy duties; needs a client-IP contract with the rate limiter |
| B. Separate edge service (Caddy/Traefik) in compose | Clean separation, could also terminate TLS | Another image and config to maintain; duplicates what the web Caddy already is; TLS on 80/443 conflicts with operators who already have a proxy |
| C. Coolify-managed domains / path routing | Native in Coolify | Not available to plain-compose self-hosters; Coolify path routing needs strip-prefix tuning |
| D. Publish the API port and require `API_DOMAIN` routing | Smallest compose diff | Pushes the routing problem onto every operator; two origins plus CORS |

**Chosen: A**, opt-in per container, enabled by `compose.production.yml`. Automatic TLS inside the
web Caddy (setting a site address and publishing 443) is left as a follow-up, because publishing
443 by default breaks hosts that already run a proxy on 443.

### 4.2 Gating publication on CI

| Option | Pros | Cons |
|---|---|---|
| `workflow_run` trigger on `release.yml` | Keeps files separate | Runs the default branch's copy of `release.yml`, not the commit's; must check out `head_sha` manually; tag detection through `head_branch` is awkward; a second status to follow |
| **`publish` job inside `ci.yml` with `needs:`** | Same run and same SHA; one status; simple `if: github.event_name == 'push'` | `ci.yml` grows; needs per-job permissions (done anyway) |

**Chosen: merge into `ci.yml`.** `pr.yml` is deleted at the same time (deduplication).

### 4.3 Running migrations safely

| Option | Pros | Cons |
|---|---|---|
| Keep migrate-on-boot only | No change | Races with overlapping containers; API health includes migration time |
| Advisory lock around the migrator | Safe with N replicas | Needs raw `pg_advisory_lock` SQL (against the "Drizzle only" rule); more code |
| **One-shot `migrate` service in compose plus single-replica rule** | Built-in Compose ordering (`service_completed_successfully`); no raw SQL; failure is visible and blocks the new API | Coolify Docker Image resources keep migrate-on-boot (still single replica); expand/contract must be documented |

**Chosen: one-shot service for compose**; the entrypoint keeps migrate-on-boot by default
(`RUN_MIGRATIONS`) so Coolify behaves as today.

### 4.4 Backups

| Option | Pros | Cons |
|---|---|---|
| **Inline sidecar on the same `postgres:18-trixie` image** (`pg_dump -Fc` loop plus `tar` of uploads) | No third-party image; `pg_dump` matches the server; works from the compose file alone | Simple interval loop, not cron; files land on the same host (doc must push off-host copies) |
| Third-party image (for example `postgres-backup-local`) | Cron schedules, daily/weekly/monthly rotation | Supply-chain trust; version pinning; less transparent |
| Runbook only | Zero moving parts | Nobody runs it; no visibility |

**Chosen: inline sidecar plus runbook** (restore drill required).

### 4.5 Slimming the API image

| Option | Pros | Cons |
|---|---|---|
| **Workspace layout kept, `pnpm install --prod` pruning, native type stripping, drizzle-orm migrator script** | No tsx or drizzle-kit at runtime; one node process; small diff | Needs a spike to confirm the whole module graph loads natively |
| `pnpm deploy --prod` plus tsx moved to dependencies | Canonical pnpm Docker pattern | Workspace packages are copied into `node_modules`, so native stripping is impossible and tsx must stay at runtime; deploy-lockfile edge cases |

**Chosen: first option, with `node --import tsx` as the documented fallback.**

## 5. Cross-track coordination

- **t2 rate limiting** (`api-rate-limiting`): the edge sends exactly one `X-Forwarded-For` entry plus
  `X-Real-IP`, both equal to the client IP it resolved (`TRUSTED_PROXIES`, right-to-left). The API
  therefore always sees one trusted hop, and t2's compose defaults `TRUST_PROXY=hops`,
  `TRUST_PROXY_HOPS=1` stay correct with or without an outer proxy. Valkey keeps `noeviction` (t2
  requirement); this track only adds `maxmemory`. t2 also adds `RATE_LIMIT_STORE`/`TRUST_PROXY*`
  lines to the same api env block of `compose.production.yml`: merge them into the shared env
  anchor. t2 notes that `/health` and `/ready` are counted against the global limit, and container
  health checks call them every 15–30 s, so they should be exempt (t2 owns `rateLimit.ts`).
- **t4a upload security**: owns the in-API photo body cap (`PHOTO_BODY_MAX_BYTES`). The edge cap
  `EDGE_MAX_BODY_SIZE` (16 MB) sits above it as defense in depth, and the env-preprocessing change
  here should land first (t4a notes the same ordering).
- **cache-driver track**: `/ready` keeps its status tied to the database only, which is what the
  compose api health check relies on.
- **docs track (t8, owns `doc-drift-check`, `deployment-guide`, `local-dev-environment`,
  `node-runtime`, `pnpm-workspace`)**:
  - `doc-drift-check` currently says "`.github/workflows/pr.yml` SHALL run a `doc-drift` job".
    This change deletes `pr.yml`; the job must live in `ci.yml`.
  - `pnpm-workspace` scenario "CI runs the four gates" names "the `check` job of
    `.github/workflows/pr.yml`"; it should name the `quality` job of `ci.yml`.
  - `node-runtime` says `docker-entrypoint.sh` runs `pnpm --filter @brewform/api exec tsx src/main.ts`
    and mentions `release.yml`; this change makes the entrypoint `exec node` directly (native type
    stripping, or `node --import tsx` as the fallback) and deletes `release.yml`.
  - `AGENTS.md`, README and the general docs index should link the new `docs/deployment_compose.md`
    and drop `release.yml` / `make release` references.
- **seed / data-layer track**: owns what the first-install seed inserts in production (demo
  accounts). This track only changes how the seed is invoked (`node`, first boot only, also from
  the `migrate` mode).
- **SEO / OG track**: the edge routes `/share/*` to the API on the web origin and the runtime
  `PUBLIC_APP_URL` rewrite fixes `og:image`/`Sitemap:` for self-hosters. Routing crawler user agents
  on `/recipes/*` to the API can be added to the same Caddy snippet if that track wants it.
- **security headers on the web Caddy** (`devex-infra-ci/web-edge-headers-sourcemaps`,
  `security/web-no-security-headers`): edits the same `apps/web/Caddyfile`. Keep the structure
  (global options, `/healthz`, `import conf.d/*.caddy`, static `handle`), so header and sourcemap
  rules slot into the static `handle` block.
- **t7 search**: adds a `CREATE EXTENSION pg_trgm` custom migration. The new node-based migration
  runner applies custom migrations like any other; the CI smoke test uses `postgres:18-trixie`,
  which ships contrib.

## 6. Sources

- Repository files cited inline (paths and line numbers as of 2026-11-18, commit ada9f6e).
- zod 4.4.3 behaviour reproduced with the repository's installed package (see C1/C1b).
- Caddy docs (Context7 `/websites/caddyserver_caddyfile`): `reverse_proxy` header defaults,
  `trusted_proxies` / `trusted_proxies_strict` / `private_ranges`, environment placeholders with
  defaults, `import` (an empty glob is not an error), `handle` ordering, `request_body max_size`.
- Docker Compose docs (Context7 `/websites/docker_compose`): `depends_on` conditions
  `service_healthy` / `service_completed_successfully`, healthcheck `start_period`.
- pnpm docs (Context7 `/pnpm/pnpm.io`): `pnpm deploy` behaviour since 12.2, Docker multi-stage
  example.
- docker/metadata-action docs (Context7): image names are lowercased automatically; `type=raw`,
  `type=sha,format=long`, `type=ref,event=tag`, `{{is_default_branch}}`.
- docker/build-push-action docs (Context7): load-then-push pattern, `load`/`push` inputs.
- Coolify health checks: https://coolify.io/docs/applications/configuration/health-checks
  (dashboard checks run inside the container and need curl or wget; Dockerfile `HEALTHCHECK` is used
  when the dashboard check is disabled; Traefik removes unhealthy containers from routing).
- valkey-cli password via `VALKEYCLI_AUTH`: https://valkey.io/topics/cli/ and
  https://www.mankier.com/1/valkey-cli
