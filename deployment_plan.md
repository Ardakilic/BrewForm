# BrewForm Deployment Plan — Deno Deploy Step-by-Step

This document provides the exact sequence of commands and actions to deploy BrewForm to Deno Deploy. Assumes all code changes from `coding_plan.md` are complete and merged to `main`.

---

## Prerequisites

- [ ] GitHub repository for BrewForm with `main` branch
- [ ] Deno v2.x installed locally: `deno --version`
- [ ] Domain `brewform.cc` registered with DNS provider
- [ ] S3-compatible object storage account (Cloudflare R2, Backblaze B2, AWS S3, or iDrive E2)
- [ ] Mailtrap SMTP credentials

---

## Phase A: Local Final Verification

Run these commands on your local machine before touching Deno Deploy.

### A1. Pre-compile Email Templates
```bash
deno run -A apps/api/scripts/build-email-templates.ts
```
Verify 6 files exist in `apps/api/src/templates/email/generated/`.

### A2. Generate Prisma Clients
```bash
deno task db:generate
```
Verify both exist:
- `node_modules/.prisma/client/` (standard, for local dev)
- `packages/db/generated/prisma/` (Deno edge, for Deno Deploy)

### A3. Type Check
```bash
deno check --unstable-sloppy-imports apps/api/src/main.ts
deno check apps/web/src/main.tsx
```
Both must pass with zero errors.

### A4. Lint & Format
```bash
deno fmt --check apps/ packages/
deno lint apps/ packages/
```

### A5. Run Tests

Ensure `.env` is present (e.g. `cp .env.example .env`) so Docker Compose can
load service environment variables before starting dependent containers:

```bash
docker compose up -d postgres mailpit garage
deno task db:migrate
deno task db:seed
deno test --unstable-sloppy-imports --no-check --allow-all apps/api/src/ packages/shared/src/
```
All tests must pass.

### A6. Local End-to-End Smoke Test
```bash
# Terminal 1 — API
deno run --allow-all apps/api/src/main.ts

# Terminal 2 — Web
cd apps/web && deno task dev
```
- Visit `http://localhost:5173`
- Register a user
- Create a recipe
- Upload a photo
- Verify photo is visible
- Check Mailpit (`http://localhost:8025`) for welcome email
- Check Garage (`aws --endpoint-url=http://localhost:3900 s3 ls s3://brewform-uploads`) if testing S3 driver

### A7. Build Frontend Static Assets
```bash
cd apps/web
# bash / zsh / Linux / macOS
export VITE_API_URL=https://api.brewform.cc/api/v1
# Windows PowerShell
# $env:VITE_API_URL="https://api.brewform.cc/api/v1"
# Windows cmd.exe
# set VITE_API_URL=https://api.brewform.cc/api/v1
deno task build
```

### A8. Commit and Push
```bash
git add .
git commit -m "refactor: Deno Deploy readiness

- Prisma dual-mode (edge + binary client)
- Pre-compiled MJML email templates
- S3-compatible storage abstraction with local fallback
- Garage S3 for local dev
- Deno.cron() for scheduled jobs
- Deno Deploy static site config for web"
git push origin main
```

---

## Phase B: Deno Deploy Organization & Projects

