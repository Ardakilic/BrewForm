# BrewForm — Coolify Deployment Plan

> **Status:** This document is the step-by-step operator guide for deploying BrewForm on a
> self-hosted **Coolify** instance. It assumes the OpenSpec change
> `d30-coolify-ghcr-deployment` has been **implemented** — i.e. the two Docker images exist on
> GHCR, and the `publish` job of `.github/workflows/ci.yml` publishes them after every `main`
> push whose CI jobs (quality, tests, image smoke tests, doc-drift) all passed.
>
> If the implementation has NOT been done yet, the "Codebase prerequisites" section below tells
> you what must land first; the Coolify steps are what you do in the Coolify panel.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Codebase prerequisites (implement & merge first)](#2-codebase-prerequisites-implement--merge-first)
3. [Prerequisites (Coolify server)](#3-prerequisites-coolify-server)
4. [Step 0 — Pre-flight (before any Coolify work)](#step-0--pre-flight-before-any-coolify-work)
5. [Step 1 — Create the Coolify-managed PostgreSQL database](#step-1--create-the-coolify-managed-postgresql-database)
6. [Step 2 — Cache: in-memory default (no sidecar)](#step-2--cache-in-memory-default-no-sidecar)
7. [Step 3 — Deploy the API (Docker Image resource)](#step-3--deploy-the-api-docker-image-resource)
8. [Step 4 — Deploy the Web SPA (Docker Image resource)](#step-4--deploy-the-web-spa-docker-image-resource)
9. [Step 5 — Domains, TLS, and CORS](#step-5--domains-tls-and-cors)
10. [Step 6 — Persistent storage (uploads only; cache needs none)](#step-6--persistent-storage-uploads-only-cache-needs-none)
11. [Step 7 — First deploy: migrations & seed](#step-7--first-deploy-migrations--seed)
12. [Step 8 — Cloudflare R2 for uploads](#step-8--cloudflare-r2-for-uploads)
13. [Step 9 — Email (SMTP)](#step-9--email-smtp)
14. [Step 10 — Redeploy after CI publishes](#step-10--redeploy-after-ci-publishes)
15. [Post-deploy verification checklist](#post-deploy-verification-checklist)
16. [Troubleshooting](#troubleshooting)
17. [Maintenance & upgrades](#maintenance--upgrades)

---

## 1. Architecture Overview

```
                          ┌────────────────────────────────────────────────────┐
                          │                  Coolify server                     │
                          │                                                     │
                          │  ┌───────────────────────────────────────────────┐  │
                          │  │  Coolify-managed PostgreSQL                    │  │
                          │  │  (New Resource → Databases → PostgreSQL)      │  │
                          │  │  internal hostname: postgresql-<uuid>          │  │
                          │  │  Connection tab → copy DATABASE_URL            │  │
                          │  └───────────────────┬───────────────────────────┘  │
                          │                      │ same Docker destination      │
                          │     ┌────────────────┴─────────────────┐           │
                          │     ▼                                  ▼           │
                          │ ┌──────────────────┐         ┌──────────────────┐  │
                          │ │ Docker Image res  │         │ Docker Image res  │  │
                          │ │ brewform-api      │         │ brewform-web      │  │
                          │ │                  │         │                  │  │
                          │ │ image:           │         │ image:           │  │
                          │ │ ghcr.io/ardakilic │         │ ghcr.io/ardakilic │  │
                          │ │ /brewform-api     │         │ /brewform-web     │  │
                          │ │   :latest         │         │   :latest         │  │
                          │ │                  │         │                  │  │
                          │ │ port: 8000       │         │ port: 80 (Caddy) │  │
                          │ │ env: DATABASE_URL│         │ env: (none;      │  │
                          │ │  JWT_SECRET      │         │  VITE_* baked in) │  │
                          │ │  CACHE_DRIVER=   │         │                  │  │
                          │ │   memory         │         │ domain:           │  │
                          │ │  S3_* → R2       │         └──────────────────┘  │
                          │ │  SMTP_* → real   │                                │
                          │ │  CORS_ALLOWED_   │                                │
                          │ │   ORIGINS=        │                                │
                          │ │   https://brewform                                │
                          │ │   .example.com    │                                │
                          │ │                  │                                │
                          │ │ domain:          │                                │
                          │ │  api.brewform.   │                                │
                          │ │   example.com    │                                │
                          │ └────────┬─────────┘                                │
                          └────────────────────────────────────────────────────┘
                                          │
                           ┌──────────────┴──────────────┐
                           ▼                             ▼
                  ┌─────────────────┐          ┌─────────────────────┐
                  │ Cloudflare R2    │          │  GitHub Actions      │
                  │ (S3-compatible)  │          │  ci.yml              │
                  │ bucket:          │          │                      │
                  │  brewform-uploads│          │  PRs + main: build + │
                  │                  │          │   smoke-test images  │
                  │ S3_* env → API   │          │  main/v* push: the   │
                  │ S3_PUBLIC_URL →  │          │   publish job pushes │
                  │  R2 public URL   │          │   to GHCR after all  │
                  └─────────────────┘          │   jobs passed        │
                                               └─────────────────────┘
```

**Key points:**
- **Two Docker Image resources** in Coolify (API + web), each with its own env and domain.
- **One Coolify-managed PostgreSQL**, shared via the internal Docker network.
- **No cache sidecar by default** — the API runs with `CACHE_DRIVER=memory` (in-process).
  A shared Redis backend is optional via `CACHE_DRIVER=redis` + `REDIS_URL` (any
  Redis-protocol server: Redis or Valkey).
- **Cloudflare R2** for uploads (S3-compatible) — nothing stored on the Coolify server's disk.
- **GitHub Actions** publishes images to GHCR; Coolify just pulls.

---

## 2. Codebase prerequisites (implement & merge first)

This is the **prerequisite implementation checklist** for the `d30-coolify-ghcr-deployment`
OpenSpec change and its wave-6 follow-ups. Every row has shipped on `main`; the table records
what each piece is. Rows for removed mechanisms (the `compose.yml` `prod` profile, the
separate `release.yml` workflow and its webhook deploy job, `make images-push`/`make release`)
were deleted.

> **Install command:** the Docker `deps` stages install dependencies with `pnpm fetch` followed
> by `pnpm install --frozen-lockfile --offline`, and CI with `pnpm install --frozen-lockfile`,
> never a plain `pnpm install`. The frozen install fails fast if `pnpm-lock.yaml` is missing or
> out of date.

| # | Change | File(s) | Status |
|---|--------|---------|--------|
| 1 | API Dockerfile: `node:<version>-trixie-slim` stages (`pnpm fetch` + frozen offline install); `builder` runs `pnpm run email-build` + the `tsc` gate; a `prod-deps` stage keeps production dependencies only; the `runner` runs as the non-root `node` user under `tini` with a `HEALTHCHECK` (`node /app/healthcheck.mjs /ready`) and contains no pnpm, tsx or drizzle-kit | `Dockerfile`, `apps/api/scripts/healthcheck.mjs` | Done |
| 2 | `docker-entrypoint.sh [serve\|migrate]`: runs `node /app/packages/db/src/migrate.ts` (the `@brewform/db` migration runner), checks the `users` row count and seeds only an empty database (first boot), then `exec node src/main.ts`; `RUN_MIGRATIONS=false` skips the migrations in `serve` mode | `docker-entrypoint.sh` | Done |
| 3 | Web Dockerfile: 3-stage build (node deps → vite build with `VITE_*` ARGs → `caddy:2.11.9-alpine` serving `dist/` on port 80) | `Dockerfile.web` | Done |
| 4 | Self-hosting definition `compose.production.yml` (postgres, valkey, one-shot migrate, api, web edge, backup, profile-gated restore); `compose.yml` has no production services | `compose.production.yml` | Done |
| 5 | In-memory `CacheProvider` default in `main.ts`; in-process `node-cron` badge evaluation | `apps/api/src/main.ts`, `apps/api/src/utils/jobs/` | Done |
| 6 | `CACHE_DRIVER=memory` pinned in `.env.example` files (no cache sidecar to configure) | `.env.example`, `apps/api/.env.example` | Done |
| 7 | `.env.example` split into three files: root (local-dev infra), `apps/api/.env.example` (API runtime for Coolify), `apps/web/.env.example` (web build-time for GitHub Secrets) | `.env.example`, `apps/api/.env.example`, `apps/web/.env.example` | Done |
| 8 | One CI workflow: pull requests and `main` build and smoke-test both images; the `publish` job pushes the tested images to GHCR (`latest` on `main`, `<full sha>`, `vX.Y.Z` tags) only after every job passed | `.github/workflows/ci.yml` | Done |
| 9 | Makefile targets (`images` builds `:local` tags; `prod-*` wrap `compose.production.yml`; no target pushes images) | `Makefile` | Done |
| 10 | This document | `coolify_deployment_plan.md` | Done |

**Health endpoints** (verified in `apps/api/src/modules/health/`):
- `GET /health` — liveness, returns `200 { status: 'ok' }` (no DB check)
- `GET /ready` — readiness, returns `200` with `status: 'ready'` or `503` with `status: 'not_ready'`
  (checks the DB); the body always has `status`, `db`, `cache`, `rateLimitStore`, `storage` and
  `shuttingDown`
- These are at the **root** (`/health`, `/ready`), NOT under `/api/v1/`

**Verify the images exist on GHCR before proceeding:**
```
https://github.com/Ardakilic/BrewForm/pkgs/container/brewform-api
https://github.com/Ardakilic/BrewForm/pkgs/container/brewform-web
```
If the first `publish` job of the `CI` workflow has completed on `main`, both packages should be
visible. If they
default to **private**, flip them to **public** once:
- GitHub → your profile → Packages → `brewform-api` → Package settings → Change visibility → Public
- Repeat for `brewform-web`

---

## 3. Prerequisites (Coolify server)

- A running **Coolify** instance (v4.x) on your VPS, with a server added and a **destination**
  (Docker network) configured. Most Coolify installs create a `coolify` destination on first
  server setup.
- DNS records pointing to your Coolify server's IP:
  - `brewform.example.com` → Coolify server IP (web SPA)
  - `api.brewform.example.com` → Coolify server IP (API)
  - (Replace `example.com` with your actual domain.)
- **Verify DNS + firewall before deploying:** confirm both records actually resolve to the
  server (`dig +short brewform.example.com` / `dig +short api.brewform.example.com`) and that
  inbound ports **80/443** are open in the VPS firewall/security group — Let's Encrypt's
  HTTP-01 challenge fails otherwise.
- **Host architecture:** the published GHCR images are **amd64-only**. On an **ARM64** Coolify
  host they fail with `exec format error`. Either run on an amd64 host, or rebuild the images
  multi-arch (`platforms: linux/amd64,linux/arm64` plus `docker/setup-qemu-action` in the
  `images`/`publish` jobs of `ci.yml`), or build them on the host with `make images`.
- **No `docker login` required** — the GHCR images are public. If you later make them private,
  SSH into the Coolify server and run:
  ```bash
  echo $GH_PAT | docker login ghcr.io -u ardakilic --password-stdin
  ```
  where `$GH_PAT` is a GitHub PAT with `read:packages` scope.

---

## Step 0 — Pre-flight (before any Coolify work)

> **Pinned runtime:** BrewForm runs on **Node 26 LTS**, and pnpm is pinned exactly. The
> authoritative pins are `.nvmrc`, the root `package.json` `engines` / `devEngines` /
> `packageManager` fields, and the `FROM node:<version>-trixie-slim` lines of `Dockerfile` and
> `Dockerfile.web` (deps/builder stages); Renovate bumps them, so this plan does not repeat patch
> versions. CI installs pnpm via `pnpm/action-setup` and Node from `.nvmrc`. If you fork or
> rebuild an image, keep the base on a pinned `node:26.x.y-trixie-slim` tag.

Do all of this **before** you touch the Coolify panel. The web image bakes its config at build
time, so getting these wrong means rebuilding and republishing images later.

1. **Confirm the deployment files exist on `main`** (they have shipped):
   - `Dockerfile.web`
   - `docker-entrypoint.sh`
   - `.github/workflows/ci.yml` (with its `images` and `publish` jobs)

   (See [Section 2](#2-codebase-prerequisites-implement--merge-first) for the full prerequisite
   checklist.)

2. **Keep `.dockerignore` excluding env files.** It ignores `.env`, `*.env`, `.env.*` (and their
   `**/` forms) while **keeping** `*.env.example`. Both `Dockerfile` and `Dockerfile.web` do
   `COPY . .`, so without this a local `make images` would bake your real `.env` secrets into the
   image. Images are published only by CI's `publish` job; no Makefile target pushes them.

3. **Set the GitHub repo Secrets before the first push to `main`** (optional). The `images` job
   of `ci.yml` bakes them into the web image on `main` pushes; unset, the image bakes `/api/v1`
   and `http://localhost:8080` (the runtime `VITE_API_URL` / `PUBLIC_APP_URL` on the web
   resource override both without a rebuild):
   - `VITE_API_URL=https://api.brewform.example.com/api/v1`
   - `VITE_PUBLIC_APP_URL=https://brewform.example.com`
   No Coolify webhook or token secrets are used.

4. **Push to `main`, wait for the `CI` run's `publish` job to finish, then make both packages
   public.** Once the first publish completes, flip both GHCR packages to **Public** (GitHub → Packages →
   `brewform-api` / `brewform-web` → Package settings → Change visibility → Public).

5. **Verify DNS + firewall.** Confirm both records resolve to the server and inbound ports 80/443
   are open (Let's Encrypt's HTTP-01 challenge needs them):
   ```bash
   dig +short brewform.example.com
   dig +short api.brewform.example.com
   ```

---

## Step 1 — Create the Coolify-managed PostgreSQL database

1. In Coolify: **New Resource → Databases → PostgreSQL**.
2. Name it (e.g. `brewform-db`), choose your server and destination, and click **Create**.
3. Wait for the database container to be healthy (Coolify shows a green status).
4. Go to the database's **Connection** tab. You'll see:
   - **Internal URL** (e.g. `postgresql://postgres:<password>@postgresql-<uuid>:5432/brewform`)
   - Host, port, db name, username, password
5. **Copy the internal hostname** (e.g. `postgresql-a1b2c3d4`). You'll use this in the API's
   `DATABASE_URL` env var.
6. **Keep the database internal** (no public port) — the API will reach it over the Docker
   network. Exposing Postgres to the internet is a security risk.

> **Note:** Coolify names the managed PostgreSQL container with an **engine prefix** — typically
> `postgresql-<uuid>` (not `postgres-<uuid>`, and not your resource name). Always copy the exact
> hostname from the Connection tab — don't guess.

---

## Step 2 — Cache: in-memory default (no sidecar)

There is **no cache resource to create**. The API runs with `CACHE_DRIVER=memory`: an
in-process Map with TTL support, wired at startup with no extra service to provision.

- Nothing to deploy, no internal hostname, no access token, no volume.
- Cache is lost on every API restart. This is acceptable because the cache is never a source
  of truth — Postgres is; entries rebuild on access.
- For a shared cache, set `CACHE_DRIVER=redis` + `REDIS_URL` (any Redis-protocol server)
  and provision it as an internal resource; the API needs no code changes.

---

## Step 3 — Deploy the API (Docker Image resource)

1. In Coolify: **New Resource → Docker Image**.
2. **Image:** `ghcr.io/ardakilic/brewform-api:latest`
3. **Port exposes:** `8000`
4. **Assign to the same destination** as the Postgres resource (critical — this
   is how the API reaches the DB over the internal Docker network).
5. **Environment Variables** — go to the **Environment Variables** tab and add each of the
   following. Use the Developer view (plain `.env` editor) to paste the whole block, then
   adjust the values. The `apps/api/.env.example` file in the repo is the canonical reference
   for this block — copy it and adjust the values:

   > **First-boot storage note:** with `STORAGE_DRIVER=s3` (below), the Zod schema requires all
   > `S3_*` values and validates `S3_ENDPOINT`/`S3_PUBLIC_URL` as **URLs**, so the `<account-id>`
   > placeholders make the API **exit on first boot**. For the first boot, either complete the R2
   > setup ([Step 8](#step-8--cloudflare-r2-for-uploads)) first and paste real values, **or**
   > temporarily set `STORAGE_DRIVER=local`, then switch to `s3` once R2 is ready.

   ```env
   # Application
   APP_PORT=8000
   APP_ENV=production
   LOG_LEVEL=info
   LOG_FORMAT=json
   PUBLIC_APP_URL=https://brewform.example.com
   APP_URL=https://brewform.example.com   # QR-code generation uses APP_URL (defaults to http://localhost:8000)

   # Database — use the INTERNAL hostname from the Postgres Connection tab
   DATABASE_URL=postgresql://postgres:<DB_PASSWORD>@postgresql-<uuid>:5432/brewform
   DATABASE_PROVIDER=postgresql

   # Cache — in-memory default (no sidecar); optional shared Redis via CACHE_DRIVER=redis + REDIS_URL
   CACHE_ENABLED=true
   CACHE_DRIVER=memory

   # Auth — generate a strong secret
   JWT_SECRET=<openssl-rand-hex-32-min-16-chars>
   JWT_ACCESS_EXPIRY=15m
   JWT_REFRESH_EXPIRY=7d
   JWT_REMEMBER_ME_EXPIRY=180d

   # Admin (seeded on first boot only)
   ADMIN_EMAIL=admin@yourdomain.com
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=<a-strong-password>

   # CORS — the web SPA's public origin
   CORS_ALLOWED_ORIGINS=https://brewform.example.com

   # Email — your real SMTP provider
   SMTP_HOST=smtp.your-provider.com
   SMTP_PORT=587
   SMTP_USER=<smtp-user>
   SMTP_PASS=<smtp-password>
   SMTP_SECURE=false   # 587 = STARTTLS → false; use 465 + true for implicit TLS
   EMAIL_FROM=noreply@yourdomain.com

   # OpenAPI
   OPENAPI_ENABLED=false

   # Registration
   ENABLE_REGISTRATION=true

   # Storage — Cloudflare R2 (Step 8)
   STORAGE_DRIVER=s3
   S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
   S3_REGION=auto
   S3_BUCKET=brewform-uploads
   S3_ACCESS_KEY=<R2-ACCESS-KEY>
   S3_SECRET_KEY=<R2-SECRET-KEY>
   S3_PUBLIC_URL=https://uploads.yourdomain.com
   ```

   **Replace every `<...>` placeholder** with your real values. Pay special attention to:
   - `DATABASE_URL` — must use the **internal hostname** (`postgresql-<uuid>`) and the password
     from the Postgres Connection tab.
   - `JWT_SECRET` — at least 16 characters (Zod enforces this); use `openssl rand -hex 32`.
   - `CORS_ALLOWED_ORIGINS` — the web SPA's public origin (no trailing slash).

6. **Persistent Storage:** none with `STORAGE_DRIVER=s3` (this plan; the cache is in-memory and
   uploads go to R2). With `STORAGE_DRIVER=local`, add a Volume Mount (`brewform-uploads` →
   `/app/uploads`) or a Directory Mount owned by `1000:1000`, plus the API network alias and
   `API_UPSTREAM` on the web resource — see `docs/deployment_coolify.md` §6 step 5.

7. **Healthcheck:** The API exposes `GET /health` (liveness, `200 { status: 'ok' }`) and
   `GET /ready` (readiness, checks the DB, `200` or `503`), both at the **root**, not under
   `/api/v1` (`apps/api/src/modules/health/`). In the Coolify UI set: Enabled, Type `CMD`,
   Command `node /app/healthcheck.mjs /ready`, Interval `15`, Timeout `5`, Retries `3`,
   Start period `180`. The `HTTP` type needs curl/wget, which the image does not ship; the `CMD`
   type runs the same probe as the image's own `HEALTHCHECK`. Uptime monitors use
   `https://api.brewform.example.com/health`, never `/ready`. Details:
   `docs/deployment_coolify.md` §6 step 4.

8. **Deploy.** Watch the logs. On first boot (empty database) you should see:
   ```
   Running database migrations...
   Migrations complete.
   Database is empty, running seed...
   Seeding complete!
   Admin ready (first install only; changing ADMIN_* later does not update the existing admin row)
   Starting BrewForm API...
   ```
   followed by the API's own structured logs (JSON or pretty per `LOG_FORMAT`). The
   `BrewForm API running on http://localhost:8000` line is logged unconditionally on boot.

   On subsequent boots (database already seeded), you'll see:
   ```
   Running database migrations...
   Migrations complete.
   Seed skipped — database already contains data (N users).
   Starting BrewForm API...
   ```

9. **If the API fails to start**, check:
   - `DATABASE_URL` hostname is correct and the DB container is on the same destination.
   - `JWT_SECRET` is at least 16 characters.
   - The migration SQL files are present in the image (they are, if the image built correctly).

---

## Step 4 — Deploy the Web SPA (Docker Image resource)

1. In Coolify: **New Resource → Docker Image**.
2. **Image:** `ghcr.io/ardakilic/brewform-web:latest`
3. **Port exposes:** `80`
4. **Assign to the same destination** as the API (so Caddy could proxy to the API if needed,
   though with subdomain routing the SPA talks to the API cross-origin via CORS).
5. **Environment Variables:** **Optional.** `VITE_API_URL` and `VITE_PUBLIC_APP_URL` are
   baked into the image at build time (by the `images` job of `ci.yml` via GitHub Secrets), so
   for this deployment you can leave the web resource's env **empty**. However, `VITE_API_URL`
   is **runtime-overridable**: set it as an env var on the web resource and the image's
   entrypoint writes it into `/config.js` at startup, overriding the baked default — handy for
   pointing a prebuilt image at a different API origin without a rebuild.

   > **Changing the API URL:** set `VITE_API_URL` on the web resource and redeploy (no rebuild
   > needed — the entrypoint regenerates `/config.js`). `VITE_PUBLIC_APP_URL` itself is
   > build-time only, but the optional runtime `PUBLIC_APP_URL` on the web resource rewrites the
   > `og:image`/`twitter:image` tags and the `robots.txt` `Sitemap:` line at startup, so a
   > domain change needs no rebuild. With `STORAGE_DRIVER=local`, also set
   > `API_UPSTREAM=brewform-api:8000` (same-origin edge; see `docs/deployment_coolify.md` §7).

6. **Healthcheck:** Enabled, Type `HTTP`, Method `GET`, Scheme `http`, Host `localhost`, Port
   `80`, Path `/healthz`, expected status `200`, Interval `30`, Timeout `3`, Retries `3`, Start
   period `10` (the web image ships BusyBox `wget`, so the `HTTP` type works here). Uptime
   monitors use `https://brewform.example.com/healthz`. Changes take effect after a Redeploy.
   Details: `docs/deployment_coolify.md` §7 step 4.

7. **Deploy.** Verify it starts: `curl http://<coolify-assigned-domain>/` should return the
   SPA's `index.html`.

---

## Step 5 — Domains, TLS, and CORS

### Web SPA domain
1. On the **web** resource's **General** tab, set the **FQDN** to:
   `https://brewform.example.com`
2. Coolify automatically provisions a Let's Encrypt certificate and configures its reverse
   proxy (Traefik/Caddy) to route traffic to the container's port 80.
3. Verify: `https://brewform.example.com` loads the SPA.

### API domain
1. On the **API** resource's **General** tab, set the **FQDN** to:
   `https://api.brewform.example.com`
2. Coolify provisions TLS automatically.
3. Verify liveness with `https://api.brewform.example.com/health` — it should return
   `200 { status: 'ok' }`, and `https://api.brewform.example.com/ready` should return `200`
   (or `503` if the DB is unreachable). This plan sets `OPENAPI_ENABLED=false` by default, so
   `https://api.brewform.example.com/api/v1/openapi.json` **404s** unless you enable it — only
   use the openapi endpoint as a check when `OPENAPI_ENABLED=true`.

### CORS verification
The API's `CORS_ALLOWED_ORIGINS=https://brewform.example.com` allows the web SPA (on
`https://brewform.example.com`) to make cross-origin requests to
`https://api.brewform.example.com`.

To verify CORS works, send a proper CORS **preflight** (an `OPTIONS` request with the
`Access-Control-Request-*` headers) and check the response headers:
```bash
curl -i -X OPTIONS \
  -H "Origin: https://brewform.example.com" \
  -H "Access-Control-Request-Method: GET" \
  https://api.brewform.example.com/health
```
The response should include:
```
access-control-allow-origin: https://brewform.example.com
```

If you see a CORS error in the browser console, double-check:
- `CORS_ALLOWED_ORIGINS` on the API exactly matches the web SPA's origin (scheme + host, no
  trailing slash, no port if it's 443).
- The API resource's domain is set and TLS is active (CORS headers are only sent on HTTPS
  responses in some configs).

---

## Step 6 — Persistent storage (uploads only; cache needs none)

Neither the API nor the web container needs a Coolify volume:

- Uploads go to R2 (`STORAGE_DRIVER=s3`), not to container disk.
- The API cache is in-memory and rebuilds on access — there is no cache volume to persist.

With `STORAGE_DRIVER=local` instead, the API needs Persistent Storage at `/app/uploads` (Volume
Mount `brewform-uploads`, or a Directory Mount owned by `1000:1000`), the API network alias and
`API_UPSTREAM` on the web resource, exactly as in `docs/deployment_coolify.md` §6 step 5.

To verify nothing depends on container disk, restart the API resource and confirm uploads
(still served from R2) and login still work.

---

## Step 7 — First deploy: migrations & seed

The API's `docker-entrypoint.sh` handles this automatically, with Node directly (the runtime
image contains neither pnpm nor drizzle-kit). On the first deploy (Step 3 above):

1. **Container starts** → `tini` runs `docker-entrypoint.sh` in its default `serve` mode.
2. **Migrations:** `node /app/packages/db/src/migrate.ts` (the `@brewform/db` migration runner,
   a drizzle-orm migrator with a `pg_trgm` pre-flight) applies the pending migration SQL files
   committed in `packages/db/drizzle/` against `DATABASE_URL`. This creates all tables.
3. **Seed check:** `node src/check-users-empty.ts` (cwd `/app/packages/db`) prints the `users`
   row count. If it is `0`, `node src/seed.ts` inserts the admin user, badges, equipment catalog,
   coffee varieties and the rest of the seed data.
4. **API starts:** `cd /app/apps/api && exec node src/main.ts` — one Node process (native
   TypeScript type stripping, no `dist/` build and no runtime flags); badge evaluation runs
   in-process via `node-cron`, once per replica.

Expected log lines: `Entrypoint mode: serve`, `Running database migrations...`,
`Migrations complete.`, `Database is empty, running seed...`, `Seeding complete.`,
`Starting BrewForm API...`.

On subsequent restarts/redeploys:
- Migrations run again (no-op if nothing pending).
- Seed is **skipped** (`Seed skipped — database already contains data (N users).`).
- API starts immediately.

> **If you ever need to re-seed** (e.g., to reset to a clean state), you can:
> 1. Open the running API container's Terminal in Coolify (or `docker exec -it <api container> sh`).
> 2. Run: `cd /app/packages/db && node src/seed.ts` — the seed is idempotent
>    (`onConflictDoNothing` on all inserts), so it won't overwrite or delete existing data.
> 3. To start completely fresh: drop the database in Coolify, recreate it, and restart the API
>    container (the entrypoint will re-migrate and re-seed).

> **Partial-seed recovery:** the seed runs only when the `users` table is empty. If the
> first-boot seed fails **partway** — after the admin row is inserted but before the rest — the
> count will be `>0` on the next boot and the seed is **skipped**, leaving a partially-seeded
> DB. To recover, either drop & recreate the database before a successful first boot, or manually
> re-run the (idempotent) seed as above.

> **Development and CI** run the same steps through the pnpm workspace scripts
> (`pnpm --filter @brewform/db run migrate` / `run seed`, or the root `pnpm run db:migrate` /
> `pnpm run db:seed`), inside the workspace defined by `pnpm-workspace.yaml`
> (`packages: ['apps/*', 'packages/*']`); drizzle-kit is used there only to generate migrations
> (`pnpm run db:generate`).

> **Secrets hygiene:** the seed never logs the admin password (it only says whether
> `ADMIN_PASSWORD` was set). **Change the admin password in-app after first login** anyway.

---

## Step 8 — Cloudflare R2 for uploads

BrewForm supports S3-compatible storage. Cloudflare R2 is the recommended target because it's
S3-compatible, has no egress fees, and decouples uploads from the Coolify server.

### Create the R2 bucket
1. In Cloudflare dashboard: **R2 → Create bucket** → name it `brewform-uploads` (or your
   preferred name).
2. Note the **S3 API endpoint**: `https://<account-id>.r2.cloudflarestorage.com`.
3. Generate **R2 API tokens**: R2 → Manage R2 API Tokens → Create API Token with **Object Read
   & Write** permissions for the bucket.
   - Save the **Access Key ID** and **Secret Access Key**.
4. (Optional) Set up a **public custom domain** for the bucket (e.g.
   `uploads.yourdomain.com`) so uploaded images are publicly accessible. In R2 → your bucket
   → Settings → Public Access → Connect Domain.

### Wire R2 into the API env
In the API resource's **Environment Variables** tab (already set in Step 3):
```env
STORAGE_DRIVER=s3
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=brewform-uploads
S3_ACCESS_KEY=<R2-ACCESS-KEY>
S3_SECRET_KEY=<R2-SECRET-KEY>
S3_PUBLIC_URL=https://uploads.yourdomain.com
```

When `STORAGE_DRIVER=s3`, the API uploads files directly to R2 and returns R2 public URLs to
the client. The API's `/uploads/*` serving route (active only when `STORAGE_DRIVER=local`) is
disabled, so no files are stored on the Coolify server.

### Verify
1. Log into the BrewForm web SPA as the admin (or any user).
2. Upload a recipe photo.
3. Confirm the image appears and its URL starts with `https://uploads.yourdomain.com/...`.
4. Confirm the file is visible in the R2 bucket in the Cloudflare dashboard.

---

## Step 9 — Email (SMTP)

Email is used for: email verification, password reset, and notifications. In production,
point the API at your real SMTP provider.

Recommended providers (any SMTP-relay works):
- **Resend** (`smtp.resend.com`, port 587, user `resend`, pass = your API key)
- **AWS SES** (`email-smtp.<region>.amazonaws.com`, port 587/465)
- **Postmark** (`smtp.postmarkapp.com`, port 587)
- **Mailgun** (`smtp.mailgun.org`, port 587)

Set in the API env (already in Step 3):
```env
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_USER=<your-smtp-username>
SMTP_PASS=<your-smtp-password>
SMTP_SECURE=false   # all providers above use port 587 (STARTTLS) → false
EMAIL_FROM=noreply@yourdomain.com
```

> **`SMTP_SECURE` rule (nodemailer):** `secure: false` = **STARTTLS** = port **587**;
> `secure: true` = **implicit TLS** = port **465**. So for the port-587 providers listed above,
> use `SMTP_SECURE=false`; only set `SMTP_SECURE=true` when you connect on port 465. Test by
> triggering a password reset email.

### Verify
1. Register a new user with a real email address.
2. Check the inbox for the verification email.
3. If no email arrives, check the API container logs for SMTP errors.

---

## Step 10 — Redeploy after CI publishes

There is no webhook deploy job. The `CI` workflow (`.github/workflows/ci.yml`) builds and
smoke-tests both images on every pull request and `main` push, and its `publish` job pushes them to
GHCR only after every other job passed. Redeploy from Coolify afterwards:

1. Wait until the `CI` run of the `main` commit is green, including `publish` (GitHub → Actions).
2. Coolify → **API** resource → **Redeploy**; wait until it is healthy (the new container runs the
   migrations while the old one keeps serving).
3. Coolify → **Web** resource → **Redeploy**.

To pin a version, set the resource's image tag to the full commit SHA or `vX.Y.Z` before
redeploying. A redeploy can be scripted with Coolify's own API
(`GET /api/v1/deploy?uuid=<resource uuid>` with a **Deploy** token), but no CI job calls it.
Remove the old `COOLIFY_API_TOKEN`, `COOLIFY_API_WEBHOOK` and `COOLIFY_WEB_WEBHOOK` repository
secrets if they still exist. The only optional secrets are `VITE_API_URL` and
`VITE_PUBLIC_APP_URL` (defaults baked into the published web image).

---

## Post-deploy verification checklist

Run through this after completing Steps 1–9.

- [ ] **Postgres** resource is healthy in Coolify.
- [ ] **API** container logs show: "Migrations complete." and either "Seeding complete!" or
      "Seed skipped — database already contains data (N users)."
- [ ] `https://api.brewform.example.com/health` returns `200 { status: 'ok' }` (liveness).
- [ ] `https://api.brewform.example.com/ready` returns `200 { status: 'ready', db: 'connected' }`
      (readiness — confirms DB connectivity).
- [ ] `https://api.brewform.example.com/api/v1/openapi.json` returns JSON **only if**
      `OPENAPI_ENABLED=true` (the plan defaults it to `false`, so this endpoint 404s by default —
      `/health` is the real liveness check).
- [ ] `https://brewform.example.com` loads the SPA (HTML, JS, CSS).
- [ ] **Login works:** log in as the admin user (credentials from the seed log or your
      `ADMIN_*` env).
- [ ] **Cache works:** load the recipe list twice and confirm the second load is fast (served
      from the in-memory cache). Note the cache does NOT survive an API restart — that is
      expected with `CACHE_DRIVER=memory`.
- [ ] **CORS works:** open the browser dev tools on `https://brewform.example.com`, log in,
      and confirm no CORS errors in the console. The API responses should include
      `access-control-allow-origin: https://brewform.example.com`.
- [ ] **Uploads work:** upload a recipe photo and confirm it's served from R2
      (`https://uploads.yourdomain.com/...`).
- [ ] **Email works:** trigger a password reset and confirm the email arrives.
- [ ] **TLS:** both domains show valid Let's Encrypt certificates (no browser warnings).
- [ ] **Redeploy:** trigger a redeploy of the API in Coolify and confirm it comes back up
      (migrations no-op, seed skipped, API starts).

---

## Troubleshooting

### API container fails to start: "Invalid environment variables"
The Zod env schema in `apps/api/src/config/env.ts` validates all env vars at startup. A
missing or invalid required var causes an immediate exit with the field errors logged.
- **Fix:** Check the API resource's Environment Variables tab for missing/empty values.
  Common culprits: `DATABASE_URL` (must be a valid postgresql:// URL), `JWT_SECRET` (min 16
  chars), `CACHE_DRIVER` (must be `memory` or `redis`).

### API can't reach the database: connection refused / timeout
- **Cause:** The API and Postgres are not on the same Docker destination, or the
  `DATABASE_URL` hostname is wrong.
- **Fix:** In Coolify, ensure both resources are assigned to the **same destination** (Docker
  network). Use the exact internal hostname from the Postgres Connection tab (e.g.
  `postgresql-<uuid>`, not `localhost` or `postgres`).

### CORS errors in the browser
- **Symptom:** `Access to fetch at 'https://api...' from origin 'https://brewform...' has been
  blocked by CORS policy`.
- **Fix:** `CORS_ALLOWED_ORIGINS` on the API must exactly match the web origin
  (`https://brewform.example.com`, no trailing slash). Restart the API after changing it.
- **Preflight (OPTIONS) failing:** for non-simple requests the browser first sends a CORS
  **preflight** (`OPTIONS` with `Access-Control-Request-*` headers). If that request 4xx/5xxs,
  the real request never fires and you see a CORS error. Reproduce it directly and confirm the
  `access-control-allow-origin` header comes back — see the `curl -i -X OPTIONS` example in
  [Step 5](#step-5--domains-tls-and-cors).

### Uploads return 404 / broken images
- **Cause:** `STORAGE_DRIVER=s3` but R2 credentials/endpoint are wrong, or
  `S3_PUBLIC_URL` doesn't resolve.
- **Fix:** Verify `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, and `S3_PUBLIC_URL` in the
  API env. Test R2 connectivity from the API container's Terminal (the image ships no curl or
  wget, so use Node):
  `node -e "fetch('https://<account-id>.r2.cloudflarestorage.com/brewform-uploads/',{method:'HEAD'}).then(r=>console.log(r.status))"`
  (any HTTP status, even `403`, proves the endpoint is reachable).

### Migrations fail on startup
- **Symptom:** Container logs show a Drizzle migration error and exits.
- **Cause:** Usually a DB connectivity issue, or a migration file is missing from the image.
- **Fix:** Verify `DATABASE_URL` is correct and the DB is reachable. Migration files are committed
  in `packages/db/drizzle/` (CI fails when a schema change lacks its migration) and copied into the
  image; a missing file means the image is not from a green `CI` run — redeploy a published tag.

### Seed runs on every restart (not just first boot)
- **Cause:** The `users` table is empty (e.g., the admin was deleted, or the DB was wiped).
- **Fix:** This is by design. If you don't want the seed to run, ensure the `users` table has
  at least one row. If you want to re-seed intentionally, the `onConflictDoNothing` makes it
  safe to run repeatedly.

### Seed skipped after a failed first boot (partial seed)
- **Cause:** The first-boot seed runs only when `SELECT count(*) FROM users` is `0`. If it fails
  **partway** — after the admin row is inserted but before the rest — the count is now `>0`, so
  the next boot **skips** the seed, leaving a partially-seeded database.
- **Fix:** Either drop & recreate the database and let the API re-seed on a clean first boot, or
  manually re-run the idempotent seed from the API container's Terminal:
  `cd /app/packages/db && node src/seed.ts` (the image has no pnpm; see
  [Step 7](#step-7--first-deploy-migrations--seed)).

### GHCR pull fails: "image not found"
- **Cause:** The `publish` job of the `CI` workflow hasn't run yet (it runs only on `main`/`v*`
  pushes after every other job passed), or the images are private and the server isn't logged in.
- **Fix:** Push a commit to `main` and wait for a green `CI` run including `publish`. If the package is private on
  GHCR, either flip it to public (GitHub → Packages → brewform-api → Package settings →
  Public) or SSH into the Coolify server and `docker login ghcr.io`.

---

## Maintenance & upgrades

### Updating BrewForm
1. Merge a PR to `main` (or push a `v*` tag for a versioned release).
2. The `CI` workflow tests the commit and builds and smoke-tests both images; only after every
   job passed does its `publish` job push those exact images as `:latest` and `:<full sha>`
   (and `:vX.Y.Z` for a tag) to GHCR.
3. Go to each Coolify resource → click **Redeploy** (API first, then web; see
   [Step 10](#step-10--redeploy-after-ci-publishes)).
4. The API entrypoint re-runs migrations (no-op if nothing new) and skips the seed (DB is not
   empty).

### Rollback

Coolify resources track the `:latest` tag, so you roll back a bad deploy by pinning to a
known-good immutable tag. CI's `publish` job pushes `:<full commit sha>` (and `:vX.Y.Z` for
version tags) alongside `:latest`. To roll back:
1. On the affected resource (API and/or web), change the image tag from `:latest` to a specific
   `:<commit-sha>` or `:vX.Y.Z`.
2. **Redeploy** — Coolify pulls the pinned image.
3. Once a fix ships, switch the tag back to `:latest`.

### Cache backend (optional shared Redis)

The API cache is in-memory by default (`CACHE_DRIVER=memory`) and needs no maintenance.
For a shared cache, set `CACHE_DRIVER=redis` + `REDIS_URL` pointing at any Redis-protocol
server (Redis or Valkey).

### Backing up data
- **Postgres:** Coolify has built-in backup for databases (Database resource → Backups tab).
  Schedule daily backups to an S3 bucket or local path.
- **Cache:** in-memory only — nothing to back up. Since the cache is not a source of truth
  (Postgres is), losing it on restart is non-catastrophic — it rebuilds on access.
- **R2:** Cloudflare R2 has its own durability; no backup action needed for uploads unless
  you want cross-region replication.

### Changing the API or web domain
- **API domain:** Change the FQDN on the API resource in Coolify. Update
  `CORS_ALLOWED_ORIGINS` if the web domain changed. No image rebuild needed.
- **Web domain:** Change the FQDN on the web resource in Coolify. If the **API** domain
  changed, set `VITE_API_URL` as a runtime env var on the web resource and redeploy — the
  entrypoint regenerates `/config.js`, no rebuild needed. (Rebuilding with a new
  `VITE_API_URL` build-arg also works and additionally updates the image's baked default.)