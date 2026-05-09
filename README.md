# ☕ BrewForm

A web application for digitalizing, sharing, and discovering coffee brewing recipes and tasting
notes.

## Features

- **Recipe Management** — Create, version, and fork coffee brewing recipes with full parameter
  tracking
- **SCAA Taste Notes** — Structured tasting notes from the SCAA 2016 Flavor Wheel with autocomplete
- **Brew Method Compatibility** — Data-driven validation ensures brew methods and equipment are
  compatible
- **Social Features** — Follow brewers, like/favourite recipes, comment with OP-only replies
- **Achievement Badges** — Gamification system with data-driven badge rules
- **QR Codes** — Generate shareable QR codes for public recipes (PNG and SVG)
- **Three Themes** — Light, Dark, and Coffee mode
- **Canonical Units** — All data stored in metric; UI converts to user preferences
- **Version Control** — Each recipe edit creates an immutable snapshot; full history browsable
- **Onboarding Wizard** — Guided 5-step setup for new users
- **Admin Dashboard** — User management, content moderation, analytics, audit logging

## Tech Stack

| Layer      | Technology                                  |
| ---------- | ------------------------------------------- |
| Runtime    | Deno 2.7                                    |
| Monorepo   | Turborepo (npm workspaces)                  |
| Backend    | Hono                                        |
| Frontend   | React 19 + Vite + Tailwind CSS v4 + Base UI |
| ORM        | Drizzle ORM (postgres-js driver)            |
| Database   | PostgreSQL                                  |
| Cache      | Deno KV                                     |
| Storage    | Local filesystem or S3-compatible (Garage)  |
| Email      | MJML (pre-compiled at build time)           |
| Validation | Zod (shared between frontend and backend)   |
| Testing    | Deno test runner + BDD (`@std/testing/bdd`) |
| CI/CD      | GitHub Actions → Deno Deploy + GitHub Pages |

## Quick Start

All commands run through Docker. No local Deno/Node installation required.

```bash
# Clone the repository
git clone https://github.com/your-org/brewform.git
cd brewform

# Copy environment config (required by Docker Compose services such as Garage)
cp .env.example .env

# Start infrastructure services (postgres, mailpit, pgadmin, garage)
make up

# Install dependencies
make install

# Build email templates (required before running the API)
make email-build

# Generate Drizzle migration
make db-generate

# Run database migrations
make db-migrate

# Seed the database
make db-seed

# Start full-stack development server (API on :8000 + Web on :5173 with hot reload)
make dev
```

Admin credentials after seeding: `admin@brewform.local` / `admin123456`

## Development

```bash
make dev           # Start full-stack dev server (API :8000 + web :5173 with HMR)
make dev-api       # Start API only with hot reload (:8000)
make web-dev       # Start web dev server only (:5173)
make preview       # Build web and preview production build (API :8000 + web :8080)
make lint          # Lint the codebase
make fmt           # Format the codebase
make fmt-check     # Check formatting
make check         # Type check all workspaces
make test          # Run all tests
make test-coverage # Run tests with coverage
make test-api      # Run API tests only
make test-shared   # Run shared package tests only
make ci            # Full CI check (fmt-check, lint, check, test-coverage)
```

> **Why `make up` does not start the app?**  
> `make up` only starts infrastructure (database, mail, storage, etc.). This prevents the port-conflict error that would occur if the API container were already running when you later run `make dev`. Development servers are started on-demand via `make dev`, `make dev-api`, or `make web-dev`.

## Database

```bash
make db-generate   # Generate Drizzle migration SQL
make db-migrate    # Apply pending migrations
make db-seed       # Seed sample data
make db-studio     # Open Drizzle Studio (GUI)
make db-reset      # Reset database (destroys all data)
```

## Architecture

```
apps/web ──────→ packages/shared
                       ↑
apps/api ──┬──→ packages/shared
           └──→ packages/db ──→ packages/shared
```

- **`apps/api/`** — Hono backend API (Deno Deploy)
- **`apps/web/`** — React SPA frontend (GitHub Pages)
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
│   │       ├── middleware/     # CORS, requestId, errorHandler, auth, rateLimit
│   │       ├── modules/        # Domain modules (auth, recipe, user, ...)
│   │       ├── routes/         # Health, OpenAPI, route aggregator
│   │       ├── utils/          # logger, cache, response, qrcode, upload, jobs
│   │       ├── types/          # Hono env, MJML type declarations
│   │       └── templates/      # MJML email templates
│   └── web/                    # React SPA frontend
│       └── src/
│           ├── pages/          # Route page components
│           ├── components/     # Reusable UI components
│           ├── contexts/       # Auth, Theme, I18n providers
│           ├── api/            # API client + typed endpoint functions
│           └── styles/         # Global CSS, theme system
├── packages/
│   ├── shared/                 # Types, schemas, constants, utils, i18n
│   └── db/                    # Drizzle schema, migrations, seed
├── files/
│   └── scaa-2.json            # SCAA 2016 flavor wheel data
├── docs/                      # Feature & API documentation
├── .github/workflows/         # CI/CD pipelines
├── compose.yml
├── Dockerfile
├── Makefile
├── turbo.json
└── deno.json
```

## API

The API is versioned at `/api/v1/`. See [docs/api.md](docs/api.md) for the full endpoint reference
(100+ endpoints).

## Documentation

| Document                                               | Description                                                 |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| [docs/api.md](docs/api.md)                             | Complete API endpoint reference                             |
| [docs/auth.md](docs/auth.md)                           | Authentication flows and token strategy                     |
| [docs/recipes.md](docs/recipes.md)                     | Recipe versioning, forking, validation                      |
| [docs/taste-notes.md](docs/taste-notes.md)             | SCAA Flavor Wheel integration and autocomplete              |
| [docs/notifications.md](docs/notifications.md)         | Email categories, triggers, and delivery model              |
| [docs/deployment.md](docs/deployment.md)               | Production deployment guide                                 |
| [docs/architecture.md](docs/architecture.md)           | Monorepo structure, module pattern, conventions             |
| [docs/request-lifecycle.md](docs/request-lifecycle.md) | End-to-end trace of an HTTP request through the API         |
| [docs/decisions.md](docs/decisions.md)                 | Architectural decision records (the _why_ behind the stack) |

## License

See [LICENSE](LICENSE) for details.
