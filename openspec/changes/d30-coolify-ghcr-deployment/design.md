## Context

BrewForm ships as a Deno monorepo with two runtime artifacts: a Hono API (`apps/api`) and a React SPA (`apps/web` → `apps/web/dist`). The current Docker story is incomplete for self-hosting:

- The single `Dockerfile` (3-stage: `deps` → `builder` → `runner`) produces an **API-only** runtime image. It is never pushed to a registry. The `runner` stage `CMD` is `["deno", "run", "--allow-read", "--allow-write", "--allow-net", "--allow-env", "--allow-sys", "--unstable-cron", "apps/api/src/main.ts"]` — note `--unstable-kv` is **absent**, and there is no `ENTRYPOINT` (no migrate/seed step).
- The web SPA has **no Docker image** — `make preview` builds `dist/` on the host and serves it via a host-mounted `caddy:2-alpine` container reading `./apps/web/dist` and `./Caddyfile` from the host. This is unworkable for a registry-pull deployment on Coolify.
- `compose.yml` is dev-first: `app`/`web-dev`/`app-preview` use volume mounts and `--watch`; there is no "pull the published image and run it" path. The existing `web` service (preview profile) binds `./apps/web/dist:/usr/share/caddy:ro` and `./Caddyfile:/etc/caddy/Caddyfile:ro` and listens on `:8080` (the `Caddyfile` is `:8080`).
- CI (`ci.yml`) runs quality + tests but never builds or publishes images.
- The cache backend (`CACHE_DRIVER=deno-kv`) calls `Deno.openKv()` (no URL arg) at `apps/api/src/main.ts:127` → local SQLite inside the API container at the default origin-storage path. This is durable only if the container's filesystem is persistent, and it doesn't match a remote-sidecar topology.

The target is **Coolify** (self-hosted PaaS) deploying two **Docker Image** resources that pull from GHCR, plus a Coolify-managed Postgres and a `denokv` sidecar for the cache.

Existing infrastructure that informs the design (verified by reading the codebase):
- `apps/api/src/config/env.ts` — Zod-validated env schema; `CACHE_DRIVER` accepts `'deno-kv' | 'memory'`. Adding `DENO_KV_URL`/`DENO_KV_ACCESS_TOKEN` requires extending this schema with two `z.string().optional()` fields. The schema also contains `DATABASE_URL: z.string().min(1)`, `JWT_SECRET: z.string().min(16)`, `STORAGE_DRIVER: z.enum(['local','s3'])`, `S3_*` fields, `SMTP_*` fields, `CORS_ALLOWED_ORIGINS`, `ADMIN_*` fields, and `APP_PORT: z.coerce.number().default(8000)`.
- `apps/api/src/utils/cache/index.ts` — `CacheProvider` abstraction with `DenoKVCacheProvider` and `InMemoryCacheProvider`. No change needed here; only the `Deno.openKv()` call site in `main.ts:127` changes.
- `apps/api/src/main.ts:126-131` — the exact cache-init block:
  ```ts
  if (config.CACHE_DRIVER === 'deno-kv') {
    kv = await Deno.openKv();
    setCacheProvider(createCacheProvider('deno-kv', kv));
    logger.info('Deno KV cache initialized');
  } else {
    setCacheProvider(createCacheProvider('memory'));
    logger.info('In-memory cache initialized');
  }
  ```
