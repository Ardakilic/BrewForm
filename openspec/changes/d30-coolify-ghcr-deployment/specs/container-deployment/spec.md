# Container Deployment

Two registry-publishable Docker images — `ghcr.io/ardakilic/brewform-api` (Deno runtime, Hono API)
and `ghcr.io/ardakilic/brewform-web` (`caddy:2-alpine` serving the compiled React SPA) — plus a
`compose.yml` `prod` profile that references the published images and mirrors the Coolify topology
locally. The API image runs migrations and a first-boot seed via an entrypoint script before
starting the server.

The API exposes health endpoints at `GET /health` (liveness, 200 `{ status: 'ok' }`) and
`GET /ready` (readiness, 200 or 503), confirmed in `apps/api/src/routes/health.ts` and mounted at
the root via `apps/api/src/routes/index.ts` (so the full paths are `/health` and `/ready`, NOT
`/api/v1/health`).

## ADDED Requirements

### Requirement: API Docker image with migrate-on-start entrypoint

The system SHALL provide a multi-stage `Dockerfile` producing a `runner` stage that:
- Is based on `denoland/deno:debian-2.7.14`
- Contains the compiled API source (`apps/api/src/main.ts` and all imported modules), generated
  Drizzle migrations (`packages/db/drizzle/`), `packages/db/drizzle.config.ts`, compiled email
  templates (in `apps/api/src/` or wherever `deno task email-build` outputs them), and
  `node_modules` (which includes `drizzle-kit` via the `npm:drizzle-kit@0.31.10` dependency, used
  by the entrypoint for migrations)
- Exposes port `8000`
- Uses `ENTRYPOINT ["/app/docker-entrypoint.sh"]` (no `CMD` — the entrypoint `exec`s the API)
- Runs the API with `--unstable-cron` and `--unstable-kv` flags (via the entrypoint's final
  `exec deno run ...` line)

The `builder` stage SHALL run `deno task email-build` (compiles MJML templates to TypeScript —
currently only run in CI, not in the Dockerfile) AND
`cd packages/db && deno run -A npm:drizzle-kit@0.31.10 generate` (generates migration SQL files —
already present in the current Dockerfile) so the runner stage has both the compiled email
templates and the migration SQL files for the entrypoint.

The `runner` stage SHALL `COPY docker-entrypoint.sh /app/docker-entrypoint.sh` and
`RUN chmod +x /app/docker-entrypoint.sh`.

#### Scenario: API image builds successfully

- **WHEN** `docker build -f Dockerfile -t ghcr.io/ardakilic/brewform-api:latest .` is run
- **THEN** the build completes without error
- **AND** the final image contains `apps/api/src/main.ts`, `packages/db/drizzle/` (migration SQL
  files), `packages/db/drizzle.config.ts`, compiled email templates, `node_modules/` (with
  `drizzle-kit`), and `/app/docker-entrypoint.sh` (executable)

#### Scenario: API image starts on port 8000

- **WHEN** the API image is run with `DATABASE_URL`, `JWT_SECRET`, and `CACHE_DRIVER` set as
  runtime environment variables
- **THEN** the container listens on port `8000` (the `APP_PORT` default)
- **AND** `GET /health` returns `200` with `{ status: 'ok' }`
- **AND** `GET /ready` returns `200` with `{ status: 'ready', db: 'connected' }` (or `503` if
  the DB is unreachable)

---

### Requirement: Entrypoint runs migrations on every boot

The `docker-entrypoint.sh` script SHALL run
`cd /app/packages/db && deno run -A npm:drizzle-kit@0.31.10 migrate` before starting the API
server, on every container start. `DATABASE_URL` MUST be set in the container environment (the
`drizzle.config.ts` reads it via `Deno.env.get('DATABASE_URL')`). Migrations are idempotent via
Drizzle's `__drizzle_migrations` tracking table.

The script SHALL use `set -e` so any failure exits with a non-zero code. If the migration fails,
the entrypoint SHALL exit with a non-zero code and NOT start the API server (fail-fast). The
container orchestrator's restart policy will restart the container.

The script SHALL emit the log line `"Running database migrations..."` before the migrate command
and `"Migrations complete."` after it succeeds.

#### Scenario: Migrations run on first boot

- **WHEN** the API container starts against an empty database (no tables)
- **THEN** `deno run -A npm:drizzle-kit@0.31.10 migrate` applies all pending migrations from
  `packages/db/drizzle/`
- **AND** stdout contains "Running database migrations..." and "Migrations complete."
- **AND** the API server starts after migrations complete

