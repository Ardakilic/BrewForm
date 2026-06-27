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
        │  │ Image, Caddy   │   │ Image, Deno)   │─── S3 ──────┼──▶ (custom domain cdn.*)
        │  │ :80)           │   │ :8000          │             │
        │  └───────────────┘   └──┬─────────┬───┘             │
        │                          │         │                 │
        │            ┌─────────────┘         └──────────┐      │
        │            ▼                                  ▼      │
        │  ┌───────────────────┐            ┌───────────────┐ │
        │  │ PostgreSQL         │            │ denokv         │ │
        │  │ (Coolify-managed)  │            │ (Docker Compose│ │
        │  │ postgresql-<uuid>  │            │  sidecar)      │ │
        │  └───────────────────┘            │ denokv-<uuid>  │ │
        │                                    │ :4512, /data   │ │
        │                                    └───────────────┘ │
        └─────────────────────────────────────────────────────┘
                                   │ SMTP
                                   ▼
                          Mailtrap (live sending)
```

**Four Coolify resources** + two external services:

| Resource | Type | Purpose | Internal name |
|---|---|---|---|
| `brewform-db` | Managed Database (PostgreSQL) | app data | `postgresql-<uuid>` |
| `denokv` | **Docker Compose** | remote Deno KV cache | `denokv-<uuid>` |
| `brewform-api` | Docker Image | the Hono/Deno API | (n/a, has FQDN) |
| `brewform-web` | Docker Image | the React SPA (Caddy) | (n/a, has FQDN) |

External: **Cloudflare R2** (uploads, served via `cdn.brewform.cc`), **Mailtrap** (email).

**Why these choices:**
- **Images are pulled from GHCR, not built by Coolify.** GitHub Actions (`release.yml`)
  builds + pushes `ghcr.io/ardakilic/brewform-{api,web}` on every `main` push; Coolify only
  pulls. The heavy Deno/Vite build stays on GitHub runners.
- **denokv runs as a Docker Compose resource, not a Docker Image resource** — see
  [§5](#5-step-2--denokv-cache-docker-compose).
- **The API holds no uploads on disk** — `STORAGE_DRIVER=s3` → R2.

---

## 2. Networking model (read this — it's the #1 source of failures)

Coolify v4 deploys **each resource to its own isolated Docker network by default**. "Same
server/destination" is **not** enough for containers to resolve each other by name.

- **Managed databases** and **standalone Docker Image apps** are attached to the shared
  **`coolify`** network automatically, so the API (Docker Image) reaches Postgres
  (`postgresql-<uuid>`) out of the box.
- **Docker Compose resources get their own isolated network.** To let the API reach the
  `denokv` compose service, the compose resource must enable **"Connect to Predefined
  Network"** — that joins it to `coolify`, and you then address it as `denokv-<uuid>`.

Find a resource's real internal hostname on the server:

```bash
docker ps --format '{{.Names}}' | grep -i denokv     # e.g. denokv-ojbuh8rspbp8my0dn0gav7fw
```

---

## 3. Prerequisites

- **Coolify v4.1.x** with a server + destination (the default `coolify` network).
- **DNS A records → server IP** (verify with `dig +short <host>`):
  - `brewform.cc`, `www.brewform.cc` (optional), `api.brewform.cc`
  - `cdn.brewform.cc` is a **Cloudflare R2 custom domain**, not a Coolify record (see [§10](#10-uploads--cloudflare-r2)).
- **GitHub repo Secrets** (baked into the **web** image at build by `release.yml`):
  - `VITE_API_URL=https://api.brewform.cc/api/v1`
  - `VITE_PUBLIC_APP_URL=https://brewform.cc`
  - After setting them, push to `main` (or re-run the latest `release.yml` run — secrets are
    read at run time) so the web image bakes the right URLs.
- **GHCR images public:** GitHub → Packages → `brewform-api` / `brewform-web` → make public
  (so Coolify pulls without `docker login`). Verify anonymously:

  ```bash
  tok=$(curl -s "https://ghcr.io/token?service=ghcr.io&scope=repository:ardakilic/brewform-web:pull" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
  curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $tok" \
    -H "Accept: application/vnd.oci.image.index.v1+json" \
    https://ghcr.io/v2/ardakilic/brewform-web/manifests/latest   # 200 = public
  ```

- **Generate secrets** (reused below):

  ```bash
  openssl rand -hex 32   # JWT_SECRET
  openssl rand -hex 32   # denokv access token (>= 12 chars required)
  ```

- **Architecture caveat:** the published GHCR images are **amd64-only**. On an ARM64 host they
  fail with `exec format error`; on an ARM dev machine `docker pull` needs `--platform
  linux/amd64`. To run on ARM hosts, rebuild multi-arch (`platforms: linux/amd64,linux/arm64`
  + `docker/setup-qemu-action` in `release.yml`).

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

