# ☕ BrewForm

A web application for digitalizing, sharing, and discovering coffee brewing recipes and tasting
notes.

## Features

- **Recipe Management** — Create, version, and fork coffee brewing recipes with full parameter
  tracking
- **Coffee Varieties** — Browse 98 coffee varieties (botanical, processing methods, specialty lots) with search, filtering, and recipe linkage
- **Equipment Catalog** — 378 coffee machines, grinders, brewers, kettles, and tools across 17 equipment types with branded search and recipe integration
- **SCAA Taste Notes** — Structured tasting notes from the SCAA 2016 Flavor Wheel with autocomplete
- **Brew Method Compatibility** — Data-driven validation ensures brew methods and equipment are
  compatible
- **Social Features** — Follow brewers, like/favourite recipes, comment with OP-only replies; admins can reply to and delete any comment
- **🌐 Language Switcher** — Switch between English and Turkish from the footer dropdown
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
| Monorepo   | Deno workspaces                             |
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

All commands run through Docker. No local Deno installation required.

```bash
# Clone the repository
git clone https://github.com/your-org/brewform.git
cd brewform

# Copy environment config (required by Docker Compose services such as Garage)
cp .env.example .env

# Start infrastructure services (postgres, mailpit, pgadmin, garage)
make up

# Cache Deno dependencies
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

Admin credentials after seeding: `admin@brewform.local` / `admin123456`

Open **http://localhost:5173** for the web app and **http://localhost:8000** for the API.

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
make check-web      # Lint web frontend
make check-db       # Type-check database package
make check-shared   # Type-check shared package
make lint           # Lint all apps and packages
make fmt            # Format the codebase
make fmt-check      # Check formatting without changes

# Dependencies
make install          # Cache Deno dependencies (frozen lockfile)
make lockfile-update  # Regenerate deno.lock inside Docker (after dep changes)

# Testing
make test           # Run all tests
make test-coverage  # Run tests with coverage
make test-api       # Run API tests only
make test-shared    # Run shared package tests only
make check-tests    # Type-check test files

# CI
make ci             # Full CI pipeline (fmt, lint, check, build, test)
```

## Serena MCP

