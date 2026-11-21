# BrewForm — Coolify Deployment (as-built)

This is the **concrete, as-deployed guide** for running BrewForm on a self-hosted
**Coolify v4.1.x** instance, capturing the real decisions and version-specific nuances
encountered during the production rollout to `brewform.cc`.

> **Relationship to `coolify_deployment_plan.md`:** that file is the long-form operator
> reference (every option, every troubleshooting branch). **This** file is the shorter
> "how it is actually wired" guide — read this first, fall back to the plan for depth.

---

## 1. Architecture

```text
                         Cloudflare (proxy, Full-Strict TLS)
                          │                         │
            brewform.cc / www            api.brewform.cc          cdn.brewform.cc
                          │                         │                    │
        ┌─────────────────┴─────────────────────────┴────────┐          │
        │                  Coolify server                     │          │
        │   (all resources share the `coolify` network)       │          │
        │                                                     │          ▼
        │  ┌───────────────┐   ┌───────────────┐              │   Cloudflare R2
        │  │ web (Docker    │   │ api (Docker    │             │   bucket: brewform-uploads
        │  │ Image, Caddy   │   │ Image, Node)   │─── S3 ──────┼──▶ (custom domain cdn.*)
        │  │ :80)           │   │ :8000          │             │
        │  └───────────────┘   └──┬──────────────┘             │
        │                          │                            │
        │            ┌─────────────┘                            │
        │            ▼                                          │
        │  ┌───────────────────┐                                │
        │  │ PostgreSQL         │                                │
        │  │ (Coolify-managed)  │                                │
        │  │ postgresql-<uuid>  │                                │
        │  └───────────────────┘                                │
        └─────────────────────────────────────────────────────┘
                                   │ SMTP
                                   ▼
                          Mailtrap (live sending)
```

**Three Coolify resources** + two external services:

| Resource | Type | Purpose | Internal name |
|---|---|---|---|
| `brewform-db` | Managed Database (PostgreSQL) | app data | `postgresql-<uuid>` |
| `brewform-api` | Docker Image | the Hono/Node API | (n/a, has FQDN) |
| `brewform-web` | Docker Image | the React SPA (Caddy) | (n/a, has FQDN) |

External: **Cloudflare R2** (uploads, served via `cdn.brewform.cc`), **Mailtrap** (email).

**Why these choices:**
- **Images are pulled from GHCR, not built by Coolify.** The single GitHub Actions workflow
  (`.github/workflows/ci.yml`) builds and boot-tests both images on every pull request and
  `main` push; its `publish` job pushes `ghcr.io/ardakilic/brewform-{api,web}` only after every
  CI job (quality, tests, image smoke tests) passed, and pushes exactly the images that were
  tested. There is no separate release workflow. Coolify only pulls, so the heavy Node/Vite build
  stays on GitHub runners.
- **The API cache is in-memory by default (`CACHE_ENABLED=true`, `CACHE_DRIVER=memory`) — no sidecar.** The cache is not a
  source of truth (Postgres is), so losing it on restart is non-catastrophic. A shared
  Redis backend is optional: set `CACHE_DRIVER=redis` plus `REDIS_URL` (any Redis-protocol
  server, e.g. Redis or Valkey).
- **The API holds no uploads on disk** — `STORAGE_DRIVER=s3` → R2.

---

## 2. Networking model (read this — it's the #1 source of failures)

Coolify v4 deploys **each resource to its own isolated Docker network by default**. "Same
server/destination" is **not** enough for containers to resolve each other by name.

- **Managed databases** and **standalone Docker Image apps** are attached to the shared
  **`coolify`** network automatically, so the API (Docker Image) reaches Postgres
  (`postgresql-<uuid>`) out of the box. There is no cache sidecar, so no cross-resource
  networking beyond the database is needed.

Find a resource's real internal hostname on the server:

```bash
docker ps --format '{{.Names}}' | grep -i postgres   # e.g. postgresql-ojbuh8rspbp8my0dn0gav7fw
```

---

## 3. Prerequisites

