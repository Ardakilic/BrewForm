## MODIFIED Requirements

### Requirement: Entrypoint runs seed only on first boot
The `docker-entrypoint.sh` script SHALL run the first-install bootstrap (the `@brewform/db` seed entrypoint, run with `node`) ONLY when the `users` table is empty, as reported by `packages/db/src/check-users-empty.ts` run directly with `node`.

The check script prints the bare integer count of `users` rows to stdout, which the entrypoint
captures. It MUST NOT mask a query failure as `0`: a failed check exits non-zero and, with
`set -e`, aborts the boot instead of re-seeding a populated database. The check SHALL NOT use
`psql` (the runtime image has no Postgres client).

When the count is `0` the script SHALL print `Database is empty, running seed...` before and
`Seeding complete.` after the seed. When the count is greater than `0` it SHALL skip the seed and
print `Seed skipped — database already contains data (<count> users).`

What the seed inserts in a given `APP_ENV` (the admin and reference data only in production) is
defined by the `database-seed` capability, not by this requirement. The seed remains idempotent
(`onConflictDoNothing` on unique keys), so a manual re-run is non-destructive.

#### Scenario: Seed runs on first boot
- **WHEN** the API container starts against a database whose `users` table is empty
- **THEN** the seed entrypoint runs and the admin account from `ADMIN_EMAIL`/`ADMIN_USERNAME`/`ADMIN_PASSWORD` is created
- **AND** stdout contains `Database is empty, running seed...` and `Seeding complete.`
- **AND** the API server starts after seeding completes

#### Scenario: Seed is skipped on subsequent boots
- **WHEN** the API container starts against a database whose `users` table has rows
- **THEN** the seed does NOT run
- **AND** stdout contains `Seed skipped — database already contains data (<N> users).`

#### Scenario: Failed check aborts instead of re-seeding
- **WHEN** the user-count check cannot reach the database
- **THEN** the check exits non-zero and the entrypoint aborts
- **AND** the seed does NOT run

#### Scenario: Seed is non-destructive if run manually
- **WHEN** an operator runs the seed entrypoint manually against a populated database
- **THEN** no existing row is modified or deleted and no unique constraint is violated

### Requirement: Makefile targets for image build and prod profile
The `Makefile` SHALL provide an `images` target that builds both images locally under non-registry tags and `prod-*` targets that wrap `compose.production.yml` with `--env-file .env.production`, and it SHALL NOT provide any target that pushes images to the public registry.

Targets (each with a `##` help comment and listed in `.PHONY`):
- `images`: builds `brewform-api:local` from `Dockerfile` and `brewform-web:local` from
  `Dockerfile.web`, passing `VITE_API_URL` (default `/api/v1`) and `VITE_PUBLIC_APP_URL` (default
  `http://localhost:8080`) as build args. It MUST NOT tag `ghcr.io/...:latest`.
- `prod-up`, `prod-down`, `prod-logs`, `prod-ps`, `prod-pull`: run
  `docker compose --env-file .env.production -f compose.production.yml <up -d|down|logs -f|ps|pull>`.
- `prod-backup`: runs one immediate database (and uploads) backup through the Compose `backup`
  service, without pruning old backups.
- `prod-backup-export`: copies the backups target to `DEST` (default `./backup-export`) with
  `docker compose cp backup:/backups/. $(DEST)`.
- `prod-restore`: stops `api`, `web` and `backup`, runs `up -d --wait postgres`, takes a safety
  backup with `run --rm --no-deps -e BACKUP_ONESHOT=1 backup` (and stops with a non-zero exit when it
  fails), runs the profile-gated `restore` service with `RESTORE_DB_DUMP=$(DUMP)` and
  `RESTORE_UPLOADS_ARCHIVE=$(UPLOADS)`, then runs `up -d`.
- `prod-fix-uploads-owner`: runs
  `docker compose run --rm --no-deps --user 0:0 --entrypoint chown api -R 1000:1000 /app/uploads`,
  which hands the selected uploads source (named volume or host folder) to the API's `node` user.