- `apps/api/src/routes/health.ts` — confirmed health endpoints: `GET /health` (liveness, returns `{ status: 'ok' }`, 200) and `GET /ready` (readiness, checks DB with `SELECT 1`, returns 200 or 503). These are mounted at root (not under `/api/v1`), so the full paths are `/health` and `/ready`. **Use `/health` for Coolify healthchecks.**
- `apps/api/src/main.ts:77-113` — the `/uploads/*` route is only registered when `config.STORAGE_DRIVER === 'local'`. With `STORAGE_DRIVER=s3`, the API does not serve uploads; the SPA references `S3_PUBLIC_URL` directly.
- `apps/web/vite.config.ts` — already supports `VITE_API_URL` (absolute or relative, default `/api/v1`) and `VITE_PUBLIC_APP_URL`, baked at build time via `define`. The web image must receive these as build `ARG`s.
- `apps/web/deno.json` `deploy.runtime` is `static` with `spa: true` — confirms the SPA is a static bundle, not a Node/Deno runtime. The build task is `deno run -A npm:vite build` (outputs to `apps/web/dist`).
- `apps/web/public/` — contains `favicon.svg`, `favicon.ico`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `manifest.json`, `og-default.png`, `robots.txt`, `404.html`, `_redirects`. Vite copies these to `dist/` during build.
- `packages/db/src/seed.ts` — fully idempotent (`onConflictDoNothing` on every insert, verified across all seed helpers), guarded by `if (import.meta.main)`. Safe to run repeatedly. The seed inserts admin → users → equipment catalog → coffee varieties → vendors → beans → recipes → social data → setups → taste notes.
- `packages/db/deno.json` — `migrate` task runs `deno run -A npm:drizzle-kit@0.31 migrate` in the `packages/db` directory (uses `packages/db/drizzle.config.ts` which reads `Deno.env.get('DATABASE_URL')`).
- `packages/db/drizzle.config.ts` — reads `DATABASE_URL` from env at runtime. The entrypoint must have `DATABASE_URL` set for `drizzle-kit migrate` to work.
- Root `deno.json` — `"unstable": ["cron", "kv"]` at the workspace level; the API's `deploy.runtime.args` is `["--unstable-cron"]`. The Dockerfile CMD currently passes `--unstable-cron` only. The explicit `--unstable-kv` flag on the container CMD is the safe choice (Deno reads the workspace `unstable` array for `deno run`, but the explicit flag guarantees behavior regardless of how Deno is invoked).
- `Caddyfile` (repo root) — currently `:8080` (for the preview profile). The web Docker image needs its own `Caddyfile` (or a baked-in config) listening on `:80` since the container exposes 80.
- `.dockerignore` — currently `node_modules`, `.git`, `.turbo`, `coverage`. Does **not** exclude `apps/web/dist` — so the builder stage will see any pre-built `dist/` if present. The web Dockerfile builder stage runs `vite build` fresh, so this is fine.

## Goals / Non-Goals

**Goals:**
- Produce two registry-publishable images (API + web) that can be pulled and run by Coolify with no source checkout.
- Keep `make dev` and the existing dev workflow 100% intact (the `dev` profile is unchanged).
- Make the `prod` compose profile a faithful local mirror of the Coolify deployment (same images, same denokv sidecar, same env surface).
- Make the seed run exactly once (on first boot, when the `users` table is empty) and migrations run on every boot (idempotent).
- Publish images on every `main` push and on version tags via GitHub Actions.
- Provide concrete reference implementations for every new file so a fresh-context agent can apply the change without inventing shapes.

