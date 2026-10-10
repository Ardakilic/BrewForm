# ============================================================
# BrewForm — Makefile
# All commands run through Docker. No local Node.js/pnpm installation required.
#
# Development workflow:
#   make up        → start infrastructure (postgres, mailpit, pgadmin, garage)
#   make install   → install pnpm workspace dependencies
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
	docker compose --profile dev --profile preview down

build: ## Build all Docker images
	docker compose build

logs: ## Follow logs of all services
	docker compose logs -f

restart: ## Restart the app service
	docker compose --profile dev restart app

# --- Developer Setup ---

setup-hooks: ## Configure git to use .githooks/ for pre-commit checks
	git config core.hooksPath .githooks
	@echo "Git hooks configured. Pre-commit runs 'biome check' (fmt) and per-workspace lint."

# --- Dependencies ---

# Install pnpm workspace dependencies inside the container.
install: ## Install pnpm workspace dependencies
	docker compose run --rm --no-deps app pnpm install --frozen-lockfile

# Regenerate pnpm-lock.yaml inside Docker (use after adding/updating dependencies).
lockfile-update: ## Regenerate pnpm-lock.yaml inside Docker
	docker compose run --rm --no-deps app pnpm install

# --- Email Templates ---

email-build: ## Build email templates
	docker compose run --rm --no-deps app pnpm run email-build

# --- Code Quality ---

lint: ## Lint all apps and packages
	docker compose run --rm --no-deps app pnpm run lint

fmt: ## Format all code
	docker compose run --rm --no-deps app pnpm run fmt

fmt-check: ## Check formatting without changes
	docker compose run --rm --no-deps app pnpm run fmt-check

check: ## Type-check all workspaces (api, web, db, shared)
	docker compose run --rm --no-deps app pnpm run check

check-api: ## Type-check API only
	docker compose run --rm --no-deps app pnpm run check:api

check-web: ## Lint web frontend
	docker compose run --rm --no-deps app pnpm run check:web

check-db: ## Type-check database package
	docker compose run --rm --no-deps app pnpm run check:db

check-shared: ## Type-check shared package
	docker compose run --rm --no-deps app pnpm run check:shared

# --- Build ---

build-api: ## Build API (email templates)
	docker compose run --rm --no-deps app pnpm run build:api

build-web: ## Build React SPA (outputs to apps/web/dist/)
	docker compose run --rm --no-deps app pnpm run build:web

build-shared: ## Type-check shared package as build artifact
	docker compose run --rm --no-deps app pnpm run build:shared

# --- Testing ---

# Dedicated test database (mirrors .github/workflows/pr.yml:63-113 — CI uses
# postgresql://brewform:brewform@localhost:5432/brewform_test; inside the compose
# network the host is `postgres`, not `localhost`). API tests MUST NOT run against
# the dev `brewform` database — they mutate seeded rows (see wave-5 task 8.2).
TEST_DATABASE_URL := postgresql://brewform:brewform@postgres:5432/brewform_test

check-tests: ## Type-check test files
	docker compose run --rm --no-deps app pnpm --filter @brewform/api run check && \
	docker compose run --rm --no-deps app pnpm --filter @brewform/shared run check

# Create + migrate + seed the brewform_test database (safe to re-run; the seed is
# idempotent via on-conflict handling — but note it cannot remove stray rows left
# by API tests; drop and recreate the DB for a fully clean slate, see wave-5 task 8.2).
# Mirrors the CI provisioning steps in .github/workflows/pr.yml:63-113.
test-db-provision: up ## Provision the brewform_test database (create + migrate + seed)
	@docker compose exec -T postgres psql -U brewform -d postgres -tc \
	  "SELECT 1 FROM pg_database WHERE datname='brewform_test'" | grep -q 1 || \
	docker compose exec -T postgres psql -U brewform -d postgres -c "CREATE DATABASE brewform_test;"
	docker compose run --rm --no-deps -e DATABASE_URL=$(TEST_DATABASE_URL) app \
	  pnpm --filter @brewform/db run migrate
	docker compose run --rm --no-deps -e DATABASE_URL=$(TEST_DATABASE_URL) app \
	  pnpm --filter @brewform/db run seed

test: up ## Run all tests (API + shared + db + web)
	docker compose run --rm -e DATABASE_URL=$(TEST_DATABASE_URL) app pnpm run test

