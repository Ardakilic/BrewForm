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

# --- Dependencies ---

# Cache Deno dependencies inside the container (uses deno_cache volume).
install: ## Cache Deno dependencies
	docker compose run --rm --no-deps app deno install --frozen

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

check: install ## Type-check the API entrypoint
	docker compose run --rm --no-deps app deno check apps/api/src/main.ts

# --- Testing ---

check-tests: ## Type-check test files
	docker compose run --rm --no-deps app deno check apps/api/src/ packages/shared/src/

test: ## Run all tests
	docker compose run --rm app deno test --no-check --allow-env --allow-read --allow-write --allow-net --allow-sys --allow-ffi apps/api/src/ packages/shared/src/

test-coverage: ## Run all tests with coverage
	docker compose run --rm app deno test --no-check --allow-env --allow-read --allow-write --allow-net --allow-sys --allow-ffi --coverage=coverage/ apps/api/src/ packages/shared/src/

test-api: ## Run API tests only
	docker compose run --rm app deno test --no-check --allow-env --allow-read --allow-write --allow-net --allow-sys --allow-ffi apps/api/src/

test-shared: ## Run shared package tests only
	docker compose run --rm --no-deps app deno test --allow-env --allow-read --allow-write --allow-net packages/shared/src/

test-specific: ## Run specific test (use filter=)
	docker compose run --rm app deno test --no-check --allow-env --allow-read --allow-write --allow-net --allow-sys --allow-ffi $(filter)

# --- Database ---

DRIZZLE_KIT := npm:drizzle-kit@0.31.10

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

db-reset: ## Instructions to reset database
	docker compose run --rm app bash -c "echo 'Drop and recreate database manually, then run db-migrate and db-seed'"

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
dev: up ## Start full-stack dev environment
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
web-build: ## Build the React SPA
	docker compose run --rm --no-deps app sh -c "cd apps/web && deno run -A npm:vite build"

# Preview production build — builds the web app and serves it via Caddy on :8080
# alongside the production-like API on :8000.
preview: web-build up ## Build + preview production build
	docker compose --profile preview up app-preview web

# --- CI ---

ci: fmt-check lint check check-tests test-coverage ## Run full CI pipeline

# ── Serena MCP ──────────────────────────────────────────────────────────

serena-up: ## Start Serena MCP service
	docker compose --profile serena up serena -d

serena-stop: ## Stop Serena MCP service
	docker compose --profile serena down serena

serena-logs: ## Follow Serena logs
	docker compose logs -f serena

serena-index: ## Index project with Serena
	docker compose --profile serena exec serena serena project index /workspace/brewform

serena-health: ## Check Serena health
	@curl -sf --max-time 5 --connect-timeout 2 http://localhost:10122/sse > /dev/null 2>&1 && echo "✓ Serena is healthy" || echo "✗ Serena is not responding"

.PHONY: help up down build logs restart install email-build lint fmt fmt-check check check-tests test test-coverage test-api test-shared test-specific db-migrate db-generate db-push db-seed db-studio db-reset setup dev dev-api web-dev web-build preview ci serena-up serena-stop serena-logs serena-index serena-health
