# ============================================================
# BrewForm — Makefile
# All commands run through Docker. No local Deno installation required.
#
# Development workflow:
#   make up        → start infrastructure (postgres, mailpit, pgadmin, garage)
#   make install   → cache Deno dependencies
#   make dev       → start API (:8000) + Vite dev server (:5173) with hot reload
#
# The `app` and `web-dev` services use Docker Compose profiles so they are
# never started accidentally by `make up` (which would bind port 8000 and
# cause a conflict when you later run `make dev`).
# ============================================================

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

# --- App Lifecycle ---

# Start infrastructure services only (postgres, mailpit, pgadmin, garage).
# Does NOT start the API or web dev server — run `make dev` for that.
up: ## Start infrastructure services (postgres, mailpit, pgadmin, garage)
	docker compose up -d postgres mailpit pgadmin garage

down: ## Stop all services
	docker compose --profile dev --profile preview --profile serena down

build: ## Build all Docker images
	docker compose build

logs: ## Follow logs of all services
	docker compose logs -f

restart: ## Restart the app service
	docker compose --profile dev restart app

# --- Developer Setup ---

setup-hooks: ## Configure git to use .githooks/ for pre-commit checks
	git config core.hooksPath .githooks
	@echo "Git hooks configured. Pre-commit runs 'deno fmt --check' and 'deno lint'."

# --- Dependencies ---

# Cache Deno dependencies inside the container (uses deno_cache volume).
install: ## Cache Deno dependencies
	docker compose run --rm --no-deps app deno install --frozen

# Regenerate deno.lock inside Docker (use after adding/updating dependencies).
lockfile-update: ## Regenerate deno.lock inside Docker
	docker compose run --rm --no-deps app deno install

# --- Email Templates ---

email-build: ## Build email templates
	docker compose run --rm --no-deps app deno task email-build

# --- Code Quality ---

lint: ## Lint all apps and packages
	docker compose run --rm --no-deps app deno lint apps/ packages/

fmt: ## Format all code
	docker compose run --rm --no-deps app deno fmt

fmt-check: ## Check formatting without changes
	docker compose run --rm --no-deps app deno fmt --check

check: ## Type-check all workspaces (api, web, db, shared)
	docker compose run --rm --no-deps app deno task check

check-api: ## Type-check API only
	docker compose run --rm --no-deps app deno task check:api

check-web: ## Lint web frontend
	docker compose run --rm --no-deps app deno task check:web

check-db: ## Type-check database package
	docker compose run --rm --no-deps app deno task check:db

check-shared: ## Type-check shared package
	docker compose run --rm --no-deps app deno task check:shared

# --- Build ---

build-api: ## Build API (email templates)
	docker compose run --rm --no-deps app deno task build:api

build-web: ## Build React SPA (outputs to apps/web/dist/)
	docker compose run --rm --no-deps app deno task build:web

build-shared: ## Type-check shared package as build artifact
	docker compose run --rm --no-deps app deno task build:shared

# --- Testing ---

check-tests: ## Type-check test files
	docker compose run --rm --no-deps app deno check apps/api/src/ packages/shared/src/

test: ## Run all tests (API + shared + web)
	docker compose run --rm app deno test --no-check --allow-env --allow-read --allow-write --allow-net --allow-sys --allow-ffi apps/api/src/ packages/shared/src/ && \
	docker compose run --rm --no-deps app deno task --cwd apps/web test

test-coverage: ## Run all tests with coverage
	docker compose run --rm app deno test --no-check --allow-env --allow-read --allow-write --allow-net --allow-sys --allow-ffi --coverage=coverage/ apps/api/src/ packages/shared/src/

test-api: ## Run API tests only
	docker compose run --rm app deno test --no-check --allow-env --allow-read --allow-write --allow-net --allow-sys --allow-ffi apps/api/src/

test-shared: ## Run shared package tests only
	docker compose run --rm --no-deps app deno test --allow-env --allow-read --allow-write --allow-net packages/shared/src/

test-web: ## Run web (Vitest) tests
	docker compose run --rm --no-deps app deno task --cwd apps/web test

test-specific: ## Run specific test (use filter=)
	docker compose run --rm app deno test --no-check --allow-env --allow-read --allow-write --allow-net --allow-sys --allow-ffi $(filter)

# --- Database ---

DRIZZLE_KIT := npm:drizzle-kit@0.31

