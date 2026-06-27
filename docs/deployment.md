# Deployment

## Architecture Overview

```
┌────────────────────────────────────────────────────────┐
│                 Deno Deploy (Free Plan)                  │
│                                                         │
│  ┌──────────────────────┐   ┌────────────────────────┐ │
│  │  brewform-web        │   │  brewform-api           │ │
│  │  (Static Site, SPA)  │──▶│  (Dynamic: Hono API)   │ │
│  │  React + Vite build  │   │  Drizzle ORM + postgres │ │
│  │  brewform.cc         │   │  Deno KV (cache)        │ │
│  │  www.brewform.cc     │   │  api.brewform.cc        │ │
│  └──────────────────────┘   └──────┬─────────────────┘ │
└────────────────────────────────────┼───────────────────┘
                                     │
                          ┌──────────▼──────────┐
                          │  PostgreSQL (managed) │
                          │  Neon / Supabase /   │
                          │  AWS RDS             │
                          └─────────────────────┘
```

- **Frontend**: React SPA built with Vite, deployed to Deno Deploy as a static site with SPA mode
- **Backend**: Hono API running on Deno Deploy as a dynamic app, connecting to managed PostgreSQL
- **Cache**: Deno KV for taste note hierarchy, popular recipes, and search result caching
- **Storage**: S3-compatible object storage (Cloudflare R2, Backblaze B2, etc.)
- **Email**: SMTP (Mailpit in development, Mailtrap/SendGrid in production). MJML templates pre-compiled to TypeScript at build time

## Projects

Two separate Deno Deploy projects, both linked to the same GitHub repository:

| Project | Type | Domain | Entry / Config |
|---|---|---|---|
| `brewform-api` | Dynamic | `api.brewform.cc` | `apps/api/src/main.ts` |
| `brewform-web` | Static (SPA) | `brewform.cc`, `www.brewform.cc` | `apps/web/dist/` |

### `brewform-api` (Dynamic)

Configured in `apps/api/deno.json`:

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

The entry point (`apps/api/src/main.ts`) auto-detects Deno Deploy via `Deno.env.get('DENO_DEPLOY')`:
- On Deploy: `Deno.serve(app.fetch)` (platform assigns port)
- Locally: `Deno.serve({ port: config.APP_PORT }, app.fetch)` (default 8000)

### `brewform-web` (Static)

Configured in `apps/web/deno.json`:

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

- **Build command**: `deno run -A npm:vite build` (outputs to `apps/web/dist/`)
- **SPA mode**: Enabled — serves `index.html` for all unmatched paths (handles React Router client-side routes)
- **`VITE_API_URL`** injected at build time via Vite's `define` config:
  - Production: `https://api.brewform.cc/api/v1`
  - Development: `/api/v1` (proxied by Vite dev server)
  - **Runtime override (containerized / Coolify image only):** the Docker web image's
    entrypoint (`docker-web-entrypoint.sh`) regenerates `/config.js` from a `VITE_API_URL`
    env var at container start, overriding the baked default with no rebuild. The SPA reads
    `window.__BREWFORM_CONFIG__.apiUrl` first, then the build-time value, then `/api/v1`.

## Deployment Process

**Automatic via GitHub integration**. Every push to `main` triggers a deployment:

1. Push to `main`
2. GitHub Actions runs CI (quality + test jobs) — no deploy steps in CI
3. Deno Deploy's GitHub integration detects the push and builds independently for each project
4. Both projects deploy automatically

There is no `deployctl` usage, no manual deploy steps, and no deploy script in CI. The `deno.json` deploy configs define everything Deno Deploy needs.

## Domains

Three custom domains on the Free plan (50-domain limit):

| Domain | Project | DNS Record |
|---|---|---|
| `brewform.cc` | `brewform-web` | CNAME/ALIAS → `brewform-web.deno.dev` |
| `www.brewform.cc` | `brewform-web` | CNAME → `brewform-web.deno.dev` |
| `api.brewform.cc` | `brewform-api` | CNAME → `brewform-api.deno.dev` |

TLS certificates are provisioned and auto-renewed via Let's Encrypt.

## Environment Variables

### `brewform-api` — Production Context (runtime)

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (pooled) |
| `JWT_SECRET` | Cryptographically random, ≥32 characters |
| `CORS_ALLOWED_ORIGINS` | `https://brewform.cc` |
| `APP_URL` | `https://api.brewform.cc` |
| `APP_ENV` | `production` |
| `LOG_LEVEL` | `info` |
| `CACHE_DRIVER` | `deno-kv` |
| `SMTP_HOST` | Production SMTP host |
| `SMTP_PORT` | Production SMTP port |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `SMTP_SECURE` | `true` for production |
| `EMAIL_FROM` | `noreply@brewform.cc` |
| `STORAGE_DRIVER` | `s3` |
| `S3_ENDPOINT` | S3-compatible API endpoint |
| `S3_REGION` | S3 region (default: `auto`) |
| `S3_BUCKET` | S3 bucket name |
| `S3_ACCESS_KEY` | S3 access key |
| `S3_SECRET_KEY` | S3 secret key |
| `S3_PUBLIC_URL` | Public URL for serving uploaded files |
| `ADMIN_EMAIL` | Admin account email |
| `ADMIN_USERNAME` | Admin account username |
| `ADMIN_PASSWORD` | Admin account password |

### `brewform-api` — Build Context

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL URL for Drizzle migration generation |