test-coverage: up ## Run all tests with coverage
	docker compose run --rm -e DATABASE_URL=$(TEST_DATABASE_URL) app pnpm run test-coverage

test-api: up ## Run API tests only
	docker compose run --rm -e DATABASE_URL=$(TEST_DATABASE_URL) app pnpm run test:api

test-shared: ## Run shared package tests only
	docker compose run --rm --no-deps app pnpm run test:shared

test-web: ## Run web (Vitest) tests
	docker compose run --rm --no-deps app pnpm --filter @brewform/web run test

# Run a specific test file in every backend workspace (use filter=, matched as a
# substring — e.g. filter=schema-indexes.test.ts or filter=apps/api/src/modules/auth).
# Workspaces without a match exit 0 via --passWithNoTests so one filter covers all.
test-specific: up ## Run specific test (use filter=)
	docker compose run --rm -e DATABASE_URL=$(TEST_DATABASE_URL) app sh -c \
	  "pnpm --filter @brewform/api exec vitest run --passWithNoTests $(filter) && \
	   pnpm --filter @brewform/db exec vitest run --passWithNoTests $(filter) && \
	   pnpm --filter @brewform/shared exec vitest run --passWithNoTests $(filter)"

# --- Database ---

db-migrate: up ## Run database migrations
	docker compose run --rm app pnpm --filter @brewform/db run migrate

db-generate: up ## Generate database migrations
	docker compose run --rm app pnpm --filter @brewform/db run generate

db-push: up ## Push schema changes
	docker compose run --rm app pnpm --filter @brewform/db run push

db-seed: up ## Seed the database
	docker compose run --rm app pnpm --filter @brewform/db run seed

db-studio: up ## Open Drizzle Studio
	docker compose run --rm -p 5555:5555 app pnpm --filter @brewform/db run studio

flush-db: up ## Truncate all database tables
	docker compose run --rm app pnpm --filter @brewform/api exec tsx scripts/flush-db.ts

flush-cache: up ## Clear the API cache
	docker compose run --rm app pnpm --filter @brewform/api exec tsx scripts/flush-cache.ts

flush-contents: flush-db flush-cache ## Truncate all database tables and clear the API cache

db-reset: ## Full reset: recreate DB, push schema, seed, flush cache
	docker compose up -d postgres
	@until docker compose exec postgres pg_isready -U brewform > /dev/null 2>&1; do sleep 1; done
	-docker compose exec -T postgres psql -U brewform -d postgres -c "DROP DATABASE IF EXISTS brewform WITH (FORCE);"
	-docker compose exec -T postgres psql -U brewform -d postgres -c "CREATE DATABASE brewform;"
	$(MAKE) db-push
	$(MAKE) db-seed
	$(MAKE) flush-cache

# --- Admin Setup ---

setup: up ## Run admin setup
	docker compose run --rm app pnpm --filter @brewform/api exec tsx src/setup.ts

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
	  pnpm --filter @brewform/api exec tsx /app/scripts/generate-icons.ts

# --- Production Images & Deploy ---

images: ## Build both Docker images locally (API + Web)
	docker build -t ghcr.io/ardakilic/brewform-api:latest -f Dockerfile .
	docker build -t ghcr.io/ardakilic/brewform-web:latest -f Dockerfile.web \
	  --build-arg VITE_API_URL=$${VITE_API_URL:-/api/v1} \
	  --build-arg VITE_PUBLIC_APP_URL=$${VITE_PUBLIC_APP_URL:-http://localhost:8080} \
	  .

images-push: ## Push both images to GHCR (requires: docker login ghcr.io)
	docker push ghcr.io/ardakilic/brewform-api:latest
	docker push ghcr.io/ardakilic/brewform-web:latest

prod-up: ## Start production profile (pulls published images from GHCR)
	docker compose --profile prod up -d

prod-up-build: ## Start production profile (builds images locally)
	docker compose --profile prod up -d --build

prod-down: ## Stop production profile
	docker compose --profile prod down

release: images images-push ## Build and push both images (local CI equivalent)

.PHONY: help up down build logs restart setup-hooks install lockfile-update email-build lint fmt fmt-check check check-tests test-db-provision test test-coverage test-api test-shared test-web test-specific db-migrate db-generate db-push db-seed db-studio flush-db flush-cache flush-contents db-reset setup dev dev-api web-dev web-build preview ci generate-icons images images-push prod-up prod-up-build prod-down release