- **Coolify v4.1.x** with a server + destination (the default `coolify` network).
- **DNS A records → server IP** (verify with `dig +short <host>`):
  - `brewform.cc`, `www.brewform.cc` (optional), `api.brewform.cc`
  - `cdn.brewform.cc` is a **Cloudflare R2 custom domain**, not a Coolify record (see [§10](#10-uploads--cloudflare-r2)).
- **GitHub repo Secrets** (optional; baked into the published **web** image by the `images`
  job of `ci.yml` on `main` pushes; pull requests always use the fallbacks `/api/v1` and
  `http://localhost:8080`):
  - `VITE_API_URL=https://api.brewform.cc/api/v1`
  - `VITE_PUBLIC_APP_URL=https://brewform.cc`
  - After setting them, push to `main` (or re-run the latest `CI` run on `main` — secrets are
    read at run time) so the web image bakes the right URLs. The runtime `VITE_API_URL` and
    `PUBLIC_APP_URL` of the web resource ([§7](#7-step-4--web-spa-docker-image)) override both
    without a rebuild. No other secret is needed: `GITHUB_TOKEN` publishes to GHCR.
- **GHCR images public:** GitHub → Packages → `brewform-api` / `brewform-web` → make public
  (so Coolify pulls without `docker login`). Verify anonymously:

  ```bash
  tok=$(curl -s "https://ghcr.io/token?service=ghcr.io&scope=repository:ardakilic/brewform-web:pull" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
  curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $tok" \
    -H "Accept: application/vnd.oci.image.index.v1+json" \
    https://ghcr.io/v2/ardakilic/brewform-web/manifests/latest   # 200 = public
  ```

- **Runtime (nothing to install on the server):** the images run **Node 26 LTS**, and pnpm is
  pinned exactly for builds. The authoritative pins are `.nvmrc`, the root `package.json`
  `engines` / `devEngines` / `packageManager` fields, and the `FROM node:<version>-trixie-slim`
  lines of `Dockerfile` and `Dockerfile.web` (Renovate bumps them, so this guide does not repeat
  patch versions). Rebuilding an image (`make images`, or CI) uses frozen installs: the Docker
  `deps` stages run `pnpm fetch` then `pnpm install --frozen-lockfile --offline`, and CI runs
  `pnpm install --frozen-lockfile`. drizzle-kit is a development tool only, for generating
  migrations through the `@brewform/db` scripts (`pnpm --filter @brewform/db run generate`); the
  API image applies migrations itself ([§6 step 7](#6-step-3--api-docker-image)).
- **Generate secrets** (reused below):

  ```bash
  openssl rand -hex 32   # JWT_SECRET
  ```

- **Architecture caveat:** the published GHCR images are **amd64-only**. On an ARM64 host they
  fail with `exec format error`; on an ARM dev machine `docker pull` needs `--platform
  linux/amd64`. To run on ARM hosts, build the images on the host (`make images`) or extend the
  `images`/`publish` jobs of `ci.yml` to multi-arch (`platforms: linux/amd64,linux/arm64` +
  `docker/setup-qemu-action`; the single-platform `load: true` + `docker save` hand-off to
  `publish` then needs a multi-platform equivalent).

---

## 4. Step 1 — PostgreSQL (managed)

1. **+ New → Database → PostgreSQL** (v16/17), on your server + destination.
2. Name `brewform-db`. Start it; wait for green/healthy. **Do not** expose a public port.
3. **Connection** tab → copy the **internal** URL:
   `postgresql://postgres:<password>@postgresql-<uuid>:5432/postgres`
   (Coolify's default DB name is `postgres` — fine; the app creates its tables there.)

This URL becomes `DATABASE_URL` in [§6](#6-step-3--api-docker-image). The app's Zod schema
accepts both `postgres://` and `postgresql://`.

---

## 5. Step 2 — Cache (in-memory default, no sidecar)

There is **no cache resource to create** for the default setup. The API runs with
`CACHE_DRIVER=memory` (see [§6](#6-step-3--api-docker-image)): an in-process Map with TTL
support. Cache is lost on restart, which is acceptable because the cache is never a source
of truth — Postgres is. For a shared cache, set `CACHE_DRIVER=redis` plus `REDIS_URL` and
provision any Redis-protocol server (Redis or Valkey); no code changes needed. Note the
split defaults: `compose.production.yml` ships `CACHE_DRIVER=redis` (with its own `valkey`
service), while the env schema and this Coolify setup default to `memory`.

---

## 6. Step 3 — API (Docker Image)

1. **+ New → Docker Image**, same server/destination.
2. **Image** `ghcr.io/ardakilic/brewform-api` · **Tag** `latest` · **Ports Exposes** `8000`.
3. **Domain** `https://api.brewform.cc`.
4. **Healthcheck** (Configuration → Healthcheck), exactly:

   | Field | Value |
   |---|---|
   | Enabled | yes |
   | Type | `CMD` |
   | Command | `node /app/healthcheck.mjs /ready` |
   | Interval | `15` s |
   | Timeout | `5` s |
   | Retries | `3` |
   | Start period | `180` s |

   There is no port or path field to fill: the script reads `APP_PORT` (default `8000`), `/ready`
   is its argument, and success is exit code `0` (HTTP `200`).
   - **Why `CMD`:** Coolify runs dashboard checks *inside* the container, and its `HTTP` type
     needs `curl` or `wget`, which the API image does not ship. The `CMD` type runs the same probe
     as the image's own `HEALTHCHECK` (one command, no shell operators, as Coolify requires).
   - **It checks readiness.** `/ready` answers `200` only when the database answers within 2 s and
     the process is not shutting down. Coolify waits for it during a rolling update, and Traefik
     stops routing to a container that fails it. Uptime monitors use `/health` instead
     ([§13 Monitoring](#monitoring)).
   - **Disabled is a safe fallback:** with the dashboard check disabled, Coolify uses the image's
     identical built-in `HEALTHCHECK` (same command and timings).
   - Changes to these fields take effect only after a **Redeploy**.
5. **Persistent Storage:**
   - **None with `STORAGE_DRIVER=s3`** (recommended; uploads go to R2 and the cache is in-memory).
   - **With `STORAGE_DRIVER=local`** the API writes photos to `/app/uploads`, which must be
     persistent or every redeploy deletes them. Configuration → Persistent Storage → Add, either:
     - a **Volume Mount** (default): Name `brewform-uploads`, Destination Path `/app/uploads`. A new
       empty volume takes the image's `node` ownership, so nothing else is needed; or
     - a **Directory Mount**: Source Path an absolute server path, for example
       `/data/brewform/uploads`, Destination Path `/app/uploads`; then, before redeploying, run
       on the server `sudo chown -R 1000:1000 /data/brewform/uploads`. The API runs as UID `1000`
       and refuses to start on an unwritable upload directory (log:
       `… is not writable by uid 1000 gid 1000`).

     Local photo URLs are root-relative (`/uploads/<file>`), so the browser loads them from the
     **web** domain. Local storage therefore also needs the web edge: give the API resource the
     network alias `brewform-api` (Configuration → Network → **Network Aliases**; on versions
     without that field add `--network-alias=brewform-api` to **Custom Docker Options**) and set
     `API_UPSTREAM=brewform-api:8000` on the web resource ([§7](#7-step-4--web-spa-docker-image)),
     so the web container proxies `/uploads/*`, `/share/*`, `/api/*`, `/health` and
     `/sitemap.xml` to the API.
     Both resources must be on the same destination (network). An alias is used because container
     names change on every rolling deploy.

     During a rolling update the old and the new container mount the same volume at once; that
     is safe because upload keys are unique, write-once file names. Coolify can schedule backups
     of the volume or directory, but keep a copy off the server as well.

   **Moving existing local photos** (an install that used `STORAGE_DRIVER=local` before wave 6
   kept them in `/app/apps/api/uploads` inside the container, which a redeploy deletes):

   ```sh
   # on the server, BEFORE adding the storage and redeploying:
   docker cp <api container>:/app/apps/api/uploads ./uploads-rescue
   # after redeploying with the Persistent Storage at /app/uploads:
   docker cp ./uploads-rescue/. <new api container>:/app/uploads/
   docker exec -u 0 <new api container> chown -R 1000:1000 /app/uploads
   ```

   (`docker ps --format '{{.Names}}' | grep -i api` finds the container names.)
6. **Environment Variables** (Developer view). Key values + nuances:

   ```env
   APP_ENV=production
   LOG_FORMAT=json
   PUBLIC_APP_URL=https://brewform.cc
   APP_URL=https://brewform.cc          # frontend URL (QR codes, links) — NOT the API's own URL

   DATABASE_URL=postgresql://postgres:<pw>@postgresql-<uuid>:5432/postgres
   DATABASE_PROVIDER=postgresql
   DB_STATEMENT_TIMEOUT_MS=10000        # optional; per-statement limit in ms (0 disables)

   CACHE_ENABLED=true
   CACHE_DRIVER=memory

   TRUST_PROXY=cloudflare               # client IP for rate limits; see §9 for the topology table

   JWT_SECRET=<openssl-rand-hex-32>     # >= 16 chars (Zod-enforced)
   JWT_ACCESS_EXPIRY=15m
   JWT_REFRESH_EXPIRY=7d
   JWT_REMEMBER_ME_EXPIRY=180d

   ADMIN_EMAIL=admin@brewform.cc        # use an inbox you control (password reset)
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=<strong>              # change in-app after first login

   CORS_ALLOWED_ORIGINS=https://brewform.cc,https://www.brewform.cc   # FRONTEND origins, comma-sep

   SMTP_HOST=live.smtp.mailtrap.io
   SMTP_PORT=587
   SMTP_USER=<user>
   SMTP_PASS=<pass>
   SMTP_SECURE=false                    # 587 = STARTTLS → false (465 → true)
   EMAIL_FROM=noreply@mt.brewform.cc    # must be a Mailtrap-verified sending domain

   OPENAPI_ENABLED=false
   ENABLE_REGISTRATION=false

   STORAGE_DRIVER=s3
   S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com   # account endpoint ONLY (see below)
   S3_REGION=auto
   S3_BUCKET=brewform-uploads
   S3_ACCESS_KEY=<r2-access-key>
   S3_SECRET_KEY=<r2-secret-key>
   S3_PUBLIC_URL=https://cdn.brewform.cc
   ```

   **Gotchas verified against the code:**
   - **`S3_ENDPOINT` must NOT include the bucket.** `utils/storage/s3.ts` builds the request
     as `${S3_ENDPOINT}/${S3_BUCKET}/${file}` (path-style). Putting `/brewform-uploads` in the
     endpoint double-buckets the path → `SignatureMismatch`/`404` on every upload.
   - **The API needs no env for its own URL (`api.brewform.cc`).** It derives its host from the
     proxy request; every absolute URL it emits (email links, QR codes, sitemap, OG tags) uses
     `PUBLIC_APP_URL`/`APP_URL` → the **frontend**.
   - **`CORS_ALLOWED_ORIGINS`** lists the **frontend** origins (apex + www), not the API.
   - With `STORAGE_DRIVER=s3` the Zod schema **requires** all `S3_*` and validates
     `S3_ENDPOINT`/`S3_PUBLIC_URL` as URLs — a placeholder makes the API **exit on boot**. Use
     `STORAGE_DRIVER=local` for a first smoke-boot if R2 isn't ready.
   - Mark any value containing `$` as **Literal** in Coolify (else it interpolates).
   - **A blank value counts as unset**, so its default applies (for example an empty
     `S3_ENDPOINT` with `STORAGE_DRIVER=local` is fine). Delete a variable or leave it empty;
     both behave the same.
   - **`UPLOAD_DIR`** is `/app/uploads` in the image; do not set it (the Persistent Storage in
     step 5 mounts exactly there).
   - **`DB_STATEMENT_TIMEOUT_MS`** (optional, default `10000`): server-side `statement_timeout`
     set on every pooled API connection. A longer query is cancelled and answered with
     `503 QUERY_TIMEOUT`; `0` disables the limit, and a non-integer or negative value falls
     back to the default. Unset is fine for most installs.
   - **Search needs the `pg_trgm` extension (ADR-017).** The wave-6 migrations run
     `CREATE EXTENSION IF NOT EXISTS pg_trgm;` and then build three GIN trigram indexes. The
     role in `DATABASE_URL` needs `CREATE` on the database (`pg_trgm` is a trusted
     extension, so no superuser is needed). Coolify's `postgres` user has it. The migration
     runner checks this before applying anything and stops with the remedy if it is missing.
     While the GIN indexes build, writes to `recipe` and `recipe_version` are briefly locked,
     so expect a short pause in recipe saves during that deploy.

7. **Deploy.** Every container start runs `docker-entrypoint.sh` in `serve` mode: the
   `@brewform/db` migration runner with Node (`node /app/packages/db/src/migrate.ts`, a no-op when
   nothing is pending), then the user-count check, then the seed on an empty database only, then
   `exec node src/main.ts` (one Node process under `tini`, no runtime flags; the hourly badge job
   runs inside it, once per replica). The image contains neither pnpm nor drizzle-kit. Watch for:

   ```text
   Entrypoint mode: serve
   Running database migrations...
   Migrations complete.
   Database is empty, running seed...
   Seeding complete.
   Starting BrewForm API...
   … "msg":"Cache initialized" …
   … "msg":"Storage verified" …
   … "msg":"BrewForm API running on http://localhost:8000"
   ```

8. Verify: `https://api.brewform.cc/health` → `200 {"status":"ok"}`;
   `https://api.brewform.cc/ready` → `200` with `"status":"ready"` and `"db":"connected"`.

---

## 7. Step 4 — Web SPA (Docker Image)

1. **+ New → Docker Image**, same destination.
2. **Image** `ghcr.io/ardakilic/brewform-web` · **Tag** `latest` · **Ports Exposes** `80`.
3. **Domain** `https://brewform.cc`.
4. **Healthcheck** (Configuration → Healthcheck), exactly:

   | Field | Value |
   |---|---|
   | Enabled | yes |
   | Type | `HTTP` |
   | Method | `GET` |
   | Scheme | `http` |
   | Host | `localhost` |
   | Port | `80` |
   | Path | `/healthz` |
   | Expected status code | `200` |
   | Interval | `30` s |
   | Timeout | `3` s |
   | Retries | `3` |
   | Start period | `10` s |

   `/healthz` is answered by the web container itself (it never touches the API), and the image
   ships BusyBox `wget`, so the `HTTP` type works here. Changes take effect after a Redeploy.
5. **Environment Variables:**
   - **Optional** `VITE_API_URL=https://api.brewform.cc/api/v1` — overrides the build-time
     default at runtime (see below). The published image already bakes this value, so leaving
     env empty also works.
   - **Optional** `PUBLIC_APP_URL=https://brewform.cc` — the public origin. At startup the
     entrypoint rewrites the `og:image`/`twitter:image` tags in `index.html` and the `Sitemap:`
     line of `robots.txt` with it, so a prebuilt image works for any domain without a rebuild.
     (`VITE_PUBLIC_APP_URL` itself stays build-time only; a runtime `VITE_PUBLIC_APP_URL` has no
     effect.)
   - **Optional same-origin mode** `API_UPSTREAM=brewform-api:8000` (required with local photo
     storage, see [§6 step 5](#6-step-3--api-docker-image)). The web container then
     reverse-proxies `/api/*`, `/uploads/*`, `/share/*`, `/health` and `/sitemap.xml` (exact
     paths; the sitemap index must sit at the site root) to the API
     through the API's network alias, so the SPA could also use `VITE_API_URL=/api/v1` on the web
     domain. Caveats:
     - both resources must be on the same destination network and the API needs the alias;
     - set `TRUSTED_PROXIES=private_ranges` on the web resource (Traefik reaches it from a
       private Docker network; unset means "trust no proxy"), and keep `TRUST_PROXY=cloudflare`
       on the API behind Cloudflare ([§9](#9-cloudflare-proxy-orange-cloud));
     - request bodies are capped at the edge by `EDGE_MAX_BODY_SIZE` (default `16MB`, above the
       API's ~11 MiB photo cap);
     - `/ready` is not proxied; with the API down, proxied paths answer `502` while `/healthz` and
       the SPA stay up;
     - without `API_UPSTREAM` (the default) the container only serves files, and `/uploads/*`
       on the web domain returns the SPA — fine with `STORAGE_DRIVER=s3`.
6. **Deploy.** Logs show the entrypoint lines: `runtime VITE_API_URL applied: …` (if you set the
   env) or `no runtime VITE_API_URL set; using build-time default`, plus
   `API proxy applied …` / `API proxy disabled (API_UPSTREAM not set)` and the
   `PUBLIC_APP_URL` line.

> **Runtime-configurable API URL (PR #104):** the web image's entrypoint
> (`docker-web-entrypoint.sh`) regenerates `/config.js` from `$VITE_API_URL` at container start
> (validated against a URL allowlist), and the SPA reads
> `globalThis.__BREWFORM_CONFIG__.apiUrl` → build-time `VITE_API_URL` → `/api/v1`. This lets a
> prebuilt image be pointed at any API origin **without a rebuild**. `VITE_PUBLIC_APP_URL`
> stays the build-time default; the runtime `PUBLIC_APP_URL` replaces it in the OG tags and
> `robots.txt`.

---

## 8. Step 5 — Domains, TLS, CORS

- Set each resource's **FQDN** in Coolify; it provisions Let's Encrypt automatically
  (needs ports 80/443 open and DNS resolving).
- For `www.brewform.cc`: add the DNS record, then add the domain on the web resource (or a
  `www → apex` redirect).
- **Verify CORS preflight:**

  ```bash
  curl -i -X OPTIONS \
    -H "Origin: https://brewform.cc" \
    -H "Access-Control-Request-Method: GET" \
    https://api.brewform.cc/health
  # expect: access-control-allow-origin: https://brewform.cc
  ```

---

## 9. Cloudflare proxy (orange cloud)

Enabling Cloudflare's proxy in front of Coolify is supported and recommended for DDoS/WAF, but
mind these nuances. **The proxy is toggled at Cloudflare (DNS records), not in Coolify** —
Coolify keeps provisioning/serving the origin Let's Encrypt cert and routing.

- **SSL/TLS mode must be `Full (Strict)`** (or at least `Full`). **Never `Flexible`** — Coolify
  redirects HTTP→HTTPS, and Flexible makes Cloudflare talk HTTP to the origin → infinite
  redirect loop (`ERR_TOO_MANY_REDIRECTS`).
- **Provision the LE cert with the proxy OFF (grey cloud) first, then turn it ON.** If your
  certs are already issued (the site already serves HTTPS), it's safe to flip the proxy on now.
- **Cert renewal behind the proxy:** Coolify renews via HTTP-01 on port 80, which Cloudflare
  proxies through. This normally works; if a renewal ever fails, temporarily grey-cloud the
  record, or install a **Cloudflare Origin Certificate** at the origin to avoid LE renewal
  entirely.
- **Real client IP (`TRUST_PROXY` on the API).** Rate limits are per client, so the API must
  know which forwarding header to believe. It does not trust any by default
  (`TRUST_PROXY=none`), and the right value depends on what sits in front of it:

  | Topology | What the API receives | API setting |
  |---|---|---|
  | Client → API directly (no proxy) | only the TCP peer | `TRUST_PROXY=none` (default) |
  | Client → Traefik (Coolify, default config) | Traefik drops an untrusted `X-Forwarded-For` and writes the client IP | `TRUST_PROXY=hops`, `TRUST_PROXY_HOPS=1` |
  | Client → Cloudflare → Traefik (default config; brewform.cc) | `X-Forwarded-For` holds only the **Cloudflare edge** IP; `CF-Connecting-IP` holds the client | `TRUST_PROXY=cloudflare` |
  | Client → Cloudflare → Traefik with `forwardedHeaders.trustedIPs` set to the Cloudflare ranges | `X-Forwarded-For: <client>, <cloudflare edge>` | `TRUST_PROXY=hops`, `TRUST_PROXY_HOPS=2`, or `TRUST_PROXY=cloudflare` |

  - With `hops` alone behind Cloudflare, every visitor arriving through the same Cloudflare edge
    shares one rate-limit bucket (and they lock each other out). That is why this guide sets
    `TRUST_PROXY=cloudflare`.
  - `cloudflare` mode uses `CF-Connecting-IP` **only** when the hop in front of the API is a
    Cloudflare address (built-in list of Cloudflare's published ranges plus
    `TRUST_PROXY_CIDRS`, comma-separated extra CIDRs); otherwise it falls back to that hop, so a
    forged header from a direct request is ignored.
  - **Lock the origin down:** allow ports 80/443 on the server only from the Cloudflare ranges
    (<https://www.cloudflare.com/ips/>), so clients cannot bypass Cloudflare.
  - Traefik's `trustedIPs` is a Coolify proxy setting (Servers → Proxy → configuration:
    `--entrypoints.https.forwardedHeaders.trustedIPs=<Cloudflare ranges>`); it is optional, and
    `TRUST_PROXY=cloudflare` works without it.
  - `/health` and `/ready` are never rate limited, so health checks and monitors are unaffected.
- **Caching:** `/config.js` is served `Cache-Control: no-store` (Cloudflare respects it).
  Hashed JS/CSS cache fine; avoid caching `index.html` aggressively. API paths (no file
  extension) aren't cached by Cloudflare's defaults.
- **Body size:** Cloudflare Free caps request bodies at **100 MB**; the app caps uploads at
  10 MB — fine.

---

## 10. Uploads — Cloudflare R2

1. R2 → create bucket `brewform-uploads`.
2. Note the **S3 API endpoint**: `https://<account-id>.r2.cloudflarestorage.com`
   (this is `S3_ENDPOINT` — **without** the bucket name).
3. Create an **R2 API token** scoped to the upload bucket only: permission **Object Read & Write**,
   **Apply to specific buckets only** → `brewform-uploads` (never "Admin Read & Write", which can
   change bucket configuration) → `S3_ACCESS_KEY` / `S3_SECRET_KEY`.
4. **Connect a custom domain** `cdn.brewform.cc` to the bucket (R2 → bucket → Settings →
   Public Access → Connect Domain) → `S3_PUBLIC_URL=https://cdn.brewform.cc`. Files are served
   as `https://cdn.brewform.cc/<filename>`.
5. Verify: upload a recipe photo in-app; confirm the URL is `https://cdn.brewform.cc/<uuid>.<ext>`
   and the object appears in the bucket. Keys are generated by the server (`<uuid>.jpg|png|webp`,
   plus `<uuid>_medium.<ext>` for the thumbnail); the uploaded file's name is never used.

### Photo storage security check (installs that ran before wave 6)

Run this once if the deployment ever ran a version older than wave 6 with `STORAGE_DRIVER=s3`.
Those versions built the object key from the uploaded file's name and put it unencoded into the
signed S3 URL, so a crafted filename could write to another bucket, overwrite another photo, or
send a signed **bucket-configuration** `PUT` (`?policy=`, `?cors=`, `?acl=`, `?tagging=`, …) with
the app's credential. Wave 6 closes this, but it cannot undo changes already made. Run the commands
with the AWS CLI v2 and a credential that may read bucket configuration (an admin token, not the
app's scoped token):

```sh
export S3_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com"   # the API's S3_ENDPOINT
export S3_BUCKET="brewform-uploads"                                   # the API's S3_BUCKET
export AWS_ACCESS_KEY_ID="<admin key id>" AWS_SECRET_ACCESS_KEY="<admin secret>"
export AWS_DEFAULT_REGION=auto                                        # the API's S3_REGION
```

**1. Inspect the bucket configuration.** BrewForm sets none of these, so any policy, extra ACL
grant, CORS rule, tag, lifecycle rule, versioning or website configuration you did not create
yourself is a finding:

```sh
aws s3api get-bucket-policy                --bucket "$S3_BUCKET" --endpoint-url "$S3_ENDPOINT"
aws s3api get-bucket-acl                   --bucket "$S3_BUCKET" --endpoint-url "$S3_ENDPOINT"
aws s3api get-bucket-cors                  --bucket "$S3_BUCKET" --endpoint-url "$S3_ENDPOINT"
aws s3api get-bucket-tagging               --bucket "$S3_BUCKET" --endpoint-url "$S3_ENDPOINT"
aws s3api get-bucket-lifecycle-configuration --bucket "$S3_BUCKET" --endpoint-url "$S3_ENDPOINT"
aws s3api get-bucket-versioning            --bucket "$S3_BUCKET" --endpoint-url "$S3_ENDPOINT"
aws s3api get-bucket-website               --bucket "$S3_BUCKET" --endpoint-url "$S3_ENDPOINT"
```

How to read the results:

- An error named `NoSuch…` (`NoSuchBucketPolicy`, `NoSuchCORSConfiguration`, `NoSuchTagSet`,
  `NoSuchLifecycleConfiguration`, `NoSuchWebsiteConfiguration`) means "not set": that is the
  expected result.
- `NotImplemented` means the provider does not support that configuration, so it cannot have been
  changed through it.
- `get-bucket-versioning` prints nothing when versioning was never enabled; a `Status` you did not
  set is a finding.
- `get-bucket-acl` always lists the owner's `FULL_CONTROL` grant; any other grant (for example to
  `AllUsers`) is a finding.

**2. Audit the object keys.** List every object, then flag each key that matches neither the
legacy pattern (`<13-digit timestamp>-<8 hex>[_medium].<ext>`) nor the new pattern
(`<uuidv4>[_medium].jpg|png|webp`). Keys containing `/`, `?` or `%` fail both patterns and are
always findings:

```sh
aws s3api list-objects-v2 --bucket "$S3_BUCKET" --endpoint-url "$S3_ENDPOINT" --output json > objects.json
jq -r '.Contents[]?.Key
  | select((test("^[0-9]{13}-[0-9a-f]{8}(_medium)?\\.[A-Za-z0-9]+$")
            or test("^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(_medium)?\\.(jpg|png|webp)$"))
           | not)' objects.json
```

Any output is a finding. BrewForm never sets object tags, so also check the tag sets of a sample of
legacy objects; a non-empty `TagSet` is a finding:

```sh
jq -r '.Contents[]?.Key | select(test("^[0-9]{13}-"))' objects.json | head -n 20 |
  while read -r key; do
    echo "$key"
    aws s3api get-object-tagging --bucket "$S3_BUCKET" --key "$key" --endpoint-url "$S3_ENDPOINT"
  done
```

**3. Compare the photo rows with the objects.** Photo rows store full URLs; the key is the last
path segment. List each photo's keys with the row's `created_at`, then join them with the object
listing (`DATABASE_URL` as the API uses it):

```sh
export LC_ALL=C   # sort and join must use the same collation
psql "$DATABASE_URL" -At -F $'\t' -c "
  SELECT regexp_replace(url, '^.*/', ''), created_at FROM photo
  UNION ALL
  SELECT regexp_replace(thumbnail_url, '^.*/', ''), created_at FROM photo
   WHERE thumbnail_url IS NOT NULL AND thumbnail_url <> url" | sort > photos.tsv
jq -r '.Contents[]? | [.Key, .LastModified, (.Size | tostring)] | @tsv' objects.json | sort > objects.tsv
join -t $'\t' -a 1 photos.tsv objects.tsv   # key, created_at, LastModified, Size
```

A row whose `LastModified` is clearly later than its `created_at` points at an object that was
replaced after upload; a row with no `LastModified`/`Size` columns points at a missing object.
Both are findings (open the image to confirm).

**4. Remediate.**

- Delete configuration you did not create:
  `aws s3api delete-bucket-policy`, `delete-bucket-cors`, `delete-bucket-tagging`,
  `delete-bucket-lifecycle` and `delete-bucket-website`, each with
  `--bucket "$S3_BUCKET" --endpoint-url "$S3_ENDPOINT"`. Reset extra ACL grants with
  `aws s3api put-bucket-acl --acl private --bucket "$S3_BUCKET" --endpoint-url "$S3_ENDPOINT"`,
  and suspend versioning you did not enable with
  `aws s3api put-bucket-versioning --versioning-configuration Status=Suspended --bucket "$S3_BUCKET" --endpoint-url "$S3_ENDPOINT"`.
- Restore overwritten objects from backup (or from an earlier object version if versioning was
  on), and delete unexpected objects after reviewing them
  (`aws s3api delete-object --bucket "$S3_BUCKET" --key "<key>" --endpoint-url "$S3_ENDPOINT"`).
- **Rotate the access key whenever any finding exists**: create a new scoped credential (below),
  set it as `S3_ACCESS_KEY` / `S3_SECRET_KEY` on the API resource, redeploy, then revoke the old one.

**5. Scope the app's credential to object read/write on the one bucket**, so a future bug cannot
reach bucket configuration. The API only reads, writes and deletes objects:

- **Cloudflare R2:** an API token with **Object Read & Write**, applied to `brewform-uploads` only
  (never "Admin Read & Write").
- **Garage:** a key allowed on the bucket without `--owner`:

  ```sh
  garage key create brewform-api
  garage bucket allow --read --write brewform-uploads --key brewform-api
  # if the key was created with owner rights earlier:
  garage bucket deny --owner brewform-uploads --key brewform-api
  ```

- **AWS S3 or MinIO:** a policy that grants only object actions on the bucket's objects:

  ```json
  {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
        "Resource": "arn:aws:s3:::brewform-uploads/*"
      }
    ]
  }
  ```

  On AWS, attach it to the IAM user whose keys the API uses. On MinIO:
  `mc admin policy create <alias> brewform-uploads-rw policy.json` and
  `mc admin policy attach <alias> brewform-uploads-rw --user brewform-api`.

---

## 11. Email — Mailtrap

- `SMTP_HOST=live.smtp.mailtrap.io`, `SMTP_PORT=587`, `SMTP_SECURE=false` (STARTTLS).
- `EMAIL_FROM` must be on a **Mailtrap-verified sending domain** (e.g. `mt.brewform.cc` with
  the DNS records Mailtrap provides), or mail bounces.
- With `ENABLE_REGISTRATION=false`, test deliverability via a **password reset** for the admin.

---

## 12. Step 10 — Redeploy after a publish

There is no CI webhook job: CI publishes images, and you redeploy from Coolify.

1. Wait for the `CI` run of your `main` commit to finish (GitHub → Actions → CI). Its `publish`
   job runs last, only after every other job passed, and pushes `:latest` and `:<full sha>`.
   A red or skipped `publish` means nothing new was published.
2. In Coolify open **brewform-api** → **Redeploy**, wait until it is healthy (the new container
   runs the migrations; the old one keeps serving until the health check passes), then
   **brewform-web** → **Redeploy**.
3. Check `https://api.brewform.cc/health` and `https://brewform.cc/healthz`.

To pin a release instead of `latest`, set the resource's tag to the full commit SHA or a
`vX.Y.Z` tag before redeploying. A redeploy can also be scripted against Coolify's own API
(`GET https://<coolify-host>/api/v1/deploy?uuid=<resource uuid>` with a token that has the
**Deploy** ability), but nothing in this repository calls it. Remove the old
`COOLIFY_API_WEBHOOK`, `COOLIFY_WEB_WEBHOOK` and `COOLIFY_API_TOKEN` repository secrets if they
still exist.

---

## 13. Maintenance

- **Update:** merge to `main` → the `CI` workflow tests the commit, builds and smoke-tests both
  images, and only then its `publish` job pushes `:latest` and `:<full sha>` (the exact images it
  tested) → Coolify **Redeploy** ([§12](#12-step-10--redeploy-after-a-publish)). The API
  entrypoint runs pending migrations and skips the seed.
- **Rollback:** every published commit is also tagged `:<full sha>` (and releases `:vX.Y.Z`).
  On the resource, change the tag from `:latest` to a known-good tag and Redeploy. Migrations are
  not rolled back; across a schema change, restore the database backup taken before the upgrade.
- **Expand/contract (single replica):** run one API replica. Coolify's rolling update starts the
  new container, which migrates, while the old one still serves, so a schema change that removes
  or renames something the running release uses ships in two releases: first add and backfill,
  then remove in a later release. More than one replica would need the migrations moved to a
  single job first.
- **Comment counts recounted (upgrade note):** every migration run now ends with the
  comment-count recount, so it runs on every API start with `RUN_MIGRATIONS` left on
  (`Recounting comment counts...`, then
  `Comment count recount: complete (scanned <n>, repaired <n>, skipped <n>)`). The first start
  after this upgrade repairs `recipe.comment_count` values that drifted before and logs each
  repaired recipe id with its old and new value
  (`Comment count recount: repaired recipe <id> (<old> -> <new>)`); later starts normally print
  `repaired 0`. A failed recount prints
  `WARNING: comment count recount failed; continuing (the next start retries).` and does not stop
  the start.
- **Migration 0020 rewrites the `recipe` table (upgrade note):** this release moves
  `recipe.created_at` to millisecond precision, which rewrites the `recipe` table once under an
  exclusive lock on the first start of the new API container. The old container keeps serving
  until the new one is healthy; on a large install that first start takes a moment longer.
- **Sitemap moved to the site root (upgrade note):** the sitemap is now a sitemap index at
  `/sitemap.xml`, and `/api/v1/sitemap.xml` answers `301` to it. After the upgrade, resubmit
  `<public origin>/sitemap.xml` in Google Search Console (the old URL redirects meanwhile). It is
  reachable on the web domain only in same-origin mode (`API_UPSTREAM`,
  [§7](#7-step-4--web-spa-docker-image)); in the split-domain setup it lives at
  `https://api.brewform.cc/sitemap.xml` and lists web-domain URLs, so submit it in Search Console
  for the web domain's property.
- **Change the API URL** the SPA calls: set `VITE_API_URL` as a runtime env on the **web**
  resource and redeploy — no rebuild ([§7](#7-step-4--web-spa-docker-image)).
- **Backups:** Postgres via Coolify's Database → Backups (send them to S3, off the server). The API
  cache is in-memory (rebuildable, nothing to back up). R2 has its own durability. With
  `STORAGE_DRIVER=local`, back up the `brewform-uploads` volume or directory too.

### Monitoring

Point uptime monitors at the liveness endpoints, never at `/ready`:

- `https://api.brewform.cc/health` — expect `200` and the text `"status":"ok"` (with the web edge
  proxying the API, `https://brewform.cc/health` works the same way);
- `https://brewform.cc/healthz` — the web container.

`/ready` is the readiness probe for the Coolify health check ([§6 step 4](#6-step-3--api-docker-image)):
it fails during database outages and shutdowns by design, which would page you for every
redeploy. Health-check changes in Coolify need a Redeploy to take effect.

### Before upgrading to wave 6 (identifier check)

Wave 6 adds three unique indexes: case-insensitive `user.email` and `user.username`
(`user_email_lower_unique`, `user_username_lower_unique`) and one active default setup per user
(`setup_user_default_unique`). Existing data can violate them, for example `Foo@x.io` and
`foo@x.io` as two accounts. Check the data **before** redeploying:

1. On the server, run the check from the **new** image as a one-off container on the API's
   network, with the API's `DATABASE_URL` value:

   ```sh
   docker run --rm --network <API network> -e DATABASE_URL=<API value> \
     --entrypoint node ghcr.io/ardakilic/brewform-api:<new tag> \
     /app/packages/db/src/check-identifiers.ts
   ```

   `<API network>` is the Docker network the API resource runs on (`coolify` for the setup in
   [§2](#2-networking-model-read-this--its-the-1-source-of-failures)). The report prints counts,
   user ids and usernames, never email addresses. It exits `0` when nothing blocks the upgrade
   and `1` otherwise. On a Docker Compose install the equivalent is
   `make prod-pull && make prod-check-identifiers` (see `docs/deployment_compose.md` §14).
2. Fix what it reports:
   - append `--fix-deleted-duplicates` to rewrite the email and username of **soft-deleted**
     accounts in a duplicate group;
   - append `--fix-setup-defaults` to keep each user's most recently updated default setup;
   - append `--fix-empty-slugs` to give legacy recipes with an empty slug a `recipe-<suffix>`
     slug (a warning only; it does not block the upgrade);
   - for two or more **active** accounts that differ only in letter case, contact the owners,
     then change all but one account's username (or email) as an admin through
     `PATCH /api/v1/admin/users/:id`.

   Re-run the check until it exits `0`.
3. Redeploy the API.

If you skip the check and the data conflicts, the migration rolls back as a whole (Drizzle applies
all pending migrations in one transaction), so the database is left unchanged. The new container
never becomes healthy, and the old one keeps serving until you fix the data and redeploy.

---

## 14. Troubleshooting (real issues hit during rollout)

| Symptom | Cause → Fix |
|---|---|
| API: "Invalid environment variables" on boot | Zod validation. Common: `JWT_SECRET` < 16, bad `DATABASE_URL`, or `S3_*` placeholders while `STORAGE_DRIVER=s3`. Blank values now count as unset (the default applies), so an empty variable is no longer a cause; a missing required one (`JWT_SECRET`, `DATABASE_URL`, `S3_*` with `STORAGE_DRIVER=s3`) still is. |
| API exits at boot with `Upload directory /app/uploads is not writable by uid 1000 gid 1000` | `STORAGE_DRIVER=local` with a Directory Mount the API user cannot write: `sudo chown -R 1000:1000 <source path>` on the server, then Redeploy ([§6 step 5](#6-step-3--api-docker-image)). |
| API logs a warning that the upload directory is not a mounted volume; `/ready` shows `storage: "ephemeral"` | `STORAGE_DRIVER=local` without Persistent Storage at `/app/uploads`: photos disappear on the next redeploy. Add the Volume Mount ([§6 step 5](#6-step-3--api-docker-image)) or switch to `STORAGE_DRIVER=s3`. |
| Local photos show the SPA or 404 on the web domain | The web resource has no `API_UPSTREAM` (or the API alias is missing): set the alias and `API_UPSTREAM=brewform-api:8000` ([§7](#7-step-4--web-spa-docker-image)). |
| Coolify shows the API as unhealthy although it serves | The dashboard check uses the `HTTP` type (needs curl/wget, absent from the image): switch it to `CMD` `node /app/healthcheck.mjs /ready` ([§6 step 4](#6-step-3--api-docker-image)). |
| All users hit `429` together behind Cloudflare | `TRUST_PROXY` is `none` or `hops`: set `TRUST_PROXY=cloudflare` ([§9](#9-cloudflare-proxy-orange-cloud)). |
| API can't reach DB (refused/timeout) | Resources not on the same Docker network. Managed DB + Docker Image apps share `coolify` ([§2](#2-networking-model-read-this--its-the-1-source-of-failures)). |
| Uploads 403 `SignatureMismatch` / 404 | `S3_ENDPOINT` includes the bucket name → double bucket. Use the **account endpoint only**. |
| `ERR_TOO_MANY_REDIRECTS` after enabling Cloudflare | Cloudflare SSL mode is `Flexible` → set **`Full (Strict)`** ([§9](#9-cloudflare-proxy-orange-cloud)). |
| CORS errors in browser | `CORS_ALLOWED_ORIGINS` must exactly match the frontend origin(s); restart API after changes. |
| `exec format error` on the host | amd64-only image on an ARM host → run on amd64 or rebuild multi-arch ([§3](#3-prerequisites)). |
| `docker pull` fails `no matching manifest for linux/arm64` (dev machine) | Add `--platform linux/amd64`. |
| Photos uploaded before this release 404, their URL has `//` after the bucket URL | They were uploaded while `S3_PUBLIC_URL` ended with `/`. The API now ignores a trailing slash, so new uploads are fine; repair the old rows once (below). |

**Repairing photo URLs stored with a trailing-slash `S3_PUBLIC_URL`.** Replace `<base>` with your
`S3_PUBLIC_URL` without the trailing slash (for example `https://cdn.brewform.cc`) and run this
once in the terminal of the PostgreSQL resource's container (operator SQL; use the database user
and name of your `DATABASE_URL`):

```sh
psql -U brewform -d brewform -c "
  UPDATE photo SET url = replace(url, '<base>//', '<base>/'),
         thumbnail_url = replace(thumbnail_url, '<base>//', '<base>/')
   WHERE url LIKE '<base>//%';"
```

---

## See also

- [`docs/deployment_compose.md`](deployment_compose.md) — self-hosting with
  `compose.production.yml` and the `make prod-*` targets (backups, restore, data storage).
- [`coolify_deployment_plan.md`](../coolify_deployment_plan.md) — long-form operator reference.
- [`docs/history/2026-10-11-serverless-deployment.md`](history/2026-10-11-serverless-deployment.md)
  — legacy hosted-platform reference from before the Node migration (superseded; retained for
  history).
- [`docs/docker.md`](docker.md) — local Docker dev environment.