- `prod-smoke`: runs `images` and then `scripts/ci/smoke-compose.sh` against
  `compose.production.yml` with the local images (`IMAGE_TAG=local` and the local image names), the
  same compose smoke test CI runs, for a pre-release check.

Every `prod-*` target MUST fail with a clear message when `.env.production` does not exist (Compose
would otherwise fall back to the development `.env`). The env file path is the `PROD_ENV_FILE`
make variable (default `.env.production`), which the CI compose smoke test overrides on the command
line. The previous `images-push`, `release` and `prod-up-build` targets SHALL be removed.

#### Scenario: make images builds local tags only
- **WHEN** `make images` is run
- **THEN** `brewform-api:local` and `brewform-web:local` exist in `docker images`
- **AND** no `ghcr.io/ardakilic/brewform-*:latest` tag is created or changed

#### Scenario: make prod-up uses the production compose file
- **WHEN** `make prod-up` is run with `.env.production` present
- **THEN** `docker compose --env-file .env.production -f compose.production.yml up -d` executes

#### Scenario: Uploads ownership is fixed for any source
- **WHEN** `make prod-fix-uploads-owner` runs with `UPLOADS_SOURCE` unset, and again with `UPLOADS_SOURCE=./data/uploads`
- **THEN** after each run `/app/uploads` and every file in it are owned by `1000:1000` inside the api container

#### Scenario: Restore takes a safety backup first
- **WHEN** `make prod-restore DUMP=<dump>` runs against a running stack
- **THEN** a one-shot backup of the current database completes before the `restore` service starts
- **AND** when that backup fails, the target exits non-zero without running the `restore` service

#### Scenario: Missing production env file is refused
- **WHEN** any `prod-*` target is run without `.env.production`
- **THEN** the target exits non-zero with a message telling the operator to copy `.env.production.example`
- **AND** no `docker compose` command runs

#### Scenario: No local publish path exists
- **WHEN** `make release` or `make images-push` is run
- **THEN** make reports that there is no such target

### Requirement: No secrets baked into images
Neither Docker image SHALL contain secrets at build time: all sensitive configuration SHALL be provided as runtime environment variables, and the only build-time `ARG`s SHALL be the public `VITE_API_URL` and `VITE_PUBLIC_APP_URL` of the web image.

Sensitive values include `DATABASE_URL`, `POSTGRES_PASSWORD`, `JWT_SECRET`, `REDIS_URL`,
`VALKEY_PASSWORD`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `SMTP_PASS` and `ADMIN_PASSWORD`. They are set
via Coolify's Environment Variables, `compose.production.yml` `environment:` interpolated from
`.env.production`, or `docker run -e`, never as `ARG` or `ENV` instructions. The API `Dockerfile`
has no build-time `ARG`s.

The `.dockerignore` MUST exclude environment files at any depth (`.env`, `*.env`, `.env.*` and
their `**/` forms) while keeping the committed `.env.example`, `apps/api/.env.example` and
`apps/web/.env.example` templates through exact-path exceptions, because both Dockerfiles use
`COPY . .`.

#### Scenario: API image has no baked secrets
- **WHEN** `docker history --no-trunc` and the image config of the API image are inspected
- **THEN** no layer or `ENV` entry contains `JWT_SECRET`, `DATABASE_URL`, `REDIS_URL`, `VALKEY_PASSWORD`, `S3_SECRET_KEY`, `SMTP_PASS` or `ADMIN_PASSWORD` values

#### Scenario: Web image build args are public URLs only
- **WHEN** the web image build command is inspected
- **THEN** the only `--build-arg` values are `VITE_API_URL` and `VITE_PUBLIC_APP_URL`

#### Scenario: Local env files never reach an image
- **WHEN** `make images` is run in a working tree containing populated `.env`, `.env.production` and `apps/api/.env` files
- **THEN** none of those files exists in either image
- **AND** the three committed `*.env.example` templates are still present in the build context