### `brewform-web` — Build Context

| Variable | Description |
|---|---|
| `VITE_API_URL` | `https://api.brewform.cc/api/v1` |

> `VITE_API_URL` can **also** be supplied at **runtime** to the containerized web image
> (it overrides the build-time default via a regenerated `/config.js`); the other `VITE_*`
> vars are build-time only.

## Deno Deploy Free Plan Capabilities

| Resource | Limit | BrewForm Usage |
|---|---|---|
| Requests/month | 1M | API traffic |
| Bandwidth (egress) | 20 GB | API responses + static assets |
| CPU time/month | 15 hours | Request processing |
| Memory time/month | 350 GB-h | Runtime memory |
| Volume storage | 1 GiB | Code + config |
| Apps | 20 | 2 (api + web) |
| Custom domains | 50/org | 3 |
| Deno KV storage | 1 GiB | Cache data |
| Deno KV reads/month | 450K (4 KiB units) | Cache lookups |
| Deno KV writes/month | 300K (1 KiB units) | Cache writes |

**Deno.cron()**: Supported on Free plan. Currently 1 active job (`evaluate-badges`, hourly). A `refresh-popular-cache` job was planned but not implemented (see [Gaps](#gaps--unimplemented-features)).
**WebSockets**: Supported (design for reconnection — isolates may be evicted).
**Deno.Kv.enqueue()/listenQueue()**: Not supported on new platform.

## Known Platform Limitations

| Limitation | Impact |
|---|---|
| No static egress IPs | Database must accept connections from all IPs |
| 2 regions (us, eu) | Higher latency from distant regions |
| Build timeout: 5 min | May need Pro for larger builds |
| Log retention: 1 day | Logs available for 24 hours only |

## Gaps & Unimplemented Features

Items referenced in design docs or earlier plans that were **not implemented** but may be needed for production durability.

### `refresh-popular-cache` cron job

A second cron job to proactively refresh Deno KV cache entries (popular recipes, taste note hierarchy) on a 6-hour schedule was planned but never implemented. Currently, cache entries are populated on-demand (cache miss → compute → store). Low priority — no user-facing impact.

### Email notification retry queue

Per ADR-011, all social-event email notifications use a **fire-and-forget** pattern — transient SMTP failures are logged but the email is silently dropped. There is no retry mechanism.

`Deno.Kv.enqueue()` / `listenQueue()` (the natural Deno-native building blocks for a retry queue) are **not available** on the new Deno Deploy GA platform. Alternatives:
- Store pending emails in a PostgreSQL table with a retry column
- Use an external queue service (Upstash Redis, QStash)
- Implement retries via a scheduled `Deno.cron()` job

---

## CI/CD Pipelines

### Main Pipeline (`.github/workflows/ci.yml`)

Triggers on push to `main` and PRs to `main`:

1. **Quality**: Install deps, generate Drizzle migration (with `git diff --exit-code`), build email templates, format check, lint, type check
2. **Test** (requires quality): PostgreSQL service container, migrations, seed, full test suite with coverage

Deployment is handled by Deno Deploy's GitHub integration — **no deploy steps in CI**.

### PR Checks (`.github/workflows/pr.yml`)

Triggers on pull requests:

1. Format check, lint, type check
2. Shared package unit tests

## Local Development

### Quick Start

```bash
cp .env.example .env
make up          # Start infrastructure services
make install     # Cache Deno dependencies
make dev         # Full-stack dev (API :8000 + web :5173 with HMR)
```

### Services

| Service | URL / Port | Purpose |
|---|---|---|
| API | http://localhost:8000 | Hono backend (dev + preview) |
| Web (Vite HMR) | http://localhost:5173 | React dev server with HMR |
| Web (Caddy) | http://localhost:8080 | Built SPA preview |
| PostgreSQL | localhost:5432 | Database |
| Mailpit SMTP | localhost:1025 | SMTP for email testing |
| Mailpit UI | http://localhost:8025 | Email web UI |
| pgAdmin | http://localhost:5050 | Database GUI |
| Garage S3 | http://localhost:3900 | S3-compatible storage |

### Development vs Preview

**Development** (`make dev`): API with `--watch` hot reload + Vite HMR. Proxies `/api` to API container.

**Preview** (`make preview`): Builds production-like setup with Caddy serving static SPA + production API image.

### Useful Commands

```bash
deno task dev              # Both API + web with hot reload
deno task dev:api          # API with hot reload
deno task dev:web          # Vite dev server
deno task build            # Build all workspaces
deno task build:web        # Build React SPA only
deno task check            # Type-check all workspaces
deno task check:api        # Type-check API only
deno task check:web        # Lint web frontend
deno task db:generate      # Generate Drizzle migration
deno task db:migrate       # Run migrations
deno task db:seed          # Seed data
deno task email-build      # Compile email templates
deno task lint             # Lint
deno task fmt              # Format
deno task test             # Run tests
```

## PWA

The app includes a `manifest.json` for Progressive Web App support. In production:
- Ensure `/manifest.json` is served with `Content-Type: application/manifest+json`
- Ensure `/favicon.svg`, `/apple-touch-icon.png`, `/icon-192.png`, and `/icon-512.png` are served from the web root
- The `theme-color` meta tag enables branded browser chrome on Android
- The PWA manifest must be served from `/manifest.json` (Caddy/static hosting must not block this path).