**Non-Goals:**
- Multi-arch builds (amd64 only for now; Coolify servers are typically amd64).
- A single combined image serving both API and SPA (rejected: loses independent env/deploys).
- Coolify API automation from CI (the webhook trigger is documented but optional; the publish step is the workflow's only required job).
- Changing the `CacheProvider` interface or adding Redis.
- Changing the `CORS_ALLOWED_ORIGINS` or `cors()` middleware behavior (already correct for subdomain routing).

## Decisions

### 1. Two images, not one

**Choice:** Build `ghcr.io/ardakilic/brewform-api:latest` (Deno runtime) and `ghcr.io/ardakilic/brewform-web:latest` (Caddy + static `dist`) as separate images.

**Rationale:**
- The user explicitly wants two Docker images with separate .env files (Q1).
- Coolify's "Docker Image" resource type gives each image its own Environment tab, domain, webhook, and rollback history — matching the "separate .env" requirement precisely.
- Independent deploy cycles: a frontend-only change rebuilds only `brewform-web`; the API container is untouched.
- A single combined image would couple the two lifecycles and force one env block.

**Alternative considered:** One Docker Compose resource in Coolify with both services. Rejected — the user chose two Docker Image resources for independent deploys. The `compose.yml` `prod` profile still exists as a *local* smoke-test tool and a reference, but Coolify deploys two separate Docker Image resources.

### 2. Web image: Caddy, not a Node/Deno static server

**Choice:** `caddy:2-alpine` base, with `apps/web/dist` and a production `Caddyfile` baked in at build time. The production `Caddyfile` listens on `:80` (not `:8080` like the repo-root preview `Caddyfile`) because the web container exposes port 80.

**Rationale:**
- The repo already uses Caddy for the preview profile (`compose.yml` `web` service). Reusing it keeps the SPA serving story consistent.
- Caddy is ~40MB, handles SPA `try_files` natively, and needs no runtime env (the `VITE_*` vars are baked at Vite build time).
- A Node/Deno static server would add runtime overhead and a second process to monitor for no benefit.

**Build-time injection:** `VITE_API_URL` and `VITE_PUBLIC_APP_URL` are passed as Docker `ARG`s → set as `ENV` during the Vite build stage → inlined by Vite's `define` into the bundle. The final Caddy image has **no runtime env dependencies** for the SPA itself.

**Reference `Dockerfile.web`** (the implementer should follow this shape):
```dockerfile
# ============================================================
# BrewForm — Dockerfile.web (Web SPA image)
# Stages: deps → builder → runner (Caddy serving dist/)
# ============================================================

# --- Stage 1: Dependencies ---
FROM denoland/deno:debian-2.7.14 AS deps
WORKDIR /app
COPY deno.json deno.lock package.json ./
COPY apps/api/package.json apps/api/deno.json ./apps/api/
COPY apps/web/package.json apps/web/deno.json ./apps/web/
COPY packages/shared/package.json packages/shared/deno.json ./packages/shared/
COPY packages/db/package.json packages/db/deno.json ./packages/db/
RUN deno install --frozen

# --- Stage 2: Build (Vite) ---
FROM denoland/deno:debian-2.7.14 AS builder
WORKDIR /app
COPY --from=deps /root/.cache/deno /root/.cache/deno
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time args → ENV so Vite's define picks them up
ARG VITE_API_URL=/api/v1
ARG VITE_PUBLIC_APP_URL=http://localhost:8080
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_PUBLIC_APP_URL=$VITE_PUBLIC_APP_URL
RUN deno task --cwd apps/web build
# Output is at apps/web/dist/

# --- Stage 3: Runtime (Caddy) ---
FROM caddy:2-alpine AS runner
COPY --from=builder /app/apps/web/dist /usr/share/caddy
# Production Caddyfile listening on :80 (not :8080 like the repo-root preview one)
RUN printf ':80\nroot * /usr/share/caddy\nfile_server\ntry_files {path} /index.html\n' > /etc/caddy/Caddyfile
EXPOSE 80
# Caddy's default CMD reads /etc/caddy/Caddyfile
```

**Reference `Caddyfile.prod`** (alternative to the inline `printf` — if the implementer prefers a file):
```
:80
root * /usr/share/caddy
file_server
try_files {path} /index.html
```
The inline `printf` in the Dockerfile is preferred (one less file to manage), but a `Caddyfile.prod` file is acceptable if the implementer prefers explicit files.

### 3. API entrypoint: migrate-always, seed-once

**Choice:** A `docker-entrypoint.sh` in the API image that:
1. Always runs `cd /app/packages/db && deno run -A npm:drizzle-kit@0.31.10 migrate` (idempotent — Drizzle tracks applied migrations in `__drizzle_migrations`). `DATABASE_URL` must be set in the container env.
2. Runs `deno run --allow-all /app/packages/db/src/seed.ts` **only if** the `users` table is empty. The first-boot check is done by querying `SELECT count(*) FROM users` via a tiny inline Deno script (so we don't need `psql` in the image). If count > 0, seed is skipped.
3. `exec deno run --allow-read --allow-write --allow-net --allow-env --allow-sys --unstable-cron --unstable-kv /app/apps/api/src/main.ts`

**Rationale:**
- Migrations are inherently idempotent (Drizzle's `__drizzle_migrations` table). Running on every boot guarantees the schema is always current after an image pull.
- The seed is idempotent per AGENTS.md (`onConflictDoNothing` everywhere), but the user explicitly wants it to "run only once" to avoid re-inserting / touching data on every restart. The `users` table count check is the simplest, most reliable first-boot sentinel: the admin user is the first row seeded, so an empty `users` table means the DB has never been seeded.
- `exec` ensures the API process replaces the entrypoint shell and receives signals (SIGTERM) correctly for graceful shutdown.
- Using a Deno one-liner for the count check (instead of `psql`) avoids needing `postgresql-client` in the Deno image, keeping the image lean.

**Reference `docker-entrypoint.sh`** (the implementer should create this file at repo root):
```bash
#!/bin/sh
set -e

echo "Running database migrations..."
cd /app/packages/db && deno run -A npm:drizzle-kit@0.31.10 migrate
echo "Migrations complete."

# Check if the users table is empty (first-boot sentinel).
# Uses a tiny inline Deno script so we don't need psql in the image.
USER_COUNT=$(deno eval "
  import { db } from '@brewform/db';
  import { sql } from 'drizzle-orm';
  const result = await db.execute(sql\`SELECT count(*)::int as count FROM users\`);
  console.log(result.rows[0].count);
  await (await import('@brewform/db')).client.end();
" 2>/dev/null || echo "0")

if [ "$USER_COUNT" = "0" ]; then
  echo "Database is empty, running seed..."
  deno run --allow-all /app/packages/db/src/seed.ts
  echo "Seeding complete."
else
  echo "Seed skipped — database already contains data ($USER_COUNT users)."
fi

echo "Starting BrewForm API..."
cd /app
exec deno run --allow-read --allow-write --allow-net --allow-env --allow-sys --unstable-cron --unstable-kv apps/api/src/main.ts
```

> **Note on the count-check approach:** The `deno eval` one-liner imports from `@brewform/db` (the workspace package) which is already in `/app/node_modules` and `/app/packages/db`. If `deno eval` has issues with workspace resolution in this context, the implementer can fall back to a standalone script file `scripts/check-users-empty.ts` that does the same query — the entrypoint calls `deno run -A /app/scripts/check-users-empty.ts` and reads stdout. The key invariant is: **no `psql` dependency, the check uses Deno + the existing `@brewform/db` client.**

**Reference `Dockerfile` (API, modified runner stage)** — the implementer changes only the `runner` stage and adds the entrypoint:
```dockerfile
# --- Stage 3: Runtime (API only, with entrypoint) ---
FROM denoland/deno:debian-2.7.14 AS runner
WORKDIR /app
COPY --from=builder /root/.cache/deno /root/.cache/deno
COPY --from=builder /app .
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh
EXPOSE 8000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
# No CMD — the entrypoint execs the API server directly
```
The `deps` and `builder` stages stay as-is, except the `builder` stage MUST run `deno task email-build` (currently only in CI) and `cd packages/db && deno run -A npm:drizzle-kit@0.31.10 generate` (already present) so the runner has compiled email templates and migration SQL files.

**Alternative considered:** Coolify's "post-deployment command" field. Rejected — it's documented for the Dockerfile build pack, not reliably for the Docker Image resource. The entrypoint is self-contained and works on any platform.

**Alternative considered:** A separate one-shot "migrate" container in compose. Rejected — adds orchestration complexity; the entrypoint pattern is simpler and works for both Coolify (single API container) and local `prod` profile.

### 4. `DENO_KV_URL` + `denokv` sidecar

**Choice:** Add a `denokv` service to both compose profiles, and change `main.ts:127` to `Deno.openKv(Deno.env.get('DENO_KV_URL') ?? 'http://denokv:4512')` when `CACHE_DRIVER=deno-kv`. `DENO_KV_ACCESS_TOKEN` is set in the API env.

**Rationale (per Q3 = path b):**
- The user wants local and remote to be "almost the same." A `denokv` sidecar in both profiles achieves this — the API always talks to `http://denokv:4512`, whether local or on Coolify.
- `denokv` is official (`denoland/denokv`), SQLite-backed, and implements the same KV Connect protocol as Deno Deploy KV. The `Deno.Kv` handle is identical local-vs-remote, so `CacheProvider` and `DenoKVCacheProvider` need **no changes**.
- A single `denokv` instance is the ceiling for horizontal scaling (single-writer SQLite), but BrewForm runs one API replica today. If scaling is needed later, switching is a one-line change (or move to Deno Deploy KV).
- `denokv` supports a bearer token (`--access-token`); the API sends it via `DENO_KV_ACCESS_TOKEN` (the Deno runtime reads this env var automatically as the bearer token for KV Connect). Inside the Docker network this is defense-in-depth, not strictly required, but cheap to configure.

**Exact `main.ts` change** (at lines 126-131):
```ts
// Before:
if (config.CACHE_DRIVER === 'deno-kv') {
  kv = await Deno.openKv();
  setCacheProvider(createCacheProvider('deno-kv', kv));
  logger.info('Deno KV cache initialized');
} else {

// After:
if (config.CACHE_DRIVER === 'deno-kv') {
  const kvUrl = Deno.env.get('DENO_KV_URL') ?? 'http://denokv:4512';
  logger.info({ url: kvUrl }, 'Deno KV cache connecting to remote server');
  kv = await Deno.openKv(kvUrl);
  setCacheProvider(createCacheProvider('deno-kv', kv));
  logger.info('Deno KV cache initialized (remote)');
} else {
```

**Exact `flush-cache.ts` change** (line 10):
```ts
// Before:
const kv = await Deno.openKv();

// After:
const kv = await Deno.openKv(Deno.env.get('DENO_KV_URL') ?? 'http://denokv:4512');
```

**Exact `env.ts` additions** (add after the `CACHE_DRIVER` field):
```ts
DENO_KV_URL: z.string().optional(),
DENO_KV_ACCESS_TOKEN: z.string().optional(),
```

**Alternative considered:** Co-located local SQLite in the API container (`Deno.openKv('/data/kv.sqlite')` + a volume). Rejected because the user explicitly chose the sidecar path (Q3 = b) for local↔remote parity. The co-located approach is the simpler alternative if scaling is never needed, but the sidecar is the chosen path.

**Alternative considered:** Redis. Rejected — forces a `CacheProvider` rewrite, loses `Deno.Kv` typing/versionstamps, and adds a paradigm shift for no benefit over a Deno-native KV. The user's "Redis may be overkill" intuition is correct.

### 5. Storage: S3 (Cloudflare R2), not local volumes

**Choice:** `STORAGE_DRIVER=s3` in the `prod` profile. The API's `S3_*` env vars point at Cloudflare R2. No `/app/uploads` volume is needed on the API container.

**Rationale (per Q4):**
- The codebase already has a complete S3 driver and an S3-compatible dev backend (Garage). Switching to R2 in prod is a pure env-var change.
- Decouples uploads from the Coolify server's filesystem — survives server migration, redeploy, and scaling.
- The `/uploads/*` serving route in `main.ts:79-113` is only registered when `STORAGE_DRIVER === 'local'`; with `s3`, uploads are served directly from R2's public URL (`S3_PUBLIC_URL`), so the API doesn't serve file bytes at all.

### 6. Subdomain routing with CORS

**Choice (per Q1/Q2):** `https://brewform.example.com` → web (Caddy), `https://api.brewform.example.com` → API. `VITE_API_URL=https://api.brewform.example.com/api/v1` is baked into the web image. `CORS_ALLOWED_ORIGINS=https://brewform.example.com` is set on the API.

**Rationale:**
- Clean separation; the API can be scaled or moved independently.
- The API already has a `cors()` middleware (`apps/api/src/middleware/cors.ts`) and `CORS_ALLOWED_ORIGINS` env var (read in `apps/api/src/config/env.ts`).
- Two TLS certs via Coolify's automatic Let's Encrypt.
- The web image's `VITE_API_URL` is an absolute URL → the SPA makes cross-origin requests to the API subdomain.

**Healthcheck paths** (verified from `apps/api/src/routes/health.ts`): the API exposes `GET /health` (liveness, 200 `{ status: 'ok' }`) and `GET /ready` (readiness, 200 or 503). These are at the **root**, not under `/api/v1`. Coolify healthcheck should use `/health`.

### 7. GitHub Actions: build + push to GHCR, public images

**Choice (per Q6/Q7):** A `release.yml` workflow on `push: branches: [main]` and `push: tags: ['v*']`. Two jobs (`api`, `web`) using `docker/build-push-action@v6` with `GITHUB_TOKEN` (`packages: write`). Tag images with `latest`, the short SHA, and the git tag (on tag pushes). Images are **public** (GHCR default for an open-source repo with `GITHUB_TOKEN`).

**Rationale:**
- `GITHUB_TOKEN` is automatically available in Actions; no PAT needed for push. `packages: write` is granted via the workflow `permissions:` block.
- Public images mean Coolify can `docker pull` with **no `docker login`** on the server (Q7). This eliminates the one-time server setup step entirely.
- The existing `ci.yml` (quality + tests) is untouched and runs independently; `release.yml` is a separate workflow.

**Reference `.github/workflows/release.yml`** (the implementer should follow this shape):
```yaml
name: Release (Build & Push Images)

on:
  push:
    branches: [main]
    tags: ['v*']

permissions:
  contents: read
  packages: write

jobs:
  api:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Build and push API image
        uses: docker/build-push-action@v6
        with:
          context: .
          file: ./Dockerfile
          push: true
          tags: |
            ghcr.io/ardakilic/brewform-api:latest
            ghcr.io/ardakilic/brewform-api:${{ github.sha }}
            ${{ startsWith(github.ref, 'refs/tags/v') && format('ghcr.io/ardakilic/brewform-api:{0}', github.ref_name) || '' }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Build and push Web image
        uses: docker/build-push-action@v6
        with:
          context: .
          file: ./Dockerfile.web
          push: true
          build-args: |
            VITE_API_URL=${{ secrets.VITE_API_URL || '/api/v1' }}
            VITE_PUBLIC_APP_URL=${{ secrets.VITE_PUBLIC_APP_URL || 'http://localhost:8080' }}
          tags: |
            ghcr.io/ardakilic/brewform-web:latest
            ghcr.io/ardakilic/brewform-web:${{ github.sha }}
            ${{ startsWith(github.ref, 'refs/tags/v') && format('ghcr.io/ardakilic/brewform-web:{0}', github.ref_name) || '' }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    runs-on: ubuntu-latest
    needs: [api, web]
    if: ${{ secrets.COOLIFY_API_WEBHOOK != '' }}
    steps:
      - name: Trigger Coolify deploy webhooks
        run: |
          curl --request GET '${{ secrets.COOLIFY_API_WEBHOOK }}' \
               --header 'Authorization: Bearer ${{ secrets.COOLIFY_API_TOKEN }}' || true
          curl --request GET '${{ secrets.COOLIFY_WEB_WEBHOOK }}' \
               --header 'Authorization: Bearer ${{ secrets.COOLIFY_API_TOKEN }}' || true
```
> **Note:** The `if: ${{ secrets.COOLIFY_API_WEBHOOK != '' }}` pattern is how GitHub Actions skips a job when a secret is unset. The `|| true` on the curls prevents a transient webhook failure from failing the whole release. The `cache-from/cache-to: type=gha` uses GitHub Actions cache for layer caching (speeds up rebuilds).

### 8. Compose `prod` profile mirrors Coolify

**Choice:** `compose.yml` has `dev` (existing services, unchanged) and `prod` profiles. The `prod` profile defines `app` (image: `ghcr.io/ardakilic/brewform-api:latest`), `web` (image: `ghcr.io/ardakilic/brewform-web:latest`), `denokv`, and `postgres`. `docker compose --profile prod up --build` rebuilds the images locally for a smoke test; `docker compose --profile prod up` pulls the published images.

**Reference `compose.yml` prod-profile additions** (the implementer appends these services; the existing services stay):
```yaml
  # ── API — production (pulls published image) ──────────────────────────────
  # Started via `make prod-up` (profile: prod). Pulls ghcr.io/ardakilic/brewform-api:latest.
  # For local image builds, use `make prod-up-build` (--build overrides the image:).
  app-prod:
    image: ghcr.io/ardakilic/brewform-api:latest
    ports:
      - "8000:8000"
    env_file:
      - .env
    depends_on:
      postgres:
        condition: service_healthy
      denokv:
        condition: service_healthy
    profiles:
      - prod

  # ── Web — production (pulls published image) ────────────────────────────────
  # Caddy serving the pre-built SPA. No runtime env (VITE_* baked in at image build).
  web-prod:
    image: ghcr.io/ardakilic/brewform-web:latest
    ports:
      - "8080:80"
    depends_on:
      app-prod:
        condition: service_started
    profiles:
      - prod
```
And the `denokv` service (shared by both profiles, so it's defined once with no profile, or listed in both — the implementer should add it once and add `denokv` to the `dev` `app`/`app-preview` `depends_on`):
```yaml
  # ── denokv — remote Deno KV cache sidecar ───────────────────────────────────
  # Used by the API when CACHE_DRIVER=deno-kv. Shared across dev and prod profiles.
  denokv:
    image: ghcr.io/denoland/denokv:0.14.0
    command: ["--sqlite-path", "/data/denokv.sqlite", "serve", "--access-token", "${DENO_KV_ACCESS_TOKEN}"]
    volumes:
      - denokv_data:/data
    healthcheck:
      test: ["CMD-SHELL", "deno eval \"const r = await fetch('http://localhost:4512/'); if (!r.ok) Deno.exit(1)\" || exit 1"]
      interval: 5s
      timeout: 3s
      retries: 5
    # No profile — starts with both `make up` (infra) and `make prod-up`.
```
> **Note:** The healthcheck uses `deno eval` with a fetch to `http://localhost:4512/` — denokv responds to HTTP HEAD/GET on its listen port. If this proves unreliable, the implementer can use a simple TCP check `["CMD-SHELL", "nc -z localhost 4512 || exit 1"]` (but `nc` may not be in the distroless image; `deno eval` is safer since Deno is in the image... actually `denokv` is a Rust binary, not Deno). **The implementer should verify whether `ghcr.io/denoland/denokv:0.14.0` includes any shell or `nc`** — if not, use a Docker-level healthcheck via Coolify's UI instead of a compose healthcheck. The safest compose healthcheck is `["CMD", "denokv", "ping"]` if such a subcommand exists (check denokv CLI). **Action: the implementer must verify the healthcheck command works against the denokv image; if not, remove the healthcheck from compose and rely on Coolify's UI healthcheck or the API's connection-retry behavior.**

Add `denokv_data` to the top-level `volumes:` block:
```yaml
volumes:
  postgres_data:
  garage_data:
  garage_meta:
  deno_cache:
  node_modules:
  denokv_data:
```

**Rationale:**
- The user explicitly wants "local should be almost same as remote." The `prod` profile is the local mirror of the Coolify topology.
- `--build` overrides the `image:` field and builds from the local `Dockerfile`/`Dockerfile.web`, useful for testing image changes before pushing.
- Coolify itself does not use this compose file (it creates two Docker Image resources), but the file is the source of truth for the image references, env surface, and volume definitions that the Coolify plan documents.

### 9. Makefile targets

**Choice:** Add:
- `make images` — `docker build` both images locally (tags them as `ghcr.io/ardakilic/brewform-api:latest` and `ghcr.io/ardakilic/brewform-web:latest`).
- `make images-push` — `docker push` both to GHCR (requires local `docker login ghcr.io` first).
- `make prod-up` — `docker compose --profile prod up -d` (pulls published images).
- `make prod-up-build` — `docker compose --profile prod up -d --build` (builds locally).
- `make prod-down` — `docker compose --profile prod down`.
- `make release` — `make images && make images-push` (local equivalent of the CI release job).

**Reference Makefile additions** (appended after the existing targets):
```makefile
# --- Production Images & Deploy ---

images: ## Build both Docker images locally (API + Web)
	docker build -t ghcr.io/ardakilic/brewform-api:latest -f Dockerfile .
	docker build -t ghcr.io/ardakilic/brewform-web:latest -f Dockerfile.web \
	  --build-arg VITE_API_URL=$${VITE_API_URL:-/api/v1} \
	  --build-arg VITE_PUBLIC_APP_URL=$${VITE_PUBLIC_APP_URL:-http://localhost:8080} \
	  .

images-push: ## Push both images to GHCR (requires: docker login ghcr.io)
	docker push ghcr.io/ardakilic/brewform-api:latest
	docker push ghcr.io/ardakilic/brewform-web:latest

prod-up: ## Start production profile (pulls published images from GHCR)
	docker compose --profile prod up -d

prod-up-build: ## Start production profile (builds images locally)
	docker compose --profile prod up -d --build

prod-down: ## Stop production profile
	docker compose --profile prod down

release: images images-push ## Build and push both images (local CI equivalent)
```
Update `.PHONY` to include: `images images-push prod-up prod-up-build prod-down release`.

**Rationale:** Mirrors the existing Makefile style (Docker-through, no local Deno). Existing targets are untouched.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| **`denokv` is pre-1.0 (0.14.0)** — CLI flags / protocol may change. | Pin the image to `0.14.0` (not `:latest`) in compose. The `Deno.openKv(url)` API is stable; only the server CLI could change. Upgrade deliberately. |
| **denokv healthcheck command uncertainty** — the `ghcr.io/denoland/denokv:0.14.0` image is distroless (`gcr.io/distroless/cc-debian12`); it may not have `sh`, `nc`, or `curl`. | The implementer must verify whether a compose `healthcheck.test` command works. If not, remove the compose healthcheck and use Coolify's UI healthcheck (HTTP path `/`) or rely on the API's connection-retry behavior (the API will fail to start if `denokv` is unreachable, which is the desired fail-fast behavior). |
| **Seed-once check (`SELECT count(*) FROM users`) could be wrong** if the admin is deleted manually. | Document that the check is "empty DB = first boot." If the admin is deleted, the user should re-seed manually via `docker exec ... deno run --allow-all packages/db/src/seed.ts` (idempotent). |
| **`deno eval` for the count check** may have issues resolving `@brewform/db` in the entrypoint context. | Fall back to a standalone script file `scripts/check-users-empty.ts` that imports from `@brewform/db` and prints the count. The entrypoint calls `deno run -A /app/scripts/check-users-empty.ts` and reads stdout. |
| **Public GHCR images expose the built artifact** but not source (source is already public). | Acceptable — the repo is open-source; images are a convenience. No secrets are baked into images (all env is runtime). |
| **`denokv` single-writer SQLite** limits horizontal scaling. | Documented as a non-goal. One API replica is the target. The `CacheProvider` abstraction makes a future switch to Deno Deploy KV or a managed KV a one-line change. |
| **`denokv` has no built-in TLS** — plain HTTP on port 4512. | Acceptable for intra-Docker-network traffic on a single host. For cross-host, front with Caddy/nginx (documented in `coolify_deployment_plan.md`). |
| **Web image bakes `VITE_API_URL` at build time** — changing the API domain requires rebuilding the web image. | Acceptable — the API domain is stable. For a domain change, rebuild and push the web image (a one-line `ARG` change + push). |
| **Migration runs on every boot** — if a migration fails, the API won't start. | This is desired behavior (fail fast). Drizzle migrations are transactional; a failed migration leaves the DB unchanged and the container restarts. |
| **`--unstable-kv` flag** may be stabilized in a future Deno, making the flag a no-op. | Harmless — Deno ignores unknown unstable flags gracefully in practice; if it errors, the entrypoint is a one-line fix. |
| **`Caddyfile` port mismatch** — repo-root `Caddyfile` is `:8080`, the web image needs `:80`. | The web Dockerfile bakes its own `:80` Caddyfile (via inline `printf` or `Caddyfile.prod`). The repo-root `Caddyfile` stays `:8080` for the preview profile. No conflict. |

## Open Questions

- Should the `release.yml` workflow also build on PRs (for a smoke test) or only on `main`/tags? **Decision: only on `main` and tags** — PR builds would publish `latest`-bound images prematurely. PRs run `ci.yml` (quality + tests) only.
- Should the `prod` compose profile include `mailpit` for local prod-smoke-testing? **Decision: No** — `prod` is a mirror of Coolify; email goes to a real SMTP provider. `mailpit` stays in `dev` only.
- Should the API image include `drizzle-kit` in the final runner stage (for the entrypoint migration)? **Decision: Yes** — the runner copies the full `/app` from the builder (including `node_modules` with `drizzle-kit` via `npm:drizzle-kit@0.31.10`). No extra layer needed.
- Should the denokv compose healthcheck use `deno eval`, `nc`, or be omitted? **Decision: the implementer must verify** — `ghcr.io/denoland/denokv:0.14.0` is distroless and may lack a shell. If no working healthcheck command is found, omit the compose healthcheck and rely on (a) the API failing to start if denokv is down (fail-fast), or (b) Coolify's UI HTTP healthcheck on the denokv resource (path `/`).