#### Scenario: Migrations run on subsequent boots

- **WHEN** the API container starts against a database with all migrations already applied
- **THEN** `deno run -A npm:drizzle-kit@0.31.10 migrate` is a no-op (Drizzle detects no pending
  migrations via the `__drizzle_migrations` table)
- **AND** the API server starts

#### Scenario: Migration failure prevents API start

- **WHEN** `deno run -A npm:drizzle-kit@0.31.10 migrate` exits with a non-zero code (e.g.,
  `DATABASE_URL` is wrong, the DB is unreachable, or a migration SQL file is malformed)
- **THEN** the entrypoint exits with a non-zero code (due to `set -e`)
- **AND** the API server does NOT start
- **AND** the container restarts (per the orchestrator's restart policy)

---

### Requirement: Entrypoint runs seed only on first boot

The `docker-entrypoint.sh` script SHALL run `deno run --allow-all /app/packages/db/src/seed.ts`
ONLY when the `users` table is empty (i.e., `SELECT count(*) FROM users` returns `0`). This
detects "first boot" because the admin user is the first row inserted by the seed script
(`packages/db/src/seed.ts` inserts the admin user first, then seed users, then equipment,
coffee varieties, vendors, beans, recipes, and social data — all with `onConflictDoNothing`).

The first-boot check SHALL be performed by a Deno script (either an inline `deno eval` or a
standalone `scripts/check-users-empty.ts` file) that queries `SELECT count(*) FROM users` using
the existing `@brewform/db` client (which is already in `/app/node_modules` and
`/app/packages/db`). The script SHALL print the count to stdout, which the entrypoint captures.
The check SHALL NOT use `psql` (the Deno image does not include `postgresql-client`).

When the `users` table is not empty (count > 0), the seed SHALL be skipped with a log message:
`"Seed skipped — database already contains data (<count> users)."`.

The seed script itself is idempotent (`onConflictDoNothing` on all inserts, verified across all
seed helpers in `packages/db/src/seed.ts`), so an accidental re-run is non-destructive, but the
first-boot guard avoids unnecessary work and log noise on every restart.

The script SHALL emit the log line `"Database is empty, running seed..."` before the seed
command (when count is 0) and `"Seeding complete."` after it succeeds.

#### Scenario: Seed runs on first boot (empty database)

- **WHEN** the API container starts against a database where `SELECT count(*) FROM users` is `0`
- **THEN** `deno run --allow-all /app/packages/db/src/seed.ts` runs
- **AND** the admin user (from `ADMIN_EMAIL`/`ADMIN_USERNAME`/`ADMIN_PASSWORD` env vars) and all
  seed data (badges, equipment catalog, coffee varieties, vendors, beans, recipes, social data,
  setups, taste notes) are inserted
- **AND** stdout contains "Database is empty, running seed..." and "Seeding complete."
- **AND** the API server starts after seeding completes

#### Scenario: Seed is skipped on subsequent boots

- **WHEN** the API container starts against a database where `SELECT count(*) FROM users` is
  `> 0`
- **THEN** the seed script is NOT executed
- **AND** stdout contains "Seed skipped — database already contains data (<N> users)."
- **AND** the API server starts immediately after migrations

#### Scenario: Seed is non-destructive if run manually

- **WHEN** an operator runs `deno run --allow-all /app/packages/db/src/seed.ts` manually against
  a populated database (e.g., via `docker exec` or Coolify's Terminal)
- **THEN** all inserts use `onConflictDoNothing` on their unique constraints (email, username,
  slug, composite keys, etc.) and no existing data is modified or deleted
- **AND** the seed completes successfully without violating any unique constraint

---

### Requirement: Entrypoint execs the API server with correct flags

After migrations and (conditional) seeding, the `docker-entrypoint.sh` SHALL emit
`"Starting BrewForm API..."` and then `exec` the API server with:
```
exec deno run --allow-read --allow-write --allow-net --allow-env --allow-sys --unstable-cron --unstable-kv /app/apps/api/src/main.ts
```

The `--unstable-kv` flag is REQUIRED for the `Deno.openKv()` call in `main.ts` when
`CACHE_DRIVER=deno-kv` (the Deno KV API is still unstable as of Deno 2.7). The `--unstable-cron`
flag is required for the cron jobs registered in `apps/api/src/utils/jobs/cron.ts`. The `exec`
ensures the API process replaces the entrypoint shell and receives `SIGTERM`/`SIGINT` for
graceful shutdown (the `main.ts` has shutdown handlers at lines 136+).

#### Scenario: API server starts with unstable flags

- **WHEN** the entrypoint reaches the `exec` line
- **THEN** the API server starts with both `--unstable-cron` and `--unstable-kv` flags
- **AND** `Deno.openKv()` works (no "unstable API" error)
- **AND** `Deno.cron()` works (no "unstable API" error)

#### Scenario: API server receives SIGTERM for graceful shutdown

- **WHEN** the container is stopped (Docker sends `SIGTERM`)
- **THEN** the API process (which replaced the shell via `exec`) receives `SIGTERM`
- **AND** the shutdown handlers in `main.ts` run (HTTP server shutdown, KV close, DB client end)

---

### Requirement: Web Docker image with Caddy serving the SPA

The system SHALL provide a `Dockerfile.web` with three stages:

1. **`deps`** (same as the API Dockerfile's `deps` stage): `denoland/deno:debian-2.7.14`, copies
   all workspace `deno.json`/`package.json` files, runs `deno install --frozen`.
2. **`builder`** (`denoland/deno:debian-2.7.14`): copies the full source, accepts `ARG VITE_API_URL`
   (default `/api/v1`) and `ARG VITE_PUBLIC_APP_URL` (default `http://localhost:8080`), sets them
   as `ENV` so Vite's `define` in `vite.config.ts` picks them up, runs
   `deno task --cwd apps/web build` (which runs `deno run -A npm:vite build`), producing
   `apps/web/dist/` with `index.html`, hashed JS/CSS bundles in `assets/`, `robots.txt`
   (generated by the `build-robots-txt` Vite plugin), and static assets copied from
   `apps/web/public/` (favicon, manifest, og-default.png, icons).
3. **`runner`** (`caddy:2-alpine`): copies `apps/web/dist` from the builder to `/usr/share/caddy`,
   writes a production `Caddyfile` to `/etc/caddy/Caddyfile` listening on `:80` (NOT `:8080` like
   the repo-root preview `Caddyfile`) with `try_files {path} /index.html` for SPA routing,
   `EXPOSE 80`. No `CMD` — the `caddy:2-alpine` base image's default CMD runs
   `caddy run --config /etc/caddy/Caddyfile`.

The production `Caddyfile` content SHALL be:
```
:80
root * /usr/share/caddy
file_server
try_files {path} /index.html
```
This can be written inline in the Dockerfile via `RUN printf '...' > /etc/caddy/Caddyfile` or
copied from a `Caddyfile.prod` file — either is acceptable.

The web image SHALL have **no runtime environment variable dependencies** for the SPA itself.
`VITE_API_URL` and `VITE_PUBLIC_APP_URL` are baked at Vite build time (inlined into the JS bundle
via `import.meta.env.*` and into `index.html` meta tags via `%VITE_PUBLIC_APP_URL%` substitution).
The web container has no env vars to configure at runtime.

#### Scenario: Web image builds with production API URL

- **WHEN** `docker build -f Dockerfile.web --build-arg VITE_API_URL=https://api.brewform.example.com/api/v1 --build-arg VITE_PUBLIC_APP_URL=https://brewform.example.com -t ghcr.io/ardakilic/brewform-web:latest .` is run
- **THEN** the build completes and the final image contains `/usr/share/caddy/index.html` with
  the `VITE_API_URL` value inlined into the JS bundle as `import.meta.env.VITE_API_URL`
- **AND** `/usr/share/caddy/robots.txt` exists (generated by the Vite plugin)
- **AND** `/usr/share/caddy/assets/` contains the hashed JS/CSS bundles
- **AND** `/usr/share/caddy/favicon.svg`, `manifest.json`, `og-default.png` exist (copied from
  `apps/web/public/`)
- **AND** `/etc/caddy/Caddyfile` contains `:80` (not `:8080`)

#### Scenario: Web image serves the SPA on port 80

- **WHEN** the web image is run (e.g., `docker run -p 8080:80 ghcr.io/ardakilic/brewform-web:latest`)
- **THEN** Caddy listens on port `80` inside the container
- **AND** `GET /` (mapped to host 8080) returns `index.html` with content-type `text/html`
- **AND** `GET /some/spa/route` returns `index.html` (SPA fallback via `try_files`)

#### Scenario: Web image serves static assets

- **WHEN** `GET /assets/recipe-list-abc123.js` is requested
- **THEN** Caddy serves the hashed asset from `/usr/share/caddy/assets/`
- **AND** the response has content-type `application/javascript`

#### Scenario: Web image serves public assets

- **WHEN** `GET /favicon.svg` is requested
- **THEN** Caddy serves the file from `/usr/share/caddy/favicon.svg`
- **AND** the response has content-type `image/svg+xml`

---

### Requirement: Compose `prod` profile references published images

The `compose.yml` SHALL define a `prod` profile containing:
- An `app-prod` service (named `app-prod` to avoid collision with the existing `dev`-profile
  `app` service) with `image: ghcr.io/ardakilic/brewform-api:latest`, `ports: ["8000:8000"]`,
  `env_file: .env`, `depends_on: [postgres (healthy), denokv (healthy)]`, `profiles: [prod]`.
- A `web-prod` service with `image: ghcr.io/ardakilic/brewform-web:latest`,
  `ports: ["8080:80"]` (host 8080 → container 80), `depends_on: [app-prod (started)]`,
  `profiles: [prod]`.
- The `denokv` service (see `remote-cache` spec — shared across profiles, no profile constraint
  or listed in both).
- A `postgres` service (already exists for `dev`; the `prod` profile reuses it for local
  prod-smoke-testing — Coolify manages its own Postgres).

`docker compose --profile prod up` SHALL pull the published images from GHCR (because the
services have `image:` fields and no `build:` override).
`docker compose --profile prod up --build` SHALL build the images locally from `Dockerfile` and
`Dockerfile.web` (Docker Compose's `--build` flag overrides the `image:` field and builds from
the `build:` context — the implementer must add `build:` blocks to the `app-prod`/`web-prod`
services pointing at `.` with `dockerfile: Dockerfile` / `dockerfile: Dockerfile.web`).

The `dev` profile (existing `app`, `web-dev`, `app-preview`, `web` services) SHALL remain
unchanged in behavior — `make dev` and `make up` must not start any `prod`-profile service.

#### Scenario: Prod profile pulls published images

- **WHEN** `docker compose --profile prod up` is run (no `--build`)
- **THEN** Docker pulls `ghcr.io/ardakilic/brewform-api:latest` and
  `ghcr.io/ardakilic/brewform-web:latest` from GHCR
- **AND** the `app-prod`, `web-prod`, `denokv`, and `postgres` containers start

#### Scenario: Prod profile builds locally with --build

- **WHEN** `docker compose --profile prod up --build` is run
- **THEN** Docker builds the API image from `Dockerfile` and the web image from `Dockerfile.web`
- **AND** the built images are used instead of pulling from GHCR
- **AND** the containers start

#### Scenario: Dev profile is unaffected

- **WHEN** `make dev` or `make up` is run
- **THEN** only the `dev`-profile and no-profile services start (no `prod`-profile service starts)
- **AND** the behavior is identical to before this change

---

### Requirement: Makefile targets for image build and prod profile

The `Makefile` SHALL add the following targets, all running through Docker (no local Deno
required). The targets mirror the existing Makefile style (each target has a `##` help comment):
- `images` — build `ghcr.io/ardakilic/brewform-api:latest` from `Dockerfile` and
  `ghcr.io/ardakilic/brewform-web:latest` from `Dockerfile.web` locally. The web build passes
  `--build-arg VITE_API_URL=$${VITE_API_URL:-/api/v1}` and
  `--build-arg VITE_PUBLIC_APP_URL=$${VITE_PUBLIC_APP_URL:-http://localhost:8080}` (shell
  parameter expansion — uses the env var if set, falls back to the default).
- `images-push` — `docker push` both images to GHCR (requires `docker login ghcr.io` first).
- `prod-up` — `docker compose --profile prod up -d` (pulls published images).
- `prod-up-build` — `docker compose --profile prod up -d --build` (builds locally).
- `prod-down` — `docker compose --profile prod down`.
- `release` — `make images && make images-push` (local equivalent of the CI release job).

All existing Makefile targets SHALL remain unchanged. The `.PHONY` declaration SHALL be updated
to include all new targets.

#### Scenario: make images builds both images

- **WHEN** `make images` is run
- **THEN** `docker build -t ghcr.io/ardakilic/brewform-api:latest -f Dockerfile .` executes
- **AND** `docker build -t ghcr.io/ardakilic/brewform-web:latest -f Dockerfile.web --build-arg VITE_API_URL=... --build-arg VITE_PUBLIC_APP_URL=... .` executes
- **AND** both images are present in `docker images`

#### Scenario: make images respects VITE_API_URL env var

- **WHEN** `VITE_API_URL=https://api.example.com/api/v1 make images` is run
- **THEN** the web image build receives `--build-arg VITE_API_URL=https://api.example.com/api/v1`
- **AND** the built `dist/` has the production API URL inlined

#### Scenario: make prod-up starts the prod profile

- **WHEN** `make prod-up` is run
- **THEN** `docker compose --profile prod up -d` executes
- **AND** the `app-prod`, `web-prod`, `denokv`, and `postgres` containers are running

#### Scenario: make release builds and pushes

- **WHEN** `make release` is run (after `docker login ghcr.io`)
- **THEN** `make images` runs (builds both images)
- **AND** `make images-push` runs (pushes both to GHCR)
- **AND** `ghcr.io/ardakilic/brewform-api:latest` and `ghcr.io/ardakilic/brewform-web:latest` are
  updated on GHCR

---

### Requirement: No secrets baked into images

Neither Docker image SHALL contain secrets at build time. All sensitive configuration
(`DATABASE_URL`, `JWT_SECRET`, `DENO_KV_ACCESS_TOKEN`, `S3_SECRET_KEY`, `SMTP_PASS`,
`ADMIN_PASSWORD`, etc.) SHALL be provided as runtime environment variables (via Coolify's
Environment Variables tab, or `compose.yml` `environment:`/`env_file:`), not as Docker build
`ARG`s or `ENV` instructions.

The only build-time `ARG`s SHALL be `VITE_API_URL` and `VITE_PUBLIC_APP_URL` for the web image,
which are public URLs (not secrets). The API Dockerfile has NO build-time `ARG`s.

#### Scenario: API image has no baked secrets

- **WHEN** `docker history ghcr.io/ardakilic/brewform-api:latest --no-trunc` is inspected
- **THEN** no layer contains `JWT_SECRET`, `DATABASE_URL`, `DENO_KV_ACCESS_TOKEN`,
  `S3_SECRET_KEY`, `SMTP_PASS`, or `ADMIN_PASSWORD`

#### Scenario: Web image build-args are public URLs only

- **WHEN** the web image build command is inspected
- **THEN** the only `--build-arg` values are `VITE_API_URL` and `VITE_PUBLIC_APP_URL`
- **AND** neither value is a secret (they are public URLs)

---

### Requirement: Entrypoint and API have structured logging

The `docker-entrypoint.sh` SHALL emit plain `echo` log lines for each step (these go to
container stdout, which Coolify captures):
- `"Running database migrations..."` before the migrate command
- `"Migrations complete."` after successful migration
- `"Database is empty, running seed..."` (when count is 0) or
  `"Seed skipped — database already contains data (<N> users)."` (when count > 0)
- `"Seeding complete."` after successful seed (when seed ran)
- `"Starting BrewForm API..."` before the `exec`

The API's `main.ts` SHALL log the Deno KV cache connection using the existing `createLogger`
module-scoped logger (from `apps/api/src/utils/logger/index.ts`), per the `logging` spec
conventions:
- `logger.info({ url: kvUrl }, 'Deno KV cache connecting to remote server')` before the
  `Deno.openKv()` call (when `CACHE_DRIVER === 'deno-kv'`)
- `logger.info('Deno KV cache initialized (remote)')` after a successful remote `openKv`
  (replaces the existing ambiguous `'Deno KV cache initialized'` message)
- `logger.info('In-memory cache initialized')` (unchanged, when `CACHE_DRIVER === 'memory'`)

#### Scenario: Entrypoint logs each step

- **WHEN** the API container starts against an empty database
- **THEN** stdout contains, in order: "Running database migrations...", "Migrations complete.",
  "Database is empty, running seed...", "Seeding complete.", "Starting BrewForm API..."
- **AND** the API's own structured logs follow (JSON or pretty format per `LOG_FORMAT`)

#### Scenario: Entrypoint logs seed skip

- **WHEN** the API container starts against a populated database (count > 0)
- **THEN** stdout contains: "Running database migrations...", "Migrations complete.",
  "Seed skipped — database already contains data (<N> users).", "Starting BrewForm API..."

#### Scenario: API logs remote KV connection

- **WHEN** the API starts with `CACHE_DRIVER=deno-kv` and `DENO_KV_URL=http://denokv:4512`
- **THEN** the structured logs contain `{ url: 'http://denokv:4512' }` at info level with message
  "Deno KV cache connecting to remote server"
- **AND** followed by "Deno KV cache initialized (remote)" at info level