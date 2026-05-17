# BrewForm Deployment Plan — Deno Deploy

Step-by-step guide to deploy BrewForm to Deno Deploy (new GA platform).

Assumes all code changes are complete and merged to `main`.

---

## Platform Context

Deno Deploy has **two platforms**. This plan targets the **new GA platform** (not Deploy Classic):

| | Classic (legacy) | New GA (current) |
|---|---|---|
| Regions | 6 regions | **2 regions** (us, eu) + global routing |
| Sunset | **July 20, 2026** | N/A |
| Deno KV | Supported | Supported + 1 GiB free |
| Deno.cron() | Supported | Supported |

**Action**: Create all new projects on the new GA platform. If you have Classic projects, migrate before July 2026.

---

## Prerequisites

- [ ] GitHub repository for BrewForm with `main` branch
- [ ] Deno v2.x installed locally: `deno --version`
- [ ] Domain `brewform.cc` registered with DNS provider
- [ ] PostgreSQL database (managed: Neon, Supabase, AWS RDS, or self-hosted)
- [ ] S3-compatible object storage (Cloudflare R2, Backblaze B2, AWS S3, or iDrive E2)
- [ ] SMTP credentials (Mailtrap, SendGrid, etc.)

---

## Phase A: Local Final Verification

### A1. Pre-compile Email Templates

```bash
deno task email-build
```

Verify 6 files exist in `apps/api/src/templates/email/generated/`.

### A2. Generate Drizzle Migration

```bash
deno task db:generate
```

Verify migration SQL file is generated in `packages/db/drizzle/`.

### A3. Type Check

```bash
deno task check
```

Must pass with zero errors.

### A4. Lint & Format

```bash
deno fmt --check
deno lint apps/ packages/
```

### A5. Run Tests

```bash
docker compose up -d postgres mailpit garage
deno task db:migrate
deno task db:seed
deno task test
```

All tests must pass.

### A6. Local End-to-End Smoke Test

```bash
# Terminal 1 — API
deno task dev

# Terminal 2 — Web
deno task --cwd apps/web dev
```

- Visit `http://localhost:5173`
- Register a user, create a recipe, upload a photo
- Check Mailpit (`http://localhost:8025`) for welcome email

### A7. Build Frontend Static Assets

```bash
VITE_API_URL=https://api.brewform.cc/api/v1 deno task --cwd apps/web build
```

### A8. Commit and Push

```bash
git add .
git commit -m "chore: deployment readiness"
git push origin main
```

---

## Phase B: Deno Deploy Organization & Projects

### B1. Create Organization