BrewForm includes [Serena](https://github.com/oraios/serena) — a semantic code retrieval MCP server that gives AI coding tools (Claude Code, OpenCode, VS Code/Cursor) deep understanding of the codebase through symbol indexing and type-aware search. Serena indexes all 4 Deno workspace members for cross-package symbol resolution.

### Quick Start

```bash
make serena-up     # Start Serena MCP service
make serena-health  # Verify it's healthy
```

Access the Serena dashboard at http://localhost:24282.

### Available Commands

| Command | Description |
|---------|-------------|
| `make serena-up` | Start Serena MCP service |
| `make serena-down` | Down Serena MCP service (removes container) |
| `make serena-logs` | View Serena logs |
| `make serena-index` | Re-index the project workspace |
| `make serena-health` | Health check |

### Ports

| Service | Port |
|---------|------|
| SSE (MCP endpoint) | 10122 |
| Dashboard | 24282 |

### Connecting AI Clients

**Claude Code:**
```bash
claude mcp add serena --transport sse --url http://localhost:10122/sse
```

**VS Code / Cursor / Windsurf** — `.mcp.json` is pre-configured in the project root.

**OpenCode** — configure `opencode.jsonc` with the SSE endpoint.

See [docs/serena-mcp.md](docs/serena-mcp.md) for detailed setup, architecture, and troubleshooting.

> **Why `make up` does not start the app?**
> `make up` only starts infrastructure (database, mail, storage, etc.). The API and web dev server
> are started on-demand via `make dev`. This prevents a "port already allocated" error that would
> occur if the API container were already running when you run `make dev`.

> **Docker Volume Strategy**
> Dev containers use a named `node_modules` volume layered over the bind mount. This ensures
> platform-specific native bindings (e.g. `rolldown`) use the Linux binaries inside the container
> rather than the host's macOS binaries. See [`docs/docker.md`](docs/docker.md) for details and
> troubleshooting.

> **Why `deno task` instead of a task runner?**
> Deno's built-in task runner with `--cwd` (run in a specific directory) and explicit per-workspace
> sub-tasks covers all orchestration needs. Granular tasks like `check:api`, `build:web`, and
> `dev:api` compose into aggregate `check`, `build`, and `dev` tasks. No external task runner
> required — the `deno.json` `tasks` field is the single source of truth for all build, test, lint,
> and dev workflows.

## Database

```bash
make db-push         # Push schema changes (always use for enum changes)
make db-generate     # Generate Drizzle migration SQL
make db-migrate      # Apply pending migrations
make db-seed         # Seed sample data (378 equipment + 98 varieties + 6 recipes)
make db-studio       # Open Drizzle Studio (GUI)
make flush-db        # Truncate all database tables
make flush-cache     # Clear Deno KV cache
make flush-contents  # Truncate all tables + clear Deno KV cache
make db-reset        # Full reset: recreate DB, push schema, re-seed, flush cache
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
│   ├── scaa-2.json              # SCAA 2016 flavor wheel data
│   ├── coffee_types_v2.json     # Coffee varieties reference data (98 entries)
│   └── coffee_equipments_v2.json # Equipment catalog reference data (378 items)
├── docs/                      # Feature & API documentation
├── .github/workflows/         # CI/CD pipelines
├── compose.yml
├── Dockerfile
├── Makefile
└── deno.json
```

## Services

| Service         | URL                       | Purpose                          |
| --------------- | ------------------------- | -------------------------------- |
| API             | http://localhost:8000     | Hono backend (dev + preview)     |
| Web (Vite HMR)  | http://localhost:5173     | React dev server with hot reload |
| Web (Caddy)     | http://localhost:8080     | Built SPA preview                |
| PostgreSQL      | localhost:5432            | Database                         |
| Mailpit SMTP    | localhost:1025            | SMTP server for email testing    |
| Mailpit UI      | http://localhost:8025     | Email web UI                     |
| pgAdmin         | http://localhost:5050     | Database GUI                     |
| Garage S3 API   | http://localhost:3900     | S3-compatible object storage     |
| Garage Web      | http://localhost:3902     | Garage web gateway               |
| Serena SSE      | http://localhost:10122    | Semantic code retrieval for AI   |
| Serena Dashboard| http://localhost:24282    | Serena web UI for inspection     |

## API

The API is versioned at `/api/v1/`. See [docs/api.md](docs/api.md) for the full endpoint reference
(100+ endpoints).

## Documentation

| Document                                               | Description                                                 |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| [docs/api.md](docs/api.md)                             | Complete API endpoint reference                             |
| [docs/auth.md](docs/auth.md)                           | Authentication flows and token strategy                     |
| [docs/recipes.md](docs/recipes.md)                     | Recipe versioning, forking, validation                      |
| [docs/coffee-data.md](docs/coffee-data.md)             | Coffee varieties (98 entries) and equipment catalog         |
| [docs/coffee-equipments.md](docs/coffee-equipments.md) | Equipment catalog reference (378 items, 17 types)           |
| [docs/taste-notes.md](docs/taste-notes.md)             | SCAA Flavor Wheel integration and autocomplete              |
| [docs/notifications.md](docs/notifications.md)         | Email categories, triggers, and delivery model              |
| [docs/deployment.md](docs/deployment.md)               | Production deployment guide                                 |
| [docs/architecture.md](docs/architecture.md)           | Monorepo structure, module pattern, conventions             |
| [docs/request-lifecycle.md](docs/request-lifecycle.md) | End-to-end trace of an HTTP request through the API         |
| [docs/decisions.md](docs/decisions.md)                 | Architectural decision records (the _why_ behind the stack) |
| [docs/docker.md](docs/docker.md)                       | Docker development environment, volume strategy, troubleshooting |
| [docs/serena-mcp.md](docs/serena-mcp.md)               | Serena MCP setup, architecture, and troubleshooting        |

## License

See [LICENSE](LICENSE) for details.