### B1. Create Organization
1. Go to [dash.deno.com](https://dash.deno.com)
2. Sign in with GitHub
3. Create or select organization (e.g., `brewform`)
4. Verify with credit card (required for full free tier limits)

### B2. Create `brewform-api` (Dynamic App)
1. Dashboard → **New Project**
2. Name: `brewform-api`
3. Source: **GitHub**
4. Select your BrewForm repository
5. **App directory**: `apps/api`
6. Deno Deploy will auto-detect `deno.json` configuration. If not, configure manually:
   - **Install command**: `deno install`
   - **Build command**: `deno task db:generate`
   - **Pre-deploy command**: `deno run -A npm:prisma@^6.19.3 migrate deploy --schema=../../packages/db/prisma/schema.prisma`
   - **Runtime**: Dynamic
   - **Entrypoint**: `src/main.ts`
   - **Runtime working directory**: `.`

> Note: In the pre-deploy command, the schema path is relative to `apps/api/`, so `../../packages/db/prisma/schema.prisma` resolves correctly.

### B3. Create `brewform-web` (Static Site)
1. Dashboard → **New Project**
2. Name: `brewform-web`
3. Source: **GitHub**
4. Select same repository
5. **App directory**: `apps/web`
6. Deno Deploy auto-detects `deno.json` with static config. Verify:
   - **Install command**: `deno install`
   - **Build command**: `deno task build`
   - **Runtime**: Static
   - **Directory**: `./dist`
   - **SPA mode**: Enabled

---

## Phase C: Provision Prisma Postgres Database

### C1. Create Managed Database
1. In Deno Deploy dashboard → **Databases** → **Create Database**
2. Engine: **Prisma Postgres**
3. Region: Choose closest to your users (e.g., `us-east-1`, `eu-west-1`, `ap-southeast-1`)
4. Slug: `brewform-db`
5. Wait for provisioning (status: **Healthy**)

### C2. Retrieve Connection Strings
Click on the database to view:
- **Standard connection string** (`postgresql://...`) — for migrations and external tools
- **Accelerated connection string** (`prisma+postgres://...`) — for application runtime

Save both securely (password manager).

### C3. Attach Database to API Project
1. Go to `brewform-api` project → **Settings** → **Databases**
2. Click **Attach Database**
3. Select `brewform-db`
4. Deno Deploy automatically injects `DATABASE_URL` into the runtime environment

> However, because we use Prisma Accelerate, you must manually set `DATABASE_URL` to the **accelerated** connection string in the environment variables (see Phase D). The attached database auto-injection uses the standard string.

---

## Phase D: Configure Environment Variables

### D1. `brewform-api` — Production Context Variables

Navigate to `brewform-api` → **Settings** → **Environment Variables** → **Production** context.

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | `prisma+postgres://accelerate.prisma-data.net/?api_key=...` | Prisma Accelerate connection string |
| `JWT_SECRET` | `<generate>` | `openssl rand -hex 32` |
| `JWT_ACCESS_EXPIRY` | `15m` | |
| `JWT_REFRESH_EXPIRY` | `7d` | |
| `CORS_ALLOWED_ORIGINS` | `https://brewform.cc` | |
| `APP_URL` | `https://api.brewform.cc` | |
| `APP_ENV` | `production` | |
| `LOG_LEVEL` | `info` | |
| `CACHE_DRIVER` | `deno-kv` | Deno KV auto-provisioned |
| `SMTP_HOST` | `smtp.mailtrap.io` | Or your Mailtrap host |
| `SMTP_PORT` | `2525` | Or your Mailtrap port |
| `SMTP_USER` | `<mailtrap-username>` | |
| `SMTP_PASS` | `<mailtrap-password>` | Mark as **Secret** |
| `SMTP_SECURE` | `false` | `true` if port 465 |
| `EMAIL_FROM` | `noreply@brewform.cc` | |
| `STORAGE_DRIVER` | `s3` | |
| `S3_ENDPOINT` | `https://<account>.r2.cloudflarestorage.com` | Or your provider |
| `S3_REGION` | `auto` | Or `us-east-1`, etc. |
| `S3_BUCKET` | `brewform-uploads` | |
| `S3_ACCESS_KEY` | `<access-key>` | Mark as **Secret** |
| `S3_SECRET_KEY` | `<secret-key>` | Mark as **Secret** |
| `S3_PUBLIC_URL` | `https://pub-<hash>.r2.dev` | Public access URL for bucket |
| `ADMIN_EMAIL` | `admin@brewform.cc` | |
| `ADMIN_USERNAME` | `admin` | |
| `ADMIN_PASSWORD` | `<generate-strong>` | Mark as **Secret** |

### D2. `brewform-api` — Build Context Variables

Navigate to **Build** context. These are only available during the build/pre-deploy phase.

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://<standard-connection-string>` | Standard Prisma Postgres URL for migrations |

> The pre-deploy command runs with Build context variables, so `prisma migrate deploy` uses the standard connection string.

### D3. `brewform-web` — Build Context Variables

Navigate to `brewform-web` → **Settings** → **Environment Variables** → **Build** context.

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://api.brewform.cc/api/v1` |

---

## Phase E: Configure Custom Domains

### E1. DNS Configuration

In your domain registrar/DNS provider, add these CNAME records:

| Type | Name | Value | TTL |
|---|---|---|---|
| CNAME | `@` (apex) | `[brewform-web].deno.dev` | 300 |
| CNAME | `api` | `[brewform-api].deno.dev` | 300 |
| CNAME | `www` | `[brewform-web].deno.dev` | 300 |

> Replace `[brewform-web]` and `[brewform-api]` with your actual Deno Deploy project subdomains (visible in project settings).
>
> **Apex domain note**: Some DNS providers do not support CNAME on apex (`@`). Use an ALIAS/ANAME record if available, or use `www.brewform.cc` as primary and redirect apex to www.

### E2. Add Domains in Deno Deploy

#### `brewform-web`
1. Project → **Settings** → **Domains**
2. Add domain: `brewform.cc`
3. Add domain: `www.brewform.cc`
4. Deno Deploy verifies DNS. Status should change to **Active**.

#### `brewform-api`
1. Project → **Settings** → **Domains**
2. Add domain: `api.brewform.cc`
3. Wait for **Active** status.

---

## Phase F: First Deployment

### F1. Trigger Build

With GitHub integration, push to `main` automatically triggers builds for both projects.

If not yet linked, go to each project → **Settings** → **GitHub** → **Link Repository**.

### F2. Monitor Build for `brewform-api`
1. Go to `brewform-api` → **Builds**
2. Watch stages: Queuing → Preparing → Install → Build → Pre-deploy → Deploy
3. Pre-deploy step should output:
   ```text
   Prisma Migrate: applying migrations...
   ```
4. Verify **Successful** status.

### F3. Monitor Build for `brewform-web`
1. Go to `brewform-web` → **Builds**
2. Verify build produces `dist/` and deploys as static site.

---

## Phase G: Database Migration & Seeding

### G1. Run Migrations (if pre-deploy failed)

If the pre-deploy migration step failed, run manually from local machine:

```bash
export DATABASE_URL="postgresql://<standard-prisma-postgres-url>"
deno run -A npm:prisma@^6.19.3 migrate deploy --schema=packages/db/prisma/schema.prisma
```

### G2. Seed Database

Run the setup script against production database:

```bash
export DATABASE_URL="prisma+postgres://<accelerate-url>"
export ADMIN_EMAIL="admin@brewform.cc"
export ADMIN_USERNAME="admin"
export ADMIN_PASSWORD="<strong-password>"
deno run --allow-all apps/api/src/setup.ts
```

> This creates the initial admin user. It is idempotent — safe to re-run.

### G3. Verify Database Schema

```bash
export DATABASE_URL="postgresql://<standard-url>"
deno task db:studio
```
Open Prisma Studio and confirm tables exist: `User`, `Recipe`, `Photo`, `Badge`, etc.

---

## Phase H: End-to-End Production Verification

### H1. API Health Check
```bash
curl https://api.brewform.cc/health
# Expected: {"success":true,"data":{"status":"ok"}}
```

### H2. OpenAPI Schema
```bash
curl https://api.brewform.cc/openapi.json
# Expected: JSON OpenAPI spec
```
> Run this verification **before** disabling OpenAPI in Phase I1. Skip if `OPENAPI_ENABLED` is already `false`.

### H3. Frontend Load
1. Visit `https://brewform.cc`
2. Verify React app loads (no 404, no blank page)

### H4. SPA Routing
1. Visit `https://brewform.cc/recipes/some-test-slug` directly
2. Verify React Router handles the route (not 404 from server)

### H5. User Registration
```bash
curl -X POST https://api.brewform.cc/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@brewform.cc","username":"testuser","password":"TestPass123!"}'
```
- Check Mailtrap inbox for welcome email
- Verify email HTML renders correctly (no MJML errors)

### H6. Photo Upload (S3)
```bash
curl -X POST https://api.brewform.cc/api/v1/photos \
  -H "Authorization: Bearer <token>" \
  -F "recipeId=<recipe-id>" \
  -F "file=@test.jpg"
```
- Response should contain a URL like `https://pub-<hash>.r2.dev/<filename>`
- Visit the URL — image should display
- Check S3 bucket (via provider dashboard or CLI) — object exists

### H7. QR Code Generation
```bash
curl https://api.brewform.cc/api/v1/qrcode/recipe/<slug>.png
# Should return PNG bytes with Content-Type: image/png
```

### H8. Cron Jobs
1. Go to `brewform-api` → **Cron** tab in Deno Deploy dashboard
2. Verify two jobs are listed:
   - `evaluate-badges` (schedule: `0 * * * *`)
   - `refresh-popular-cache` (schedule: `0 */6 * * *`)
3. Wait for the next scheduled run
4. Verify execution history shows **Success**

### H9. Deno KV Cache
```bash
curl https://api.brewform.cc/api/v1/taste-notes
# First call: cache miss (slower)
# Second call: cache hit (faster, served from Deno KV)
```

### H10. Admin Panel
1. Log in with admin credentials
2. Verify admin routes (`/api/v1/admin/*`) are accessible
3. Check audit logs are written

---

## Phase I: Cleanup & Hardening

### I1. Disable OpenAPI in Production (Strongly recommended)
Set `OPENAPI_ENABLED=false` in `brewform-api` Production context. Strongly recommended: disable in production / set to `false` to reduce attack surface.

### I2. Review Secrets
In Deno Deploy dashboard:
- Ensure `JWT_SECRET`, `SMTP_PASS`, `ADMIN_PASSWORD`, `S3_SECRET_KEY` are marked as **Secret**
- Secrets are encrypted and masked in logs/UI

### I3. Enable Preview Deployments (Optional)
For `brewform-api`:
1. Settings → **GitHub** → Enable **Preview deployments**
2. Every Pull Request gets its own deployment URL
3. Preview databases are isolated per branch (if using Prisma Postgres)

### I4. Set Up Monitoring
- Deno Deploy dashboard provides built-in logs and metrics
- Go to `brewform-api` → **Observability** for request logs, errors, and latency
- Set up log alerts if on Pro plan

### I5. Configure CORS Strictly
Verify `CORS_ALLOWED_ORIGINS` is exactly `https://brewform.cc` (no wildcards, no extra origins).

---

## Phase J: Rollback Procedure

If a deployment breaks production:

### J1. Rollback via Dashboard
1. `brewform-api` → **Builds**
2. Find last known good revision
3. Click **Rollback**
4. Deno Deploy instantly routes traffic to the previous revision

### J2. Rollback Database (Emergency)
If a bad migration ran:
1. Connect to Prisma Postgres directly using standard connection string
2. Use `prisma migrate resolve` to mark migration as rolled back:
   ```bash
   export DATABASE_URL="postgresql://<standard-url>"
   deno run -A npm:prisma@^6.19.3 migrate resolve --rolled-back <migration-name> --schema=packages/db/prisma/schema.prisma
   ```
3. Restore from backup if data loss occurred (Prisma Postgres provides automated backups)

---

## Troubleshooting Guide

### Build Fails: "Cannot find module '../generated/prisma/client.ts'"
**Cause**: `db:generate` step missing or Prisma edge client not generated.
**Fix**: Ensure build command includes `deno task db:generate`.

### Build Fails: "mjml is not found"
**Cause**: Email templates not pre-compiled before build.
**Fix**: Add `deno run -A apps/api/scripts/build-email-templates.ts` to build command.

### API Returns 500 on First Request
**Cause**: Prisma Accelerate connection string incorrect or database not attached.
**Fix**: Verify `DATABASE_URL` starts with `prisma+postgres://`. Check database health in Deno Deploy dashboard.

### Photos Return 404
**Cause**: `S3_PUBLIC_URL` incorrect or bucket/object not publicly readable.
**Fix**: Verify `S3_PUBLIC_URL` matches your provider's public access endpoint. Check bucket permissions.

### Emails Not Sent
**Cause**: Mailtrap SMTP blocked or credentials wrong.
**Fix**: Check `brewform-api` logs in Deno Deploy dashboard. Verify SMTP_HOST/PORT. Try Mailtrap HTTP API as fallback.

### Cron Jobs Not Running
**Cause**: `Deno.cron()` definitions not detected.
**Fix**: Ensure `Deno.cron()` is called at top level (not inside a function that conditionally runs). Check Cron tab in dashboard.

### Frontend Shows "Cannot connect to API"
**Cause**: `VITE_API_URL` incorrect or CORS blocked.
**Fix**: Rebuild frontend with correct `VITE_API_URL`. Verify `CORS_ALLOWED_ORIGINS` includes `https://brewform.cc`.

### Database Connection Errors
**Cause**: Prisma Accelerate timeouts, migration lock conflicts, connection pool exhaustion, or network/firewall issues between Deno Deploy and Prisma Postgres.
**Fix**: Verify `DATABASE_URL` uses `prisma+postgres://`. Check Prisma/Postgres health and migration locks. Tune Prisma pool settings (`connection_limit` / `pool_timeout`) or use a serverless-friendly pooler. Ensure Deno Deploy region/network can reach the database; check Deno Deploy dashboard and database region for latency issues.

---

## Cost Estimation (Free Tier)

| Service | Free Tier Limit | BrewForm Usage |
|---|---|---|
| Deno Deploy (Dynamic) | 100k requests/day + 10GB transfer | API traffic |
| Deno Deploy (Static) | 100k requests/day + 10GB transfer | Frontend assets |
| Deno KV | 1GB storage + 250k ops/day | Cache, sessions |
| Prisma Postgres | 500MB storage (free tier) | Application data |
| Mailtrap | 100 emails/month (free) | Transactional email |
| Cloudflare R2 | 10GB storage + 1M ops free | Photo storage |

**Expected monthly cost: $0** (within free tiers for small-to-medium usage).

---

## Post-Deploy Maintenance Checklist

### Weekly
- [ ] Check Deno Deploy dashboard for error logs
- [ ] Verify cron job execution history
- [ ] Review Mailtrap delivery logs

### Monthly
- [ ] Check database size (Prisma Postgres dashboard)
- [ ] Check S3 bucket size and costs
- [ ] Review Deno Deploy usage metrics
- [ ] Rotate `ADMIN_PASSWORD` if needed

### Quarterly
- [ ] Update Deno version (Deno Deploy auto-updates runtime)
- [ ] Update dependencies (`deno install` to refresh lockfile)
- [ ] Run `deno task db:generate` after any Prisma updates
- [ ] Security review: check for leaked secrets in logs

---

## Quick Reference: Useful Commands

```bash
# Local dev
deno task dev              # Start API with hot reload
deno task dev:web          # Start Vite dev server
deno task db:generate      # Generate both Prisma clients
deno task db:migrate       # Run migrations
deno task db:seed          # Seed data
deno task db:setup         # Create admin user
deno task email:build      # Compile email templates
deno task lint             # Lint all code
deno task fmt              # Format all code
deno task check            # Type check API
deno task test             # Run test suite
deno task test:coverage    # Run tests with coverage

# Local Docker
docker compose up -d       # Start postgres, mailpit, garage
docker compose down        # Stop all services

# Deno Deploy CLI (optional)
deno deploy                # Deploy current directory (requires setup)
deno deploy create --org brewform --app brewform-api --source github --owner <you> --repo BrewForm

# Database (production)
export DATABASE_URL="prisma+postgres://..."
deno run --allow-all apps/api/src/setup.ts
```

---

## Deployment Complete ✅

Once all phases are verified, BrewForm is live on:
- **Web**: `https://brewform.cc`
- **API**: `https://api.brewform.cc`
- **Admin**: Log in at `https://brewform.cc` with credentials set in Phase D1
