# ☕ BrewForm

A web application for digitalizing, sharing, and discovering coffee brewing recipes and tasting
notes.

## Features

- **Recipe Management** — Create, version, and fork coffee brewing recipes with full parameter
  tracking; visibility is public, unlisted (direct link only), private or draft
- **Brew Journal** — Log each brew of a recipe (version, actual dose and yield, rating, notes) and see your
  brew history and per-recipe stats
- **Collections** — Group recipes into named collections, reorder them, and browse other
  brewers' public collections
- **Coffee Varieties** — Browse 98 coffee varieties (botanical, processing methods, specialty lots) with search, filtering, and recipe linkage
- **Equipment Catalog** — 378 coffee machines, grinders, brewers, kettles, and tools across 17 equipment types with branded search and recipe integration
- **SCAA Taste Notes** — Structured tasting notes from the SCAA 2016 Flavor Wheel with autocomplete
- **Brew Method Compatibility** — Data-driven validation ensures brew methods and equipment are
  compatible
- **Social Features** — Follow brewers, like/favourite recipes, comment with OP-only replies; admins can reply to and delete any comment
- **Notifications** — In-app notification bell and list (new followers, likes, comments and
  @mentions in comments) plus email, which also announces new recipes from brewers you follow;
  each category has its own preference toggle
- **Version Control** — Each recipe edit can create an immutable version snapshot; browse the
  full history and diff any two versions side by side
- **Compare and Merge** — Compare two recipes field by field and merge selected parameters of
  both into a new recipe draft
- **Advanced Search** — Ranked recipe search (trigram-indexed) with filters (brew method, drink
  type, equipment, coffee variety, taste notes, author, date and rating ranges) and cursor
  pagination
- **Sitemap and Social Previews** — `/sitemap.xml` is a sitemap index whose pages list the static
  pages, public recipes and their authors' profiles (50,000 URLs per page), and shared links render
  Open Graph previews for crawlers
- **🌐 Language Switcher** — Switch between English and Turkish from the footer dropdown
- **Achievement Badges** — Gamification system with data-driven badge rules
- **QR Codes** — Generate shareable QR codes for public and unlisted recipes (PNG and SVG)
- **Three Themes** — Light, Dark, and Coffee mode
- **Canonical Units** — All data stored in metric; UI converts to user preferences
- **Onboarding Wizard** — Guided 5-step setup for new users
- **Admin Area** — User management (create, edit, ban and unban), recipe and catalog management
  (equipment, vendors, taste notes, coffee varieties, badges, compatibility rules), the audit log,
  cache tools and dashboard stats. The report moderation queue and the analytics charts are
  API-only (`/api/v1/admin/reports`, `/api/v1/admin/analytics/*`) until their admin UI ships
  (F15/F17 in [`plans/ROADMAP.md`](plans/ROADMAP.md))

## Tech Stack

| Layer      | Technology                                                                     |
| ---------- | ------------------------------------------------------------------------------ |
| Runtime    | Node 26 LTS (tsx in development)                                               |
| Monorepo   | pnpm workspaces                                                                |
| Backend    | Hono                                                                           |
| Frontend   | React 19 + React Router + Vite + Tailwind CSS v4 + Base UI                     |
| ORM        | Drizzle ORM (postgres-js driver)                                               |
| Database   | PostgreSQL 18                                                                  |
| Cache      | In-memory default or Redis-protocol via `CACHE_DRIVER=redis` (Valkey 9.1 in compose); `CACHE_ENABLED` |
| Storage    | Local filesystem or S3-compatible (Garage)                                     |
| Email      | MJML (pre-compiled at build time)                                              |
| Validation | Zod (shared between frontend and backend)                                      |
| Lint/format| Biome                                                                          |
| Testing    | Vitest + Testing Library                                                       |
| CI/CD      | GitHub Actions → GHCR (CI-gated publish)                                       |

## Quick Start

All commands run through Docker. No local Node/pnpm installation required.

```bash
# Clone the repository
git clone https://github.com/Ardakilic/BrewForm.git
cd BrewForm

# Copy environment config (required by Docker Compose services such as Garage)
cp .env.example .env

# Start infrastructure services (postgres, mailpit, pgadmin, garage)
make up

# Install pnpm dependencies
make install

# Build email templates (required before running the API)
make email-build

# Generate Drizzle migration SQL
make db-generate

# Run database migrations
make db-migrate

# Seed the database
make db-seed

# Start full-stack development server (API on :8000 + Web on :5173 with hot reload)
make dev
```

Open **http://localhost:5173** for the web app and **http://localhost:8000** for the API.