1. Go to [dash.deno.com](https://dash.deno.com)
2. Sign in with GitHub
3. Create organization (e.g., `brewform`)

### B2. Create `brewform-api` (Dynamic App)

Project configuration is already defined in `apps/api/deno.json`:

```json
{
  "deploy": {
    "install": "deno install",
    "build": "deno task --cwd ../../packages/db generate && deno task email-build",
    "runtime": {
      "mode": "dynamic",
      "entrypoint": "src/main.ts"
    }
  }
}
```

**Steps**:

1. Dashboard → **New Project**
2. Name: `brewform-api`
3. Source: **GitHub** → select repository
4. Framework auto-detection: pick **none** (custom)
5. App directory (root directory): `.` (monorepo root)
6. **Entrypoint**: `apps/api/src/main.ts`
7. Build command should auto-populate from `deno.json`. Verify:
   - Install: `deno install` (will be picked up from root)
   - Build: uses `apps/api/deno.json` deploy config

> **Install context**: The project is a Deno workspace. `deno install` resolves all workspace dependencies from the root. The build command in `apps/api/deno.json` references the monorepo root via `--cwd ../../` paths, so the deploy root directory must be set to the monorepo root (`.`), not `apps/api/`.

### B3. Create `brewform-web` (Static Site)

Configuration in `apps/web/deno.json`:

```json
{
  "deploy": {
    "install": "deno install",
    "build": "deno task build",
    "runtime": {
      "mode": "static",
      "cwd": "./dist",
      "spa": true
    }
  }
}
```

**Steps**:

1. Dashboard → **New Project**
2. Name: `brewform-web`
3. Source: **GitHub** → select repository
4. Framework auto-detection: pick **Vite**
5. Root directory: `.` (monorepo root)
6. Verify:
   - Build command: `deno run -A npm:vite build --root apps/web` (or auto-detected)
   - Output dir: `apps/web/dist`
   - SPA mode: enabled

> Deno Deploy's framework auto-detection may set the root to `apps/web`. If so, the build output dir would be `dist` (relative). Either approach works — just verify paths are consistent.

---

## Phase C: Provision PostgreSQL Database

### C1. Create Managed Database

Choose a provider. All major PostgreSQL providers work with Deno Deploy:

| Provider | Free Tier | Notes |
|---|---|---|
| Neon | 0.5 GB, 100h compute/month | Serverless, auto-pause |
| Supabase | 500 MB | Includes auth, real-time |
| Aiven | 5 GB free for 30 days | |
| Railway | $5/month minimum | |
| AWS RDS | Pay-as-you-go | |

**Important**: Deno Deploy **does not provide static egress IPs**. Your database must accept connections from all IPs. Use connection pooling (PgBouncer, Supabase pooler, or Neon's built-in pooling) since serverless functions create many short-lived connections.

### C2. Attach Database to API Project

1. Go to `brewform-api` → **Settings** → **Environment Variables**
2. Add `DATABASE_URL` with the connection string
3. Mark as **Secret**

---

## Phase D: Configure Environment Variables

### D1. `brewform-api` — Production Context

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/dbname` | Use pooled connection string |
| `JWT_SECRET` | `<openssl rand -hex 32>` | Mark as **Secret** |
| `JWT_ACCESS_EXPIRY` | `15m` | |
| `JWT_REFRESH_EXPIRY` | `7d` | |
| `CORS_ALLOWED_ORIGINS` | `https://brewform.cc` | |
| `APP_URL` | `https://api.brewform.cc` | |
| `APP_ENV` | `production` | |
| `LOG_LEVEL` | `info` | |
| `CACHE_DRIVER` | `deno-kv` | Auto-provisioned on Deploy |
| `SMTP_HOST` | `smtp.mailtrap.io` | Or your provider |
| `SMTP_PORT` | `2525` | |
| `SMTP_USER` | `<username>` | |
| `SMTP_PASS` | `<password>` | Mark as **Secret** |
| `SMTP_SECURE` | `false` | |
| `EMAIL_FROM` | `noreply@brewform.cc` | |
| `STORAGE_DRIVER` | `s3` | |
| `S3_ENDPOINT` | `https://<account>.r2.cloudflarestorage.com` | |
| `S3_REGION` | `auto` | |
| `S3_BUCKET` | `brewform-uploads` | |
| `S3_ACCESS_KEY` | `<access-key>` | Mark as **Secret** |
| `S3_SECRET_KEY` | `<secret-key>` | Mark as **Secret** |
| `S3_PUBLIC_URL` | `https://pub-<hash>.r2.dev` | Public URL for bucket |
| `ADMIN_EMAIL` | `admin@brewform.cc` | |
| `ADMIN_USERNAME` | `admin` | |
| `ADMIN_PASSWORD` | `<generate-strong>` | Mark as **Secret** |

### D2. `brewform-api` — Build Context

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://<connection-string>` | For Drizzle migrations at build time |

### D3. `brewform-web` — Build Context

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://api.brewform.cc/api/v1` |

---

## Phase E: Configure Custom Domains

### E1. Registry Setup

Deno Deploy supports three DNS methods:
- **ANAME/ALIAS** (preferred for apex domains)
- **CNAME** (subdomains only)
- **A record** (apex)

**Free plan**: Add each subdomain individually (`brewform.cc`, `www.brewform.cc`, `api.brewform.cc`). Wildcard `*.brewform.cc` is Pro-only.

| Type | Name | Target |
|---|---|---|
| CNAME/ALIAS | `@` | `brewform-web.deno.dev` |
| CNAME | `www` | `brewform-web.deno.dev` |
| CNAME | `api` | `brewform-api.deno.dev` |

Replace target subdomains with your actual project subdomains from the dashboard.

> Deno Deploy does not support IPv6 (no AAAA records). If using Cloudflare, **disable proxy** (grey cloud) for `_acme-challenge` CNAME during verification.

### E2. Add Domains in Deno Deploy

#### `brewform-web`
1. Project → **Settings** → **Domains**
2. Add `brewform.cc` and `www.brewform.cc`
3. Follow DNS verification instructions
4. Status → **Active**

#### `brewform-api`
1. Project → **Settings** → **Domains**
2. Add `api.brewform.cc`
3. Status → **Active**

TLS certificates (Let's Encrypt) are provisioned and auto-renewed.

---

## Phase F: First Deployment

### F1. Trigger Build

Push to `main` triggers automatic deployments for both projects via GitHub integration.

If projects aren't linked yet: Project → **Settings** → **GitHub** → **Link Repository**.

### F2. Monitor `brewform-api` Build

1. Dashboard → `brewform-api` → **Deployments**
2. Stages: Queuing → Preparing → Install → Build → Deploy
3. Build output should include:
   - Drizzle migration generated in `packages/db/drizzle/`
   - Email templates compiled in `apps/api/src/templates/email/generated/`
4. Status → **Successful**

### F3. Monitor `brewform-web` Build

1. Dashboard → `brewform-web` → **Deployments**
2. Verify Vite build produces `apps/web/dist/`
3. Status → **Successful**

---

## Phase G: Database Migration & Seeding

### G1. Run Migrations (First Time)

**Via Deno Deploy dashboard**: Set `DATABASE_URL` in **Build** context variables (Phase D2), then deploy once with migration generation. The build step generates migration SQL files, but actual migration execution can be done via:

Option A — Run from local machine:
```bash
DATABASE_URL="postgresql://<connection-string>" deno task db:migrate
```

Option B — Run as pre-deploy command (configure in dashboard):
```
deno run -A --allow-env npm:drizzle-kit migrate --config=packages/db/drizzle.config.ts
```

### G2. Seed Database

```bash
DATABASE_URL="postgresql://<connection-string>" \
ADMIN_EMAIL="admin@brewform.cc" \
ADMIN_USERNAME="admin" \
ADMIN_PASSWORD="<strong-password>" \
deno run --allow-all apps/api/src/setup.ts
```

This creates the admin user. Idempotent — safe to re-run.

---

## Phase H: End-to-End Production Verification

### H1. API Health Check

```bash
curl https://api.brewform.cc/health
# {"success":true,"data":{"status":"ok"}}
```

### H2. OpenAPI Schema

```bash
curl https://api.brewform.cc/openapi.json
```

### H3. Frontend Load

1. Visit `https://brewform.cc`
2. Verify React app loads

### H4. SPA Routing

1. Visit `https://brewform.cc/recipes/some-slug` directly
2. Verify React Router handles the route (SPA mode serves `index.html`)

### H5. User Registration

```bash
curl -X POST https://api.brewform.cc/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@brewform.cc","username":"testuser","password":"TestPass123!"}'
```

### H6. Photo Upload (S3)

```bash
curl -X POST https://api.brewform.cc/api/v1/photos \
  -H "Authorization: Bearer <token>" \
  -F "recipeId=<recipe-id>" \
  -F "file=@test.jpg"
```

### H7. QR Code Generation

```bash
curl https://api.brewform.cc/api/v1/qrcode/recipe/<slug>.png
```

### H8. Cron Jobs

Go to `brewform-api` → **Cron** tab in dashboard. Verify the active job:
- `evaluate-badges` (hourly)

> `refresh-popular-cache` was planned in earlier designs but **not implemented**. See [Gaps](#gaps--unimplemented-features).

### H9. Deno KV Cache

```bash
curl https://api.brewform.cc/api/v1/taste-notes
# First call: cache miss (slower)
# Second call: cache hit (faster)
```

### H10. Admin Panel

1. Log in with admin credentials
2. Verify admin routes (`/api/v1/admin/*`) are accessible

---

## Phase I: Cleanup & Hardening

### I1. Disable OpenAPI in Production

Set `OPENAPI_ENABLED=false` in `brewform-api` Production context.

### I2. Review Secrets

Ensure `JWT_SECRET`, `SMTP_PASS`, `ADMIN_PASSWORD`, `S3_SECRET_KEY`, `DATABASE_URL` are marked as **Secret**.

### I3. Enable Preview Deployments (Optional)

Project → **Settings** → **GitHub** → Enable preview deployments. Every PR gets a preview URL. Note: each preview deployment has its own KV store instance.

### I4. Set Up Monitoring

- Deno Deploy dashboard: `brewform-api` → **Logs** and **Metrics**
- Log retention on Free plan: **1 day** (upgrade to Pro for 1 week)
- Consider external uptime monitoring (e.g., Upptime, Better Uptime)

### I5. Configure CORS Strictly

`CORS_ALLOWED_ORIGINS` should be exactly `https://brewform.cc` (no wildcards).

---

## Phase J: Rollback Procedure

### J1. Rollback via Dashboard

1. `brewform-api` → **Deployments**
2. Find last known good deployment
3. Click **Rollback** — instantly routes traffic to previous revision

### J2. Rollback Database (Emergency)

If a bad migration ran, restore from backup or apply a down-migration manually.

---

## Free Tier Capacity Planning

| Resource | Deno Deploy Free Limit | Expected Traffic Headroom |
|---|---|---|
| Requests/month | 1M | ~1,400 req/day sustained |
| Bandwidth (egress) | 20 GB/month | ~650 MB/day |
| CPU time/month | 15 hours | ~30 min/day sustained |
| Memory time/month | 350 GB-h | ~12 GB-h/day sustained |
| Volume storage | 1 GiB | Code + static assets |
| **Deno KV** | | |
| Storage | 1 GiB | Cache data |
| Read units/month | 450K (4 KiB units) | ~15K reads/day |
| Write units/month | 300K (1 KiB units) | ~10K writes/day |
| Custom domains | 50/org | Using 3 |
| Apps | 20 | Using 2 |

**Expected monthly cost: $0** for small-to-medium usage.

**Provisioning guidance for managed services:**

| Service | Recommended Free Tier | Notes |
|---|---|---|
| PostgreSQL | Neon 0.5 GB | Serverless, auto-pause when idle |
| Object storage | Cloudflare R2 | 10 GB free, no egress fees |
| Email (transactional) | Mailtrap | 100 emails/month free |

---

## Known Platform Limitations

| Limitation | Impact | Workaround |
|---|---|---|
| No static egress IPs | DB must accept from all IPs | Use connection pooler; restrict by DB user/password |
| Only 2 regions (us, eu) | Higher latency for distant users | None on Free plan |
| No `Deno.Kv.enqueue()` / `listenQueue()` | Queue-based patterns unavailable | Use direct DB writes or external queue |
| Build timeout: 5 min (Free) | Large builds may fail | Optimize build; upgrade for 15 min on Pro |
| Max deployment size: <1 GB | Large static assets may fail | Use S3/CDN for large files |
| No IPv6 support | Cloudflare proxy must be disabled | Use grey cloud / DNS-only mode |

---

## Gaps & Unimplemented Features

These are items referenced in design docs or earlier plans that were **not implemented** and may be needed for production durability.

### `refresh-popular-cache` cron job

**Status**: ❌ Not implemented
**Priority**: Low — no visible user impact, only affects performance

A second `Deno.cron()` job named `refresh-popular-cache` was planned to periodically refresh Deno KV cache entries (popular recipes, taste note hierarchy, search results) on a 6-hour schedule. Currently, cache entries are populated on-demand (cache miss → compute → store) and have no proactive refresh.

**If** cache hit rates become a concern in production, implement:
```ts
Deno.cron('refresh-popular-cache', '0 */6 * * *', async () => {
  await refreshPopularRecipesCache();
  await refreshTasteNotesCache();
});
```

### Email notification retry queue

**Status**: ❌ Not implemented (by design — see ADR-011)
**Priority**: Medium — transient SMTP failures cause silent email drops

Per ADR-011, all social-event email notifications (`notifyNewFollower`, `notifyRecipeLiked`, `notifyRecipeCommented`, `notifyFollowersOfNewRecipe`) use a **fire-and-forget** pattern. If the SMTP server is unreachable or returns an error, the failure is logged but the email is silently dropped. There is no retry queue, dead-letter queue, or backoff mechanism.

`Deno.Kv.enqueue()` / `listenQueue()` would be the natural Deno-native building blocks for a retry queue, but they are **not available** on the new Deno Deploy GA platform. Alternatives for implementing email retries:

| Approach | Pros | Cons |
|---|---|---|
| Store pending emails in PostgreSQL table | Full control, ACID | Adds DB load, requires cleanup |
| External queue (Upstash Redis/QStash) | Managed, reliable | Adds a service dependency |
| Scheduled cron retries | Simple | Fixed interval, not event-driven |

---

## Quick Reference: Useful Commands

```bash
# Local development
deno task dev                         # API with hot reload
deno task --cwd apps/web dev          # Vite dev server
deno task db:generate                 # Generate Drizzle migration
deno task db:migrate                  # Run migrations
deno task db:seed                     # Seed data
deno task email-build                 # Compile email templates
deno task lint                        # Lint all code
deno task fmt                         # Format all code
deno task check                       # Type check
deno task test                        # Run test suite

# Docker workflow
docker compose up -d                  # Start infra (postgres, mailpit, garage)
docker compose down                   # Stop all services

# Production
DATABASE_URL="postgresql://..." deno task db:migrate
DATABASE_URL="postgresql://..." deno run --allow-all apps/api/src/setup.ts
```

---

## Deployment Complete ✅

| Service | URL | Type |
|---|---|---|
| Web | `https://brewform.cc` | Deno Deploy (static) |
| Web (www) | `https://www.brewform.cc` | Deno Deploy (static) |
| API | `https://api.brewform.cc` | Deno Deploy (dynamic) |
| PostgreSQL | Managed provider (Neon/Supabase) | External |
| Object storage | Cloudflare R2 | External |
| Email | Mailtrap SMTP | External |
