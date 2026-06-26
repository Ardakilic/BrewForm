# BrewForm — Coolify Deployment Plan

> **Status:** This document is the step-by-step operator guide for deploying BrewForm on a
> self-hosted **Coolify** instance. It assumes the OpenSpec change
> `d30-coolify-ghcr-deployment` has been **implemented** — i.e. the two Docker images exist on
> GHCR, the `compose.yml` `prod` profile works, and the `release.yml` workflow is publishing
> images on every `main` push.
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
6. [Step 2 — Deploy the `denokv` cache sidecar](#step-2--deploy-the-denokv-cache-sidecar)
7. [Step 3 — Deploy the API (Docker Image resource)](#step-3--deploy-the-api-docker-image-resource)
8. [Step 4 — Deploy the Web SPA (Docker Image resource)](#step-4--deploy-the-web-spa-docker-image-resource)
9. [Step 5 — Domains, TLS, and CORS](#step-5--domains-tls-and-cors)
10. [Step 6 — Persistent storage for denokv](#step-6--persistent-storage-for-denokv)
11. [Step 7 — First deploy: migrations & seed](#step-7--first-deploy-migrations--seed)
12. [Step 8 — Cloudflare R2 for uploads](#step-8--cloudflare-r2-for-uploads)
13. [Step 9 — Email (SMTP)](#step-9--email-smtp)
14. [Step 10 — GitHub Actions → Coolify deploy webhook (optional)](#step-10--github-actions--coolify-deploy-webhook-optional)
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
                          │ │   deno-kv        │         │ domain:           │  │
                          │ │  DENO_KV_URL=    │         │  brewform.example │  │
                          │ │   http://denokv  │         │  .com             │  │
                          │ │   :4512          │         │                  │  │
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
                          │          │                                          │
                          │          ▼ depends_on (same destination network)  │
                          │ ┌──────────────────┐                                │
                          │ │ Docker Image res  │  ← denokv cache sidecar     │
                          │ │ denokv            │                                │
                          │ │ image:            │                                │
                          │ │ ghcr.io/denoland  │                                │
                          │ │  /denokv:0.14.0   │                                │
                          │ │ port: 4512       │                                │
                          │ │ volume: /data     │                                │
                          │ │ (SQLite persists)│                                │
                          │ └──────────────────┘                                │
                          └────────────────────────────────────────────────────┘
                                          │
                           ┌──────────────┴──────────────┐
                           ▼                             ▼
                  ┌─────────────────┐          ┌─────────────────────┐
                  │ Cloudflare R2    │          │  GitHub Actions      │
                  │ (S3-compatible)  │          │  release.yml          │
                  │ bucket:          │          │                      │
                  │  brewform-uploads│          │  on push to main:    │
                  │                  │          │   build + push to    │
                  │ S3_* env → API   │          │   GHCR               │
                  │ S3_PUBLIC_URL →  │          │   (api + web images) │
                  │  R2 public URL   │          │                      │
                  └─────────────────┘          │  optional: curl       │
                                               │  Coolify webhook      │
                                               └─────────────────────┘
```

**Key points:**
- **Two Docker Image resources** in Coolify (API + web), each with its own env and domain.
- **One Coolify-managed PostgreSQL**, shared via the internal Docker network.
- **One `denokv` sidecar** (Docker Image resource) for the remote Deno KV cache.
- **Cloudflare R2** for uploads (S3-compatible) — nothing stored on the Coolify server's disk.
- **GitHub Actions** publishes images to GHCR; Coolify just pulls.

---

## 2. Codebase prerequisites (implement & merge first)

This is the **prerequisite implementation checklist** for the `d30-coolify-ghcr-deployment`
OpenSpec change. **The change is currently unapplied** — it must be implemented and
merged to `main` *before* you start any Coolify step (see
[Step 0](#step-0--pre-flight-before-any-coolify-work)). Most rows do **not** exist on disk yet;
the **Status** column marks which files are already committed versus which still need to be
written.

| # | Change | File(s) | Status |
|---|--------|---------|--------|
| 1 | API Dockerfile: `builder` stage now runs `deno task email-build` (compiles MJML templates) + `drizzle-kit generate` (migration SQL); `runner` stage uses `ENTRYPOINT ["/app/docker-entrypoint.sh"]` instead of `CMD`, runs with `--unstable-cron --unstable-kv` | `Dockerfile`, `docker-entrypoint.sh` | Not yet implemented |
| 2 | `docker-entrypoint.sh`: runs `drizzle-kit migrate` (always), checks `SELECT count(*) FROM users` and runs seed only if empty (first boot), then `exec`s the API server | `docker-entrypoint.sh` | Not yet implemented |
| 3 | Web Dockerfile: 3-stage build (deps → vite build with `VITE_*` ARGs → `caddy:2-alpine` serving `dist/` on port 80) | `Dockerfile.web` | Not yet implemented |
| 4 | `compose.yml` `prod` profile (`app-prod`, `web-prod` referencing GHCR images) + `denokv` sidecar service (shared across profiles, pinned to `0.14.0`) | `compose.yml` | Not yet implemented |
| 5 | `Deno.openKv(DENO_KV_URL ?? 'http://denokv:4512')` in `main.ts` and `flush-cache.ts`; `--allow-net` added to `make flush-cache` | `apps/api/src/main.ts`, `apps/api/scripts/flush-cache.ts`, `Makefile` | Not yet implemented |
| 6 | `DENO_KV_URL` + `DENO_KV_ACCESS_TOKEN` added to Zod env schema (both `z.string().optional()`) | `apps/api/src/config/env.ts` | Not yet implemented |
| 7 | `.env.example` split into three files: root (local-dev infra), `apps/api/.env.example` (API runtime for Coolify), `apps/web/.env.example` (web build-time for GitHub Secrets) | `.env.example`, `apps/api/.env.example`, `apps/web/.env.example` | Already committed (on disk) |
| 8 | `release.yml` workflow (build + push to GHCR on `main`/tags, with `cache-from/to: type=gha`, optional Coolify webhook deploy job) | `.github/workflows/release.yml` | Not yet implemented |
| 9 | Makefile targets (`images`, `images-push`, `prod-up`, `prod-up-build`, `prod-down`, `release`) | `Makefile` | Not yet implemented |
| 10 | This document | `coolify_deployment_plan.md` | Already committed (on disk) |

**Health endpoints** (verified in `apps/api/src/routes/health.ts`):
- `GET /health` — liveness, returns `200 { status: 'ok' }` (no DB check)
- `GET /ready` — readiness, returns `200 { status: 'ready', db: 'connected' }` or `503` (checks DB)
- These are at the **root** (`/health`, `/ready`), NOT under `/api/v1/`

**Verify the images exist on GHCR before proceeding:**
```
https://github.com/Ardakilic/BrewForm/pkgs/container/brewform-api
https://github.com/Ardakilic/BrewForm/pkgs/container/brewform-web
```
If the first `release.yml` run has completed on `main`, both packages should be visible. If they
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
  multi-arch (`platforms: linux/amd64,linux/arm64` plus `docker/setup-qemu-action` in
  `release.yml`).
- **No `docker login` required** — the GHCR images are public. If you later make them private,
  SSH into the Coolify server and run:
  ```bash
  echo $GH_PAT | docker login ghcr.io -u ardakilic --password-stdin
  ```
  where `$GH_PAT` is a GitHub PAT with `read:packages` scope.

---

## Step 0 — Pre-flight (before any Coolify work)

Do all of this **before** you touch the Coolify panel. The web image bakes its config at build
time, so getting these wrong means rebuilding and republishing images later.

1. **Apply & merge the `d30-coolify-ghcr-deployment` change to `main`.** This change is currently
   **unapplied** — implement it, open the PR, merge it, and confirm the new files
   now exist on `main`:
   - `Dockerfile.web`
   - `docker-entrypoint.sh`
   - `.github/workflows/release.yml`

   (See [Section 2](#2-codebase-prerequisites-implement--merge-first) for the full prerequisite
   checklist.)

2. **Lock down `.dockerignore`.** Add `.env` and `*.env` while **keeping** `*.env.example`:
   ```gitignore
   .env
   *.env
   !*.env.example
   ```
   Both `Dockerfile` and `Dockerfile.web` do `COPY . .`, so without this a local `make images` /
   `make release` bakes your real `.env` secrets into the **public** GHCR image.

3. **Set the GitHub repo Secrets before the first push to `main`.** They are baked into the web
   image at **build time** in `release.yml`, so an unset secret bakes a wrong `/api/v1` URL and
   `http://localhost:8080` into the SPA:
   - `VITE_API_URL=https://api.brewform.example.com/api/v1`
   - `VITE_PUBLIC_APP_URL=https://brewform.example.com`
   - (optional, for auto-deploy) `COOLIFY_API_TOKEN`, `COOLIFY_API_WEBHOOK`,
     `COOLIFY_WEB_WEBHOOK` — see [Step 10](#step-10--github-actions--coolify-deploy-webhook-optional).

4. **Push to `main`, wait for `release.yml` to finish, then make both packages public.** Once the
   first workflow run completes, flip both GHCR packages to **Public** (GitHub → Packages →
   `brewform-api` / `brewform-web` → Package settings → Change visibility → Public).

5. **Generate the denokv access token** (reused in Steps 2 & 3):
   ```bash
   openssl rand -hex 32
   ```
   This produces 64 hex chars, well above denokv's **12-character minimum**.

6. **Verify DNS + firewall.** Confirm both records resolve to the server and inbound ports 80/443
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

## Step 2 — Deploy the `denokv` cache sidecar

The `denokv` container runs the remote Deno KV server that the API uses for caching when
`CACHE_DRIVER=deno-kv`.

1. **Generate an access token** locally:
   ```bash
   openssl rand -hex 32
   ```
   Save this token — you'll set it in both the `denokv` container and the API's env. denokv's
   `serve` enforces a **minimum 12-character** access token; `openssl rand -hex 32` (64 chars)
   satisfies it. (If you already generated this in [Step 0](#step-0--pre-flight-before-any-coolify-work),
   reuse the same value.)

2. In Coolify: **New Resource → Docker Image** (no git connection needed).
3. **Image:** `ghcr.io/denoland/denokv:0.14.0` (pinned; do NOT use `:latest` — `denokv` is
   pre-1.0 and CLI/protocol may change between versions).
4. **Port exposes:** `4512`
5. **Custom Command / Entrypoint:**
   ```
   --sqlite-path /data/denokv.sqlite serve --access-token <PASTE-YOUR-TOKEN-HERE>
   ```
   Note the flag order: `--sqlite-path <path>` comes **before** the `serve` subcommand, and
   `--access-token <token>` comes **after** `serve`. The denokv CLI syntax is
   `denokv [--sqlite-path <path>] <subcommand> [--flag <value>]`. (This tells denokv to write
   its SQLite file to `/data` and require the bearer token.)

   > **Coolify field semantics:** this string is the container **command/arguments**, appended
   > to the image's `denokv` entrypoint. If your Coolify version's field **replaces** the
   > entrypoint instead of appending, prefix it with `denokv` (i.e.
   > `denokv --sqlite-path /data/denokv.sqlite serve --access-token <token>`). Not all Coolify
   > versions expose a command field — if yours doesn't, bake the args into a forked image or
   > deploy denokv via `compose.yml`.
6. **Persistent Storage** tab:
   - Add a **Volume** with Name `denokv_data` and Destination Path `/data`.
   - This ensures the SQLite file (`/data/denokv.sqlite`) survives container restarts and
     upgrades. Without this volume, the cache is wiped on every restart.
7. **Environment Variables:** none required at the container level (the token is in the
   command). If Coolify requires at least one env var, add a dummy `DENOKV=1`.
8. **Healthcheck:** **Do not** configure a Coolify HTTP healthcheck on `/`. denokv's router only
   serves `POST /` and `POST /v2/*`; a plain HTTP `GET /` returns **404**, so an HTTP healthcheck
   flaps. denokv also has **no** `ping`/health subcommand (only `serve`). Options:
   - **Recommended — leave the healthcheck off** and rely on the API's fail-fast: if `denokv` is
     unreachable, `Deno.openKv()` errors on boot and the container restarts. This is the
     simplest, most reliable approach.
   - **Optional TCP check:** the image is `gcr.io/distroless/cc-debian12:debug` (the **:debug**
     variant), which **does** include a busybox shell and `nc`/`wget` (but no `curl`). If you want
     an explicit probe, a TCP check works: `["CMD","/busybox/nc","-z","localhost","4512"]`.
     Omitting it is still recommended.
9. **Assign to the same destination** as the Postgres database (so the API container, when
   deployed next, can reach `denokv` by container name over the Docker network).
10. **Deploy.** Verify it starts: check the container logs for a line indicating it's listening
    on `0.0.0.0:4512`.
11. **Note the container's internal hostname** — Coolify names it `denokv-<uuid>` (or whatever
    you named the resource + a UUID). You'll use this in the API's `DENO_KV_URL`. Check the
    resource's **General** tab or run `docker ps` on the server to confirm the exact name.

> **Why a sidecar?** Local dev and prod now share the same topology — the API always talks to
> `http://<denokv-host>:4512`. If you later want to scale the API to >1 replica, all replicas
> share one KV. The `CacheProvider` abstraction means switching backends later is a one-line
> change.

---

## Step 3 — Deploy the API (Docker Image resource)

1. In Coolify: **New Resource → Docker Image**.
2. **Image:** `ghcr.io/ardakilic/brewform-api:latest`
3. **Port exposes:** `8000`
4. **Assign to the same destination** as the Postgres and `denokv` resources (critical — this
   is how the API reaches the DB and the cache over the internal Docker network).
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

   # Cache — remote denokv sidecar
   CACHE_DRIVER=deno-kv
   DENO_KV_URL=http://denokv-<uuid>:4512
   DENO_KV_ACCESS_TOKEN=<THE-TOKEN-YOU-GENERATED-IN-STEP-2>

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
   - `DENO_KV_URL` — must use the **internal hostname** of the `denokv` resource
     (`denokv-<uuid>`), and the token from Step 2.
   - `JWT_SECRET` — at least 16 characters (Zod enforces this); use `openssl rand -hex 32`.
   - `CORS_ALLOWED_ORIGINS` — the web SPA's public origin (no trailing slash).

6. **Persistent Storage:** The API container needs **no** persistent volume for uploads
   (uploads go to R2). It also needs no volume for denokv (the sidecar has its own). Leave
   this empty unless you want to persist logs to a volume (not required — Coolify captures
   container stdout).

7. **Healthcheck:** The API exposes `GET /health` (liveness, returns `200 { status: 'ok' }`)
   and `GET /ready` (readiness, checks DB, returns `200` or `503`). These are at the **root**,
   not under `/api/v1`. In the Coolify UI, set:
   - Path: `/health`
   - Expected status code: `200`
   - Interval: `30s`

   > **Note:** The path is `/health` (root), NOT `/api/v1/health`. The API's health routes are
   > mounted at the root in `apps/api/src/routes/index.ts` (`routes.route('/', health)`), so
   > the full path is `https://api.brewform.example.com/health`.

8. **Deploy.** Watch the logs. On first boot (empty database) you should see:
   ```
   Running database migrations...
   Migrations complete.
   Database is empty, running seed...
   Seeding complete!
   Admin credentials: admin@yourdomain.com / <password>
   Starting BrewForm API...
   ```
   followed by the API's own structured logs (JSON or pretty per `LOG_FORMAT`). The
   `BrewForm API running on http://localhost:8000` line appears only when `DENO_DEPLOY` env is
   NOT set (in Coolify it's not set, so this line appears in the API's own logs).

   On subsequent boots (database already seeded), you'll see:
   ```
   Running database migrations...
   Migrations complete.
   Seed skipped — database already contains data (N users).
   Starting BrewForm API...
   ```

9. **If the API fails to start**, check:
   - `DATABASE_URL` hostname is correct and the DB container is on the same destination.
   - `DENO_KV_URL` hostname is correct and `denokv` is healthy.
   - `JWT_SECRET` is at least 16 characters.
   - The migration SQL files are present in the image (they are, if the image built correctly).

---

## Step 4 — Deploy the Web SPA (Docker Image resource)

1. In Coolify: **New Resource → Docker Image**.
2. **Image:** `ghcr.io/ardakilic/brewform-web:latest`
3. **Port exposes:** `80`
4. **Assign to the same destination** as the API (so Caddy could proxy to the API if needed,
   though with subdomain routing the SPA talks to the API cross-origin via CORS).
5. **Environment Variables:** **None.** The `VITE_API_URL` and `VITE_PUBLIC_APP_URL` are
   baked into the image at build time (in the `release.yml` workflow via GitHub Secrets). The
   web container has no runtime configuration.

   > **If you need to change the API URL**, you must rebuild the web image with new
   > `VITE_API_URL` / `VITE_PUBLIC_APP_URL` build-args and push a new `:latest`. There's no
   > way to change it at runtime because Vite inlines `import.meta.env.*` at build time.

6. **Deploy.** Verify it starts: `curl http://<coolify-assigned-domain>/` should return the
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

## Step 6 — Persistent storage for denokv

This was set in Step 2, but to reiterate: the `denokv` resource **must** have a persistent
volume at `/data`, otherwise the SQLite file is lost on every container restart and your cache
is wiped.

To verify:
1. Go to the `denokv` resource → **Persistent Storage** tab.
2. Confirm there's a volume with Destination Path `/data`.
3. Restart the `denokv` container (via Coolify's Restart button) and confirm the API still gets
   cache hits (the KV data survived).

---

## Step 7 — First deploy: migrations & seed

The API's `docker-entrypoint.sh` handles this automatically. Here's what happens on the first
deploy (Step 3 above):

1. **Container starts** → `docker-entrypoint.sh` runs.
2. **Migrations:** `deno run -A npm:drizzle-kit@0.31.10 migrate` runs against `DATABASE_URL`.
   Drizzle applies any pending migration SQL files in `packages/db/drizzle/`. This creates all
   tables.
3. **Seed check:** The script runs `SELECT count(*) FROM users`. If the count is `0`:
   - `deno run --allow-all packages/db/src/seed.ts` runs, inserting the admin user, badges,
     equipment catalog, coffee varieties, seed users/recipes, and social data.
   - The admin credentials are logged once.
4. **API starts:** `exec deno run --unstable-cron --unstable-kv apps/api/src/main.ts`.

On subsequent restarts/redeploys:
- Migrations run again (no-op if nothing pending).
- Seed is **skipped** (the `users` table is not empty).
- API starts immediately.

> **If you ever need to re-seed** (e.g., to reset to a clean state), you can:
> 1. `docker exec` into the running API container (Coolify's Terminal tab).
> 2. Run: `deno run --allow-all packages/db/src/seed.ts` — the seed is idempotent
>    (`onConflictDoNothing` on all inserts), so it won't overwrite or delete existing data.
> 3. To start completely fresh: drop the database in Coolify, recreate it, and restart the API
>    container (the entrypoint will re-migrate and re-seed).

> **Partial-seed recovery:** the seed runs only when `SELECT count(*) FROM users` is `0`. If the
> first-boot seed fails **partway** — after the admin row is inserted but before the rest — that
> sentinel will be `>0` on the next boot and the seed is **skipped**, leaving a partially-seeded
> DB. To recover, either drop & recreate the database before a successful first boot, or manually
> re-run the (idempotent) seed: `deno run --allow-all packages/db/src/seed.ts`.

> **Secrets hygiene:** the seed logs the admin email/password to stdout once, and Coolify retains
> container logs — **change the admin password in-app after first login**. Likewise, the denokv
> access token is passed as a CLI argument, so it's visible via `docker inspect` and the Coolify
> UI. This is acceptable on a single-host private network, but be aware of it.

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

## Step 10 — GitHub Actions → Coolify deploy webhook (optional)

To automatically trigger a Coolify re-pull + restart when GitHub Actions finishes publishing
images, configure deploy webhooks.

### In Coolify
1. **Settings → Configuration → Advanced → API Access** → enable the API.
2. **Keys & Tokens → API Tokens** → create a token with **Deploy** permission. Save it.
3. On the **API** resource → **Webhooks** tab → copy the **Deploy webhook URL**.
4. Repeat for the **Web** resource → copy its **Deploy webhook URL**.

### In GitHub
1. Go to the repo → **Settings → Secrets and variables → Actions**.
2. Add the following repository secrets:
   - `COOLIFY_API_TOKEN` — the API token from step 2.
   - `COOLIFY_API_WEBHOOK` — the API resource's deploy webhook URL.
   - `COOLIFY_WEB_WEBHOOK` — the web resource's deploy webhook URL.
   - `VITE_API_URL` — `https://api.brewform.example.com/api/v1` (for the web image build).
   - `VITE_PUBLIC_APP_URL` — `https://brewform.example.com` (for the web image build).
3. The `release.yml` workflow's `deploy` job (if implemented) will `curl` these webhooks after
   a successful image push, causing Coolify to re-pull `:latest` and restart the containers.

> **Without webhooks:** Coolify can also auto-pull on a schedule, or you can click "Redeploy"
> in the Coolify UI manually after a push. The webhook is just for automation.

---

## Post-deploy verification checklist

Run through this after completing Steps 1–9.

- [ ] **Postgres** resource is healthy in Coolify.
- [ ] **denokv** resource is healthy; `/data/denokv.sqlite` exists on its volume (verify via
      `docker exec <denokv-container> ls /data/` on the server, or check the container logs for
      a "listening on 0.0.0.0:4512" message).
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
- [ ] **Cache works:** perform an action that hits the cache (e.g. load the recipe list twice),
      then restart the API container and confirm the second load is still fast (cache survived
      via denokv).
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
  chars), `CACHE_DRIVER` (must be `deno-kv` or `memory`).

### API can't reach the database: connection refused / timeout
- **Cause:** The API and Postgres are not on the same Docker destination, or the
  `DATABASE_URL` hostname is wrong.
- **Fix:** In Coolify, ensure both resources are assigned to the **same destination** (Docker
  network). Use the exact internal hostname from the Postgres Connection tab (e.g.
  `postgresql-<uuid>`, not `localhost` or `postgres`).

### API can't reach denokv: connection refused
- **Cause:** `DENO_KV_URL` hostname doesn't match the `denokv` resource's internal name, or
  they're on different destinations.
- **Fix:** Confirm the `denokv` resource's container name (via `docker ps` on the server or
  the Coolify General tab) and set `DENO_KV_URL=http://<that-name>:4512`.
- **Workaround:** If you can't get the sidecar working, set `CACHE_DRIVER=memory` on the API.
  The app works (cache is not a source of truth), but cache is lost on restart.

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
  API env. Test R2 connectivity from the API container's Terminal:
  `curl -I https://<account-id>.r2.cloudflarestorage.com/brewform-uploads/`.

### Migrations fail on startup
- **Symptom:** Container logs show a Drizzle migration error and exits.
- **Cause:** Usually a DB connectivity issue, or a migration file is missing from the image.
- **Fix:** Verify `DATABASE_URL` is correct and the DB is reachable. If the image is missing
  migration files, the `Dockerfile` builder stage didn't run
  `cd packages/db && deno run -A npm:drizzle-kit@0.31.10 generate` — rebuild and repush the
  image.

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
  `deno run --allow-all packages/db/src/seed.ts` (see
  [Step 7](#step-7--first-deploy-migrations--seed)).

### denokv data is lost after restart
- **Cause:** No persistent volume mounted at `/data`.
- **Fix:** Go to the `denokv` resource → Persistent Storage → add a Volume with Destination
  Path `/data`.

### GHCR pull fails: "image not found"
- **Cause:** The `release.yml` workflow hasn't run yet, or the images are private and the
  server isn't logged in.
- **Fix:** Push a commit to `main` to trigger `release.yml`. If the package is private on
  GHCR, either flip it to public (GitHub → Packages → brewform-api → Package settings →
  Public) or SSH into the Coolify server and `docker login ghcr.io`.

---

## Maintenance & upgrades

### Updating BrewForm
1. Merge a PR to `main` (or push a `v*` tag for a versioned release).
2. `release.yml` builds and pushes new `:latest` images to GHCR.
3. If you set up deploy webhooks (Step 10), Coolify auto-repulls and restarts. Otherwise:
   - Go to each Coolify resource → click **Redeploy** (or "Restart").
4. The API entrypoint re-runs migrations (no-op if nothing new) and skips the seed (DB is not
   empty).

### Rollback

Coolify resources track the `:latest` tag, so you roll back a bad deploy by pinning to a
known-good immutable tag. `release.yml` publishes both `:<commit-sha>` and `:vX.Y.Z` tags
alongside `:latest`. To roll back:
1. On the affected resource (API and/or web), change the image tag from `:latest` to a specific
   `:<commit-sha>` or `:vX.Y.Z`.
2. **Redeploy** — Coolify pulls the pinned image.
3. Once a fix ships, switch the tag back to `:latest`.

### Upgrading `denokv`
- `denokv` is pinned to `0.14.0`. To upgrade:
  1. Check the [denokv releases](https://github.com/denoland/denokv/releases) for breaking
     changes.
  2. Update the image tag in the Coolify `denokv` resource (or in `compose.yml` locally, then
     `make images-push` if you maintain a forked image).
  3. Redeploy the `denokv` resource. The `/data` volume preserves the SQLite file.
  4. Restart the API so it reconnects.

### Backing up data
- **Postgres:** Coolify has built-in backup for databases (Database resource → Backups tab).
  Schedule daily backups to an S3 bucket or local path.
- **denokv:** The SQLite file at `/data/denokv.sqlite` is on a named volume. To back it up,
  `docker cp <denokv-container>:/data/denokv.sqlite ./backup.sqlite` from the server, or use
  Coolify's volume backup if available. Since the cache is not a source of truth (Postgres
  is), losing denokv data is non-catastrophic — the cache rebuilds on access.
- **R2:** Cloudflare R2 has its own durability; no backup action needed for uploads unless
  you want cross-region replication.

### Changing the API or web domain
- **API domain:** Change the FQDN on the API resource in Coolify. Update
  `CORS_ALLOWED_ORIGINS` if the web domain changed. No image rebuild needed.
- **Web domain:** Change the FQDN on the web resource in Coolify. If the **API** domain
  changed, you must rebuild the web image with a new `VITE_API_URL` build-arg and push to
  GHCR, then redeploy the web resource.