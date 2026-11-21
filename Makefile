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

docs-check: ## Check docs/specs for drift (doc-drift-check.ts) and exports for docblocks (docblock-scan.ts)
	docker compose run --rm --no-deps app pnpm run docs:check
.PHONY: docs-check

check: ## Type-check all workspaces (api, web, db, shared)
	docker compose run --rm --no-deps app pnpm run check

check-api: ## Type-check API only
	docker compose run --rm --no-deps app pnpm run check:api

check-web: ## Type-check web frontend (tsc)
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

# Dedicated test database (mirrors the `test` job of .github/workflows/ci.yml — CI uses
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
# Mirrors the CI provisioning steps in the `test` job of .github/workflows/ci.yml.
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

db-check-identifiers: up ## Report data that breaks the wave-6 identifier indexes (args=--fix-deleted-duplicates|--fix-setup-defaults|--fix-empty-slugs)
	docker compose run --rm app pnpm --filter @brewform/db run check-identifiers -- $(args)

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
	# drizzle-kit push does not manage extensions; the trigram indexes need pg_trgm (ADR-017).
	docker compose exec -T postgres psql -U brewform -d brewform -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
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

ci: fmt-check lint check build-web check-tests test-coverage test-web docs-check ## Run full CI pipeline (fmt, lint, check, build, test, docs)

# ── Icons ──────────────────────────────────────────────────────────────

generate-icons: ## Generate PNG icons from favicon.svg
	docker compose run --rm --no-deps app \
	  pnpm --filter @brewform/api exec tsx /app/scripts/generate-icons.ts

# --- Production Images & Deploy ---
# `images` builds local, non-registry tags for tests and `make prod-smoke`. No target here
# pushes to a registry: the published images come only from the `publish` job of
# .github/workflows/ci.yml, after every CI job passed. The prod-* targets wrap the single
# production definition, compose.production.yml, always with --env-file .env.production
# (Compose would otherwise auto-load the development .env); every target that reads it
# first runs prod-env-check. Guide: docs/deployment_compose.md.

PROD_ENV_FILE := .env.production
PROD_COMPOSE := docker compose --env-file $(PROD_ENV_FILE) -f compose.production.yml
# Destination folder of `make prod-backup-export`.
DEST ?= ./backup-export

images: ## Build both Docker images locally as brewform-api:local and brewform-web:local
	docker build -t brewform-api:local -f Dockerfile .
	docker build -t brewform-web:local -f Dockerfile.web \
	  --build-arg VITE_API_URL=$${VITE_API_URL:-/api/v1} \
	  --build-arg VITE_PUBLIC_APP_URL=$${VITE_PUBLIC_APP_URL:-http://localhost:8080} \
	  .

prod-env-check: ## Fail unless .env.production exists (prerequisite of the prod-* targets)
	@if [ ! -f "$(PROD_ENV_FILE)" ]; then \
	  echo "error: $(PROD_ENV_FILE) not found; no docker compose command was run." >&2; \
	  echo "Create it from the template and fill in the required values:" >&2; \
	  echo "  cp .env.production.example $(PROD_ENV_FILE)" >&2; \
	  echo "See docs/deployment_compose.md (First install)." >&2; \
	  exit 1; \
	fi

prod-up: prod-env-check ## Start or update the production stack (compose.production.yml)
	$(PROD_COMPOSE) up -d

prod-down: prod-env-check ## Stop the production stack (named volumes are kept)
	$(PROD_COMPOSE) down

prod-logs: prod-env-check ## Follow the production stack logs
	$(PROD_COMPOSE) logs -f

prod-ps: prod-env-check ## Show the production containers and their health
	$(PROD_COMPOSE) ps

prod-pull: prod-env-check ## Pull the production images for IMAGE_TAG (default latest)
	$(PROD_COMPOSE) pull

prod-backup: prod-env-check ## Run one database (and uploads) backup now
	$(PROD_COMPOSE) run --rm -e BACKUP_ONESHOT=1 backup

prod-backup-export: prod-env-check ## Copy every backup to a host folder (DEST=./backup-export)
	mkdir -p $(DEST) && $(PROD_COMPOSE) cp backup:/backups/. $(DEST)

# Stops api and web, restores with the profile-gated `restore` service, starts the stack.
# DUMP and UPLOADS are file names in the backups target (either may be omitted).
prod-restore: prod-env-check ## Restore backups (DUMP=db-<ts>.dump UPLOADS=uploads-<ts>.tar.gz)
	@if [ -z "$(DUMP)$(UPLOADS)" ]; then \
	  echo "usage: make prod-restore DUMP=db-<ts>.dump UPLOADS=uploads-<ts>.tar.gz (either may be omitted)" >&2; \
	  exit 2; \
	fi
	$(PROD_COMPOSE) stop api web
	$(PROD_COMPOSE) --profile restore run --rm -e 'RESTORE_DB_DUMP=$(DUMP)' -e 'RESTORE_UPLOADS_ARCHIVE=$(UPLOADS)' restore || { \
	  echo "restore failed: api and web are still stopped. Fix the error and re-run, or run 'make prod-up'." >&2; \
	  exit 1; \
	}
	$(PROD_COMPOSE) up -d

# Upgrade step: run after `make prod-pull` and before `make prod-up`, while the database
# is running. Pass args=--fix-deleted-duplicates|--fix-setup-defaults|--fix-empty-slugs.
prod-check-identifiers: prod-env-check ## Report production data that breaks the wave-6 identifier indexes (args=...)
	$(PROD_COMPOSE) run --rm --no-deps --entrypoint node api /app/packages/db/src/check-identifiers.ts $(args)

prod-fix-uploads-owner: prod-env-check ## Give the uploads volume or host folder to the API user (1000:1000)
	$(PROD_COMPOSE) run --rm --no-deps --user 0:0 --entrypoint chown api -R 1000:1000 /app/uploads

# Uses scripts/ci/compose-smoke.env (placeholder values), never .env.production.
prod-smoke: images ## Build the images and run the CI compose smoke test against them
	IMAGE_TAG=local API_IMAGE=brewform-api WEB_IMAGE=brewform-web scripts/ci/smoke-compose.sh

.PHONY: help up down build logs restart setup-hooks install lockfile-update email-build lint fmt fmt-check check check-tests test-db-provision test test-coverage test-api test-shared test-web test-specific db-migrate db-generate db-push db-seed db-check-identifiers db-studio flush-db flush-cache flush-contents db-reset setup dev dev-api web-dev web-build preview ci generate-icons images prod-up prod-down prod-env-check prod-logs prod-ps prod-pull prod-backup prod-backup-export prod-restore prod-check-identifiers prod-fix-uploads-owner prod-smoke