db-migrate: ## Run database migrations
	docker compose run --rm app sh -c "cd packages/db && deno run -A $(DRIZZLE_KIT) migrate"

db-generate: ## Generate database migrations
	docker compose run --rm app sh -c "cd packages/db && deno run -A $(DRIZZLE_KIT) generate"

db-push: ## Push schema changes
	docker compose run --rm app sh -c "cd packages/db && deno run -A $(DRIZZLE_KIT) push"

db-seed: ## Seed the database
	docker compose run --rm app deno run --allow-all packages/db/src/seed.ts

db-studio: ## Open Drizzle Studio
	docker compose run --rm -p 5555:5555 app sh -c "cd packages/db && deno run -A $(DRIZZLE_KIT) studio --host=0.0.0.0 --port=5555"

flush-db: ## Truncate all database tables
	docker compose run --rm app deno run --allow-env --allow-net apps/api/scripts/flush-db.ts

flush-cache: ## Clear Deno KV cache
	docker compose run --rm app deno run --allow-env --allow-read --allow-write apps/api/scripts/flush-cache.ts

flush-contents: flush-db flush-cache ## Truncate all database tables and clear Deno KV cache

db-reset: ## Full reset: recreate DB, push schema, seed, flush cache
	docker compose up -d postgres
	@until docker compose exec postgres pg_isready -U brewform > /dev/null 2>&1; do sleep 1; done
	-docker compose exec -T postgres psql -U brewform -d postgres -c "DROP DATABASE IF EXISTS brewform WITH (FORCE);"
	-docker compose exec -T postgres psql -U brewform -d postgres -c "CREATE DATABASE brewform;"
	$(MAKE) db-push
	$(MAKE) db-seed
	$(MAKE) flush-cache

# --- Admin Setup ---

setup: ## Run admin setup
	docker compose run --rm app deno run --allow-all apps/api/src/setup.ts

# --- Development ---

# Start full-stack dev environment:
#   • API with hot reload on http://localhost:8000
#   • Vite dev server with HMR on http://localhost:5173
#   • Vite proxies /api requests to the API container automatically
#
# Both services run as long-running containers (not one-shot `run`).
# Use `make down` or Ctrl-C + `docker compose --profile dev down` to stop.
dev: up ## Start full-stack dev environment (API :8000 + web :5173 with HMR)
	docker compose --profile dev up app web-dev

# Start API dev server only (hot reload on :8000).
dev-api: up ## Start API dev server only
	docker compose --profile dev up app

# Start Vite web dev server only (:5173).
# Assumes the API is already running (make dev-api or make dev).
web-dev: ## Start Vite web dev server only
	docker compose --profile dev up web-dev

# --- Frontend ---

# Build the React SPA (outputs to apps/web/dist/).
# Legacy alias — prefer `make build-web` for consistency with build-api / build-shared.
web-build: build-web ## Build the React SPA

# Preview production build — builds the web app and serves it via Caddy on :8080
# alongside the production-like API on :8000.
preview: build-web up ## Build + preview production build
	docker compose --profile preview up app-preview web

# --- CI ---

ci: fmt-check lint check build-web check-tests test-coverage test-web ## Run full CI pipeline (fmt, lint, check, build, test)

# ── Icons ──────────────────────────────────────────────────────────────

generate-icons: ## Generate PNG icons from favicon.svg
	docker compose run --rm --no-deps app \
	  deno run --allow-read --allow-write --allow-ffi scripts/generate-icons.ts

# ── Serena MCP ──────────────────────────────────────────────────────────

serena-up: ## Start Serena MCP service
	docker compose --profile serena up serena -d

serena-down: ## Down Serena MCP service (removes container)
	docker compose --profile serena down serena

serena-logs: ## Follow Serena logs
	docker compose logs -f serena

serena-index: ## Index project with Serena
	docker compose --profile serena exec serena serena project index /workspace/brewform

serena-health: ## Check Serena health
	@curl -sf --max-time 5 --connect-timeout 2 http://localhost:10122/sse > /dev/null 2>&1 && echo "✓ Serena is healthy" || echo "✗ Serena is not responding"

.PHONY: help up down build logs restart setup-hooks install lockfile-update email-build lint fmt fmt-check check check-tests test test-coverage test-api test-shared test-web test-specific db-migrate db-generate db-push db-seed db-studio flush-db flush-cache flush-contents db-reset setup dev dev-api web-dev web-build preview ci generate-icons serena-up serena-down serena-logs serena-index serena-health