### Seeded accounts

The seed (`make db-seed` here; the API image's `migrate` step on its first boot) runs against a
database whose `users` table is empty. It always creates the admin account and the reference
catalogs (brew-method rules, badges, the equipment catalog, coffee varieties, vendors and the SCAA
taste notes). The demo users and their content exist only when `APP_ENV` is not `production`:

| Account | Email | Password |
| ------- | ----- | -------- |
| Admin | `admin@brewform.local` (`ADMIN_EMAIL`), username `admin` (`ADMIN_USERNAME`) | `admin123456`, or `ADMIN_PASSWORD` when set |
| Demo users `alice`, `bob`, `charlie`, `diana`, `evan` (not with `APP_ENV=production`) | `<username>@example.com` | `user123456` |

The `ADMIN_*` variables are read only when the admin row is created; changing them later does not
update an existing admin. Outside production the seed also inserts demo content (18 recipes,
beans, setups, comments, collections and brew logs for the demo users). A production install
(`APP_ENV=production`, set by the production images' compose file and the Coolify guide) gets
only the admin and the reference catalogs; change the admin password right after the first
start. Production installs created before this release still have the five demo accounts with
the published password: remove them with the cleanup step in
[`docs/deployment_compose.md`](docs/deployment_compose.md) ("Installs created before this
release: remove the demo accounts") or [`docs/deployment_coolify.md`](docs/deployment_coolify.md)
(§13).

### Tests

DB-backed tests run against a separate `brewform_test` database. Provision it once after
`make up` (idempotent, safe to re-run after new migrations):

```bash
make test-db-provision
make test
```

## Development

```bash
# Dev servers
make dev            # Start full-stack dev server (API :8000 + web :5173 with HMR)
make dev-api        # Start API only with hot reload (:8000)
make web-dev        # Start web dev server only (:5173, requires API already running)

# Build
make build-api      # Build API (compile email templates)
make build-web      # Build React SPA for production (output: apps/web/dist/)
make build-shared   # Type-check shared package as build artifact
make preview        # Build web + preview production build (API :8000 + web :8080)

# Code quality
make check          # Type-check all workspaces (api, web, db, shared)
make check-api      # Type-check API only
make check-web      # Type-check web frontend
make check-db       # Type-check database package
make check-shared   # Type-check shared package
make lint           # Lint all apps and packages
make fmt            # Format the codebase
make fmt-check      # Check formatting without changes
make docs-check     # Doc-drift check (docs/specs) + docblock scan of exported symbols

# Dependencies
make install          # Install pnpm dependencies (frozen lockfile)
make lockfile-update  # Regenerate pnpm-lock.yaml inside Docker (after dep changes)

# Testing
make test-db-provision  # Create + migrate + seed the brewform_test DB (once, before DB-backed tests)
make test               # Run all tests (API + shared + db + web)
make test-coverage      # Run tests with coverage
make test-api           # Run API tests only
make test-shared        # Run shared package tests only
make test-web           # Run web (Vitest + Testing Library) tests only
make test-specific filter=src/path/to/file.test.ts  # Run one api/db/shared test file (substring match; not web)
make check-tests        # Type-check test files

# CI
make ci             # Full CI pipeline locally (fmt, lint, check, build, test, docs)
```

> **Why `make up` does not start the app?**
> `make up` only starts infrastructure (database, mail, storage, etc.). The API and web dev server
> are started on-demand via `make dev`. This prevents a "port already allocated" error that would
> occur if the API container were already running when you run `make dev`.

> **Docker Volume Strategy**
> Dev containers use a named `node_modules` volume layered over the bind mount. This ensures
> platform-specific native bindings (e.g. `rolldown`) use the Linux binaries inside the container
> rather than the host's macOS binaries. See [`docs/docker.md`](docs/docker.md) for details and
> troubleshooting.

> **Why `pnpm run` instead of a task runner?**
> The root `package.json` `scripts` field with per-workspace sub-scripts (run via
> `pnpm --filter`) covers all orchestration needs. Granular scripts like `check:api`,
> `build:web`, and `dev:api` compose into aggregate `check`, `build`, and `dev` scripts.
> No external task runner required — the `package.json` `scripts` are the single source of
> truth for all build, test, lint, and dev workflows.

## Database

```bash
make db-generate     # Generate a Drizzle migration from packages/db/src/schema.ts
make db-migrate      # Apply pending migrations
make db-push         # Prototyping only — use db-generate + db-migrate for schema changes
make db-seed         # Seed reference + demo data (378 equipment, 98 varieties, 18 recipes, demo users)
make db-studio       # Open Drizzle Studio (GUI)
make db-check-identifiers  # Report rows that break the case-insensitive identifier indexes
make flush-db        # Truncate all database tables
make flush-cache     # Clear API cache
make flush-contents  # Truncate all tables + clear API cache
make db-reset        # Drop + recreate the dev DB, enable pg_trgm, push schema, seed, flush cache
```

Schema changes are made in `packages/db/src/schema.ts` and shipped as a generated migration
(`make db-generate && make db-migrate`). `make db-reset` builds the dev database with
`drizzle-kit push`, so run `make db-migrate` only against databases created by migrations.

## Architecture

```
apps/web ──────→ packages/shared
                       ↑
apps/api ──┬──→ packages/shared
           └──→ packages/db ──→ packages/shared
```

- **`apps/api/`** — Hono backend API (Node 26; `tsx` watch in development, native TypeScript in the image)
- **`apps/web/`** — React SPA frontend (static build served by Caddy, which can also proxy `/api` same-origin)
- **`packages/shared/`** — Types, Zod schemas, constants, utils, i18n
- **`packages/db/`** — Drizzle schema, migrations, seed data, client

The frontend **never** imports from `@brewform/db`.

## Project Structure

```
brewform/
├── apps/
│   ├── api/                    # Hono backend
│   │   └── src/
│   │       ├── main.ts         # Server bootstrap, graceful shutdown
│   │       ├── config/         # Zod-validated env config
│   │       ├── middleware/     # CORS, requestId, rateLimit, bodyLimit, crawler, auth, errorHandler
│   │       ├── modules/        # Domain modules (auth, recipe, health, ...)
│   │       ├── routes/         # Route aggregator, OpenAPI, sitemap, share pages
│   │       ├── utils/          # logger, cache, rate-limit, client-ip, response, storage, upload, jobs
│   │       ├── types/          # Hono env, MJML type declarations
│   │       └── templates/      # MJML email templates
│   └── web/                    # React SPA frontend
│       └── src/
│           ├── routes/         # Root route, resource routes, actions
│           ├── pages/          # Route page components + their loaders (*.data.ts)
│           ├── components/     # Reusable UI components
│           ├── contexts/       # Auth, Theme, I18n providers
│           ├── api/            # API client + typed endpoint functions
│           └── styles/         # Global CSS, theme system
├── packages/
│   ├── shared/                 # Types, schemas, constants, utils, i18n
│   └── db/                    # Drizzle schema, migrations, seed
├── files/
│   ├── scaa-2.json              # SCAA 2016 flavor wheel data
│   ├── coffee_types_v2.json     # Coffee varieties reference data (98 entries)
│   └── coffee_equipments_v2.json # Equipment catalog reference data (378 items)
├── docs/                      # Feature & API documentation (index: docs/README.md)
├── scripts/                   # Doc-drift check, docblock scan, CI helper scripts
├── .github/workflows/ci.yml   # The single CI workflow (checks, image smoke tests, publish)
├── compose.yml                # Development stack
├── compose.production.yml     # Self-hosted production stack
├── Dockerfile                 # API image
├── Dockerfile.web             # Web image (Caddy)
├── Makefile
├── package.json
├── pnpm-workspace.yaml
└── biome.json
```

## Services

| Service         | URL                       | Purpose                          |
| --------------- | ------------------------- | -------------------------------- |
| API             | http://localhost:8000     | Hono backend (dev + preview)     |
| Web (Vite HMR)  | http://localhost:5173     | React dev server with hot reload |
| Web (Caddy)     | http://localhost:8080     | Built SPA preview                |
| PostgreSQL      | localhost:5432            | Database                         |
| Valkey          | `valkey:6379` (compose network only) | Optional Redis-protocol cache / rate-limit store; not started by `make up` (`docker compose up -d valkey`, then `CACHE_DRIVER=redis` / `RATE_LIMIT_STORE=redis`) |
| Mailpit SMTP    | localhost:1025            | SMTP server for email testing    |
| Mailpit UI      | http://localhost:8025     | Email web UI                     |
| pgAdmin         | http://localhost:5050     | Database GUI                     |
| Garage S3 API   | http://localhost:3900     | S3-compatible object storage     |
| Garage Web      | http://localhost:3902     | Garage web gateway               |

## Self-hosting

Production runs the published GHCR images. Two supported setups:

- **Docker Compose** — [`docs/deployment_compose.md`](docs/deployment_compose.md) with
  `compose.production.yml` and the `make prod-*` targets (`prod-up`, `prod-down`, `prod-ps`,
  `prod-logs`, `prod-pull`, `prod-backup`, `prod-backup-export`, `prod-restore`, `prod-smoke`, …;
  run `make help` for the full list).
- **Coolify** — [`docs/deployment_coolify.md`](docs/deployment_coolify.md) (as-built) and
  [`coolify_deployment_plan.md`](coolify_deployment_plan.md) (long-form).

## API

The API is versioned at `/api/v1/`.

- [docs/api.md](docs/api.md) — conventions: envelopes, error codes, authentication, pagination,
  rate limits, request limits, visibility.
- [docs/api-reference.md](docs/api-reference.md) — every route, generated from the OpenAPI
  metadata (`pnpm --filter @brewform/api run docs:api`).
- Interactive docs: the Scalar UI at `/api/v1/docs` and the spec at `/api/v1/openapi.json`
  (when `OPENAPI_ENABLED` is on).

## Documentation

The full index is [docs/README.md](docs/README.md).

| Document                                               | Description                                                 |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| [docs/README.md](docs/README.md)                       | Index of current documentation and `docs/history/`          |
| [docs/api.md](docs/api.md)                             | API conventions (envelopes, errors, pagination, limits, visibility) |
| [docs/api-reference.md](docs/api-reference.md)         | Generated per-route API reference                           |
| [docs/auth.md](docs/auth.md)                           | Authentication flows and token strategy                     |
| [docs/recipes.md](docs/recipes.md)                     | Recipe versioning, forking, validation, visibility          |
| [docs/comments.md](docs/comments.md)                   | Comment threads, OP-only replies, @mentions                 |
| [docs/coffee-data.md](docs/coffee-data.md)             | Coffee varieties (98 entries) and equipment catalog         |
| [docs/coffee-equipments.md](docs/coffee-equipments.md) | Equipment catalog reference (378 items, 17 types)           |
| [docs/taste-notes.md](docs/taste-notes.md)             | SCAA Flavor Wheel integration and autocomplete              |
| [docs/notifications.md](docs/notifications.md)         | In-app and email notifications, preferences, @mentions      |
| [docs/logging.md](docs/logging.md)                     | Structured logging rules and request ids                    |
| [docs/seo.md](docs/seo.md)                             | Meta tags, sitemap, robots, social previews, noindex rules  |
| [docs/architecture.md](docs/architecture.md)           | Monorepo structure, module pattern, conventions             |
| [docs/request-lifecycle.md](docs/request-lifecycle.md) | End-to-end trace of an HTTP request through the API         |
| [docs/decisions.md](docs/decisions.md)                 | Architectural decision records (the _why_ behind the stack) |
| [docs/docker.md](docs/docker.md)                       | Docker development environment, volume strategy, troubleshooting |
| [docs/deployment_compose.md](docs/deployment_compose.md) | Self-hosting with Docker Compose (`compose.production.yml`, `make prod-*`) |
| [docs/deployment_coolify.md](docs/deployment_coolify.md) | Coolify self-hosted deployment (as-built, GHCR, nuances)    |

**History** (superseded, kept for reference — do not follow):

| Document | Description |
| -------- | ----------- |
| [docs/history/2026-10-11-serverless-deployment.md](docs/history/2026-10-11-serverless-deployment.md) | The retired serverless deployment guide, superseded by the Compose and Coolify guides |
| [docs/history/2026-05-03-requirements-audit-report.md](docs/history/2026-05-03-requirements-audit-report.md) | May 2026 requirements audit snapshot |

## Container images

The API and SPA publish to GHCR (`ghcr.io/ardakilic/brewform-api`, `ghcr.io/ardakilic/brewform-web`)
from the `publish` job of `.github/workflows/ci.yml`. It runs only for pushes to `main` and `v*`
tags, only after every other CI job passed, and pushes the exact images the `images` job
smoke-tested (`latest` on `main`, the commit SHA, and the version tag on tag pushes).

The **web image's API URL is runtime-configurable**: set `VITE_API_URL` as a container
environment variable to point a prebuilt image at any API origin **without rebuilding** — the
entrypoint writes it into `/config.js` at startup, overriding the build-time default baked by
Vite (resolution order: runtime `/config.js` → build-time `VITE_API_URL` → `/api/v1`). The web
image can also serve the API same-origin (`API_UPSTREAM`) and rewrite its public origin at
runtime (`PUBLIC_APP_URL`). See [docs/deployment_compose.md](docs/deployment_compose.md) and
[docs/deployment_coolify.md](docs/deployment_coolify.md).

## License

See [LICENSE](LICENSE) for details.