## 5. Step 2 — denokv cache (Docker Compose)

> **Why Compose and not a Docker Image resource?** In Coolify v4.1.2 a *Docker Image* resource
> has **no field to pass a container command with arguments**. `denokv`'s entrypoint is just
> the `denokv` binary, so with no `serve` subcommand it prints help and **exits**. A *Docker
> Compose* resource supports `command:`, which is what denokv needs.

1. **+ New → Docker Compose Empty**, name `denokv`. Paste (token from §3):

   ```yaml
   services:
     denokv:
       image: ghcr.io/denoland/denokv:0.14.0
       restart: unless-stopped
       command: ["--sqlite-path", "/data/denokv.sqlite", "serve", "--access-token", "<DENOKV_TOKEN>"]
       volumes:
         - denokv-data:/data
   volumes:
     denokv-data:
   ```

   Notes: **list form** for `command` (exact args; `--sqlite-path` is a global flag **before**
   `serve`, `--access-token` comes **after**). No `ports:` / no domain → internal only. The
   named volume persists `/data/denokv.sqlite`. **No healthcheck** (denokv has no `GET /`
   route; a default HTTP check would flap — the API fail-fasts if denokv is down).
2. **Enable "Connect to Predefined Network"** on the resource (mandatory — see [§2](#2-networking-model-read-this--its-the-1-source-of-failures)).
3. **Deploy.** Logs should show `Listening on http://0.0.0.0:4512`.
4. Get the internal hostname: `docker ps --format '{{.Names}}' | grep -i denokv` →
   `denokv-<uuid>`. Used as `DENO_KV_URL=http://denokv-<uuid>:4512`.

> **Lighter alternative (single API instance):** skip the sidecar and use an **embedded local
> Deno KV** — set `CACHE_DRIVER=deno-kv` and `DENO_KV_URL=/data/denokv.sqlite` (a *path*, not a
> URL) on the API plus a `/data` volume. `Deno.openKv()` opens a local SQLite KV; no sidecar,
> no networking. The remote sidecar is only needed to share one cache across **multiple** API
> replicas.

---

## 6. Step 3 — API (Docker Image)

1. **+ New → Docker Image**, same server/destination.
2. **Image** `ghcr.io/ardakilic/brewform-api` · **Tag** `latest` · **Ports Exposes** `8000`.
3. **Domain** `https://api.brewform.cc`.
4. **Healthcheck** → Path `/health` · Port `8000` · Status `200`. Use `/health` (liveness, no
   DB check), **not** `/ready` (which also probes the DB).
5. **Persistent Storage:** none (denokv holds its own data; uploads go to R2).
6. **Environment Variables** (Developer view). Key values + nuances:

   ```env
   APP_ENV=production
   LOG_FORMAT=json
   PUBLIC_APP_URL=https://brewform.cc
   APP_URL=https://brewform.cc          # frontend URL (QR codes, links) — NOT the API's own URL

   DATABASE_URL=postgresql://postgres:<pw>@postgresql-<uuid>:5432/postgres
   DATABASE_PROVIDER=postgresql

   CACHE_DRIVER=deno-kv
   DENO_KV_URL=http://denokv-<uuid>:4512
   DENO_KV_ACCESS_TOKEN=<DENOKV_TOKEN>  # Deno KV Connect reads this automatically for auth

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

7. **Deploy.** First boot (empty DB) runs migrations + seed automatically via
   `docker-entrypoint.sh`. Watch for:

   ```text
   Running database migrations...
   Migrations complete.
   Database is empty, running seed...
   Seeding complete.
   Starting BrewForm API...
   Deno KV cache initialized (remote)         ← proves the API reached denokv over the network
   BrewForm API running on http://localhost:8000
   ```

8. Verify: `https://api.brewform.cc/health` → `200 {"status":"ok"}`;
   `https://api.brewform.cc/ready` → `200` (DB connected).

---

## 7. Step 4 — Web SPA (Docker Image)

1. **+ New → Docker Image**, same destination.
2. **Image** `ghcr.io/ardakilic/brewform-web` · **Tag** `latest` · **Ports Exposes** `80`.
3. **Domain** `https://brewform.cc`.
4. **Healthcheck** → Path `/` · Port `80` · Status `200`.
5. **Environment Variables:**
   - **Optional** `VITE_API_URL=https://api.brewform.cc/api/v1` — overrides the build-time
     default at runtime (see below). The published image already bakes this value, so leaving
     env empty also works.
   - **Do NOT** bother setting `VITE_PUBLIC_APP_URL` — it is **build-time only** (baked into
     `index.html` OG meta + `robots.txt`); a runtime value has **no effect**.
6. **Deploy.** Logs show the entrypoint line: `runtime VITE_API_URL applied: …` (if you set the
   env) or `no runtime VITE_API_URL set; using build-time default`.

> **Runtime-configurable API URL (PR #104):** the web image's entrypoint
> (`docker-web-entrypoint.sh`) regenerates `/config.js` from `$VITE_API_URL` at container start
> (validated against a URL allowlist), and the SPA reads
> `globalThis.__BREWFORM_CONFIG__.apiUrl` → build-time `VITE_API_URL` → `/api/v1`. This lets a
> prebuilt image be pointed at any API origin **without a rebuild**. `VITE_PUBLIC_APP_URL`
> stays build-time only.

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
- **Real client IP:** the rate limiter (`middleware/rateLimit.ts`) keys off `x-forwarded-for`.
  Cloudflare includes the client IP in `X-Forwarded-For` (and sets `CF-Connecting-IP`), so
  per-client limiting still works. If you want the exact client IP everywhere, prefer
  `CF-Connecting-IP`.
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
3. Create an **R2 API token** (Object Read & Write) → `S3_ACCESS_KEY` / `S3_SECRET_KEY`.
4. **Connect a custom domain** `cdn.brewform.cc` to the bucket (R2 → bucket → Settings →
   Public Access → Connect Domain) → `S3_PUBLIC_URL=https://cdn.brewform.cc`. Files are served
   as `https://cdn.brewform.cc/<filename>`.
5. Verify: upload a recipe photo in-app; confirm the URL is `https://cdn.brewform.cc/…` and the
   object appears in the bucket.

---

## 11. Email — Mailtrap

- `SMTP_HOST=live.smtp.mailtrap.io`, `SMTP_PORT=587`, `SMTP_SECURE=false` (STARTTLS).
- `EMAIL_FROM` must be on a **Mailtrap-verified sending domain** (e.g. `mt.brewform.cc` with
  the DNS records Mailtrap provides), or mail bounces.
- With `ENABLE_REGISTRATION=false`, test deliverability via a **password reset** for the admin.

---

## 12. Step 10 — Auto-deploy webhook (optional)

1. Coolify → Settings → API → enable; create a **Deploy**-scoped token.
2. API resource → Webhooks → copy deploy URL; same for the web resource.
3. GitHub repo Secrets: `COOLIFY_API_TOKEN`, `COOLIFY_API_WEBHOOK`, `COOLIFY_WEB_WEBHOOK`.
   `release.yml`'s `deploy` job then redeploys both on every `main` push.

---

## 13. Maintenance

- **Update:** merge to `main` → `release.yml` rebuilds/pushes `:latest` → Coolify **Redeploy**
  (or the webhook auto-pulls). The API entrypoint re-runs migrations (no-op) and skips the seed.
- **Rollback:** `release.yml` also tags `:<sha>`. On the resource, change the tag from `:latest`
  to a known-good `:<sha>` and Redeploy.
- **Change the API URL** the SPA calls: set `VITE_API_URL` as a runtime env on the **web**
  resource and redeploy — no rebuild ([§7](#7-step-4--web-spa-docker-image)).
- **Backups:** Postgres via Coolify's Database → Backups. denokv's `/data` volume is just cache
  (rebuildable). R2 has its own durability.

---

## 14. Troubleshooting (real issues hit during rollout)

| Symptom | Cause → Fix |
|---|---|
| denokv resource shows `Exited` immediately | Deployed as a *Docker Image* resource (no command field) → use a **Docker Compose** resource ([§5](#5-step-2--denokv-cache-docker-compose)). |
| API: "Invalid environment variables" on boot | Zod validation. Common: `JWT_SECRET` < 16, bad `DATABASE_URL`, or `S3_*` placeholders while `STORAGE_DRIVER=s3`. |
| API can't reach DB/cache (refused/timeout) | Resources not on the same Docker network. Managed DB + Docker Image apps share `coolify`; the **compose** denokv needs **"Connect to Predefined Network"** ([§2](#2-networking-model-read-this--its-the-1-source-of-failures)). |
| Uploads 403 `SignatureMismatch` / 404 | `S3_ENDPOINT` includes the bucket name → double bucket. Use the **account endpoint only**. |
| `ERR_TOO_MANY_REDIRECTS` after enabling Cloudflare | Cloudflare SSL mode is `Flexible` → set **`Full (Strict)`** ([§9](#9-cloudflare-proxy-orange-cloud)). |
| CORS errors in browser | `CORS_ALLOWED_ORIGINS` must exactly match the frontend origin(s); restart API after changes. |
| `exec format error` on the host | amd64-only image on an ARM host → run on amd64 or rebuild multi-arch ([§3](#3-prerequisites)). |
| `docker pull` fails `no matching manifest for linux/arm64` (dev machine) | Add `--platform linux/amd64`. |

---

## See also

- [`coolify_deployment_plan.md`](../coolify_deployment_plan.md) — long-form operator reference.
- [`docs/deployment.md`](deployment.md) — Deno Deploy / build-context env reference.
- [`docs/docker.md`](docker.md) — local Docker dev environment.