### Requirement: Docker build context excludes local state and nested artifacts
The `.dockerignore` SHALL exclude, at any directory depth, `node_modules`, `coverage`, `dist` and `.turbo`, and SHALL exclude local state and tooling directories (`uploads`, `backups`, `data`, `backup-export`, `uploads-rescue`, `.git`, `.github`, `.claude`, `.kiro`, `.opencode`, `.vscode`, `.idea`, `plans`, `openspec`, `docs`) and backup files at any depth (`*.dump`, `uploads-*.tar.gz`), while keeping every path the images need.

Paths the images need, and which therefore MUST NOT be excluded, include `files/`,
`packages/db/drizzle/`, `apps/web/public/`, `apps/api/src/templates/` and the workspace manifests.
Docker evaluates `.dockerignore` patterns relative to the context root, so nested directories need
`**/` patterns. Exceptions (`!` lines) SHALL name exact paths, never a `**/` glob: a glob exception
makes Docker walk into every excluded directory, and an unreadable one (the postgres data folder is
mode `0700`) then fails the build.

#### Scenario: Nested node_modules are not sent to the builder
- **WHEN** a build runs in a working tree that has `apps/web/node_modules` and `packages/db/node_modules`
- **THEN** neither directory is part of the build context

#### Scenario: Local uploads never reach an image
- **WHEN** a build runs in a working tree with files in `uploads/` and `apps/api/uploads/`
- **THEN** neither image contains those files

#### Scenario: Documented data folders never reach the builder
- **WHEN** a build runs in a working tree with an unreadable `data/postgres` folder, `backup-export/`, `uploads-rescue/` and `*.dump` files, as the self-hosting guide creates them
- **THEN** the build succeeds and none of those paths is part of the build context

#### Scenario: Required inputs are still present
- **WHEN** the API image is built
- **THEN** `/app/files/scaa-2.json` and `/app/packages/db/drizzle/meta/_journal.json` exist in the image

### Requirement: Web edge reverse-proxies API paths when an upstream is configured
When `API_UPSTREAM` is set to a valid `host:port`, the web container SHALL reverse-proxy every request whose path starts with `/api/`, `/uploads/` or `/share/`, and requests for the exact paths `/health` and `/sitemap.xml`, to that upstream with the original path and query preserved, and when `API_UPSTREAM` is unset it SHALL serve only static files exactly as before.

`/health` is proxied so an external uptime monitor can check the API's liveness through the single
public origin. `/sitemap.xml` is proxied because the sitemap index and its pages must live at the
site root (capability `recipe-visibility`). `/ready` is NOT proxied: readiness is for the
orchestrator on the internal network. The web container's own `/healthz` is always answered
locally.

The entrypoint SHALL validate `API_UPSTREAM` against a `host[:port]` allowlist; an invalid value is
logged as a warning and ignored (static-only mode). On proxied requests the edge SHALL:
- resolve the client IP by trusting incoming forwarding headers only from the ranges in
  `TRUSTED_PROXIES` (unset: trust no proxy; `private_ranges` and CIDR lists accepted), parsing
  `X-Forwarded-For` right-to-left
- send the upstream exactly one `X-Forwarded-For` entry and an `X-Real-IP`, both equal to that
  resolved client IP, replacing any client-supplied values. The API therefore always sees the edge
  as one trusted hop (`TRUST_PROXY=hops`, `TRUST_PROXY_HOPS=1` in the `api-rate-limiting`
  capability), whatever proxies sit in front of the edge
- reject request bodies larger than `EDGE_MAX_BODY_SIZE` (default `16MB`) with `413`
- return `502` for proxied paths while the upstream is unreachable, while still serving the SPA

Unset `API_UPSTREAM` keeps the split-domain topology used by Coolify (web and API on separate
domains) unchanged.

