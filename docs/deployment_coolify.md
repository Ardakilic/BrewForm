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
        │  │ Image, Caddy   │   │ Image, Node /  │─── S3 ──────┼──▶ (custom domain cdn.*)
        │  │ :80)           │   │ tsx) :8000     │             │
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
- **Images are pulled from GHCR, not built by Coolify.** GitHub Actions (`release.yml`)
  builds + pushes `ghcr.io/ardakilic/brewform-{api,web}` on every `main` push; Coolify only
  pulls. The heavy Node/Vite build stays on GitHub runners.
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

## 5. Step 2 — Cache (in-memory default, no sidecar)

There is **no cache resource to create** for the default setup. The API runs with
`CACHE_DRIVER=memory` (see [§6](#6-step-3--api-docker-image)): an in-process Map with TTL
support. Cache is lost on restart, which is acceptable because the cache is never a source
of truth — Postgres is. For a shared cache, set `CACHE_DRIVER=redis` plus `REDIS_URL` and
provision any Redis-protocol server (Redis or Valkey); no code changes needed. Note the
split defaults: `compose.production.yml` ships `CACHE_DRIVER=redis` (with its own `redis`
service), while the env schema and this Coolify setup default to `memory`.

---

## 6. Step 3 — API (Docker Image)

1. **+ New → Docker Image**, same server/destination.
2. **Image** `ghcr.io/ardakilic/brewform-api` · **Tag** `latest` · **Ports Exposes** `8000`.
3. **Domain** `https://api.brewform.cc`.
4. **Healthcheck** → Path `/health` · Port `8000` · Status `200`. Use `/health` (liveness, no
   DB check), **not** `/ready` (which also probes the DB).
5. **Persistent Storage:** none (the cache is in-memory; uploads go to R2).
6. **Environment Variables** (Developer view). Key values + nuances:

   ```env
   APP_ENV=production
   LOG_FORMAT=json
   PUBLIC_APP_URL=https://brewform.cc
   APP_URL=https://brewform.cc          # frontend URL (QR codes, links) — NOT the API's own URL

   DATABASE_URL=postgresql://postgres:<pw>@postgresql-<uuid>:5432/postgres
   DATABASE_PROVIDER=postgresql

   CACHE_ENABLED=true
   CACHE_DRIVER=memory

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
   Cache initialized (enabled=true, driver=memory)
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

## 12. Step 10 — Auto-deploy via CI webhook

GitHub Actions builds/pushes the images; a final CI step pings Coolify's deploy
endpoint, which pulls `:latest` and recreates each container — no server-side builds.

1. Coolify → **Keys & Tokens → API Tokens** → create a token with the **Deploy** ability.
2. Get each resource's **UUID** (last segment of its dashboard URL, or its General
   settings) and build its deploy URL:
   `https://<coolify-host>/api/v1/deploy?uuid=<resource-uuid>`
   (Docker Image resources have no Git source, so the trigger is this API endpoint —
   not the resource's "Webhooks" tab, which is for Git providers.)
3. GitHub repo Secrets — `COOLIFY_API_TOKEN` (the Deploy token),
   `COOLIFY_API_WEBHOOK` (API deploy URL), `COOLIFY_WEB_WEBHOOK` (web deploy URL).
   `release.yml`'s `deploy` job redeploys both on every `main` push (it self-gates on
   `COOLIFY_API_WEBHOOK` + `COOLIFY_API_TOKEN`).

> If **Settings → Advanced → "Allowed IPs for API Access"** is set, leave it empty/`0.0.0.0`
> — GitHub runner IPs rotate and can't be allowlisted; the bearer token is the protection.

---

## 13. Maintenance

- **Update:** merge to `main` → `release.yml` rebuilds/pushes `:latest` → Coolify **Redeploy**
  (or the webhook auto-pulls). The API entrypoint re-runs migrations (no-op) and skips the seed.
- **Rollback:** `release.yml` also tags `:<sha>`. On the resource, change the tag from `:latest`
  to a known-good `:<sha>` and Redeploy.
- **Change the API URL** the SPA calls: set `VITE_API_URL` as a runtime env on the **web**
  resource and redeploy — no rebuild ([§7](#7-step-4--web-spa-docker-image)).
- **Backups:** Postgres via Coolify's Database → Backups. The API cache is in-memory
  (rebuildable, nothing to back up). R2 has its own durability.

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
   `docker compose -f compose.production.yml run --rm -w /app/packages/db --entrypoint node api src/check-identifiers.ts`.
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
| API: "Invalid environment variables" on boot | Zod validation. Common: `JWT_SECRET` < 16, bad `DATABASE_URL`, or `S3_*` placeholders while `STORAGE_DRIVER=s3`. |
| API can't reach DB (refused/timeout) | Resources not on the same Docker network. Managed DB + Docker Image apps share `coolify` ([§2](#2-networking-model-read-this--its-the-1-source-of-failures)). |
| Uploads 403 `SignatureMismatch` / 404 | `S3_ENDPOINT` includes the bucket name → double bucket. Use the **account endpoint only**. |
| `ERR_TOO_MANY_REDIRECTS` after enabling Cloudflare | Cloudflare SSL mode is `Flexible` → set **`Full (Strict)`** ([§9](#9-cloudflare-proxy-orange-cloud)). |
| CORS errors in browser | `CORS_ALLOWED_ORIGINS` must exactly match the frontend origin(s); restart API after changes. |
| `exec format error` on the host | amd64-only image on an ARM host → run on amd64 or rebuild multi-arch ([§3](#3-prerequisites)). |
| `docker pull` fails `no matching manifest for linux/arm64` (dev machine) | Add `--platform linux/amd64`. |

---

## See also

- [`coolify_deployment_plan.md`](../coolify_deployment_plan.md) — long-form operator reference.
- [`docs/deployment.md`](deployment.md) — legacy Deno Deploy reference (superseded; retained for history).
- [`docs/docker.md`](docker.md) — local Docker dev environment.