#### Scenario: API request is proxied same-origin
- **WHEN** the web container runs with `API_UPSTREAM=api:8000` and the browser requests `GET /sitemap.xml?part=static` from the web origin
- **THEN** the response is the API's sitemap XML, not `index.html`
- **AND** `GET /api/v1/sitemap.xml` from the web origin is answered by the API (its 301 to `/sitemap.xml`)

#### Scenario: Uploads and share paths are proxied
- **WHEN** `GET /uploads/<file>` and `GET /share/<slug>` are requested from the web origin with `API_UPSTREAM` set
- **THEN** both are answered by the API service

#### Scenario: API liveness is reachable through the edge
- **WHEN** `GET /health` is requested from the web origin with `API_UPSTREAM` set and the API running
- **THEN** the response is the API's `200` `{"status":"ok"}`
- **AND** `GET /ready` from the web origin is not forwarded to the API

#### Scenario: Static-only mode without an upstream
- **WHEN** the web container runs without `API_UPSTREAM`
- **THEN** `GET /api/v1/anything` and `GET /sitemap.xml` return the SPA `index.html` as before
- **AND** the entrypoint logs that the API proxy is disabled

#### Scenario: Invalid upstream is ignored
- **WHEN** the web container starts with `API_UPSTREAM="api:8000; rm -rf /"`
- **THEN** the entrypoint logs a warning and starts in static-only mode

#### Scenario: Spoofed client IP headers are overwritten
- **WHEN** a client connecting directly (not from `TRUSTED_PROXIES`) sends `X-Real-IP: 1.2.3.4` and `X-Forwarded-For: 1.2.3.4` to a proxied path
- **THEN** the upstream receives `X-Real-IP` and a single-entry `X-Forwarded-For`, both set to the client's actual address

#### Scenario: Client IP behind a trusted outer proxy is preserved
- **WHEN** `TRUSTED_PROXIES=private_ranges` and a proxy at `10.0.0.5` forwards a request with `X-Forwarded-For: 1.2.3.4, 203.0.113.9`
- **THEN** the upstream receives `X-Forwarded-For: 203.0.113.9` and `X-Real-IP: 203.0.113.9` (the right-most untrusted address)

#### Scenario: Oversized request body is rejected at the edge
- **WHEN** a client sends a 20 MB body to `/api/v1/photos` with the default `EDGE_MAX_BODY_SIZE`
- **THEN** the edge responds `413` without forwarding the full body

#### Scenario: Upstream outage does not break the SPA
- **WHEN** the API container is stopped
- **THEN** proxied paths return `502`
- **AND** `GET /` still returns `index.html` and `GET /healthz` still returns `200`

### Requirement: Web image applies the public app URL at runtime
When `PUBLIC_APP_URL` is set to a valid absolute `http(s)` origin, the web entrypoint SHALL replace the build-time public origin in `index.html` (the `og:image` and `twitter:image` meta tags) and in `robots.txt` (the `Sitemap:` line) with that origin before Caddy starts; when it is unset or invalid, the build-time values SHALL remain.

The value SHALL be validated against a strict origin allowlist (scheme, host, optional port and
path made of URL-safe characters, no trailing slash) before substitution. Self-hosted deployments
that pull the published image therefore advertise their own domain instead of the maintainer's or
`http://localhost:8080`.

#### Scenario: Runtime public URL rewrites social and sitemap URLs
- **WHEN** the web container starts with `PUBLIC_APP_URL=https://brew.example.org`
- **THEN** `index.html` contains `https://brew.example.org/og-default.png` in its `og:image` and `twitter:image` tags
- **AND** `robots.txt` contains `Sitemap: https://brew.example.org/sitemap.xml`

#### Scenario: Unset public URL keeps build-time values
- **WHEN** the web container starts without `PUBLIC_APP_URL`
- **THEN** `index.html` and `robots.txt` are byte-identical to the built files

#### Scenario: Invalid public URL is ignored
- **WHEN** the web container starts with `PUBLIC_APP_URL=javascript:alert(1)`
- **THEN** the entrypoint logs a warning and leaves the built files unchanged

### Requirement: Entrypoint runs migrations on every boot
In its default `serve` mode, the `docker-entrypoint.sh` script SHALL apply pending Drizzle migrations before starting the API on every container start, unless `RUN_MIGRATIONS` is set to `false`, and it SHALL also provide a `migrate` mode that applies migrations and the first-install bootstrap and then exits.

Migrations SHALL be applied by the `@brewform/db` migration runner script, run directly with
`node` (no `pnpm` and no `drizzle-kit` at runtime). The runner uses Drizzle's migrator against the
committed `packages/db/drizzle/` folder and the default `drizzle.__drizzle_migrations` tracking
table, so applying an already-applied set is a no-op. `DATABASE_URL` MUST be set.

The script SHALL use `set -e` so a failing migration exits non-zero and the API does NOT start
(fail-fast). It SHALL print `Running database migrations...` before and `Migrations complete.`
after a successful migration. When `RUN_MIGRATIONS=false` in `serve` mode it SHALL print
`Migrations skipped (RUN_MIGRATIONS=false).` and skip migrations, the comment-count recount and the
first-install bootstrap. The mode is selected by the first container argument (`serve` when absent,
or `migrate`); any other value SHALL make the entrypoint exit non-zero with a usage message.

Right after `Migrations complete.`, in both modes, the script SHALL print
`Recounting comment counts...` and run the comment-count recount
(`node /app/packages/db/src/recount-comment-counts.ts`, comment-authz "Stored comment counts are
recounted after every migration run"), then continue with the first-install bootstrap. A recount
that exits non-zero SHALL NOT stop the boot or fail `migrate` mode: the script SHALL print
`WARNING: comment count recount failed; continuing (the next start retries).` to stderr and go on,
because the stored count is a display counter and the next start repeats the recount.

#### Scenario: Migrations run on first boot
- **WHEN** the API container starts in `serve` mode against an empty database
- **THEN** all migrations from `packages/db/drizzle/` are applied
- **AND** stdout contains `Running database migrations...` and `Migrations complete.`
- **AND** the API server starts after migrations complete

#### Scenario: Migrations are a no-op on subsequent boots
- **WHEN** the API container starts against a database with all migrations applied
- **THEN** the migration runner applies nothing and exits successfully
- **AND** the API server starts

#### Scenario: Migration failure prevents API start
- **WHEN** the migration runner exits non-zero (wrong `DATABASE_URL`, unreachable database or a malformed migration)
- **THEN** the entrypoint exits with a non-zero code
- **AND** the API server does NOT start

#### Scenario: Migrations can be disabled for an externally migrated deployment
- **WHEN** the container starts in `serve` mode with `RUN_MIGRATIONS=false`
- **THEN** stdout contains `Migrations skipped (RUN_MIGRATIONS=false).`
- **AND** neither the migration runner, the comment-count recount nor the first-install bootstrap runs
- **AND** the API server starts

#### Scenario: Migrate mode exits after migrating
- **WHEN** the container is started with the argument `migrate`
- **THEN** migrations, the comment-count recount and the first-install bootstrap run
- **AND** the container exits with status `0` without starting the API server

#### Scenario: Comment counts are recounted after the migrations
- **WHEN** the container starts in `migrate` mode against a fresh production install
- **THEN** stdout contains `Recounting comment counts...` after `Migrations complete.` and `Comment count recount: complete (scanned 0, repaired 0, skipped 0)`

#### Scenario: A failed recount does not block the start
- **WHEN** the comment-count recount exits non-zero
- **THEN** stderr contains `WARNING: comment count recount failed; continuing (the next start retries).`
- **AND** `migrate` mode still exits `0` and `serve` mode still starts the API server

#### Scenario: Unknown mode is rejected
- **WHEN** the container is started with the argument `bogus`
- **THEN** the entrypoint prints a usage message and exits non-zero
