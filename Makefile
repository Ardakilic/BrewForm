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

# --- App Lifecycle ---

# Start infrastructure services only (postgres, mailpit, pgadmin, garage).
# Does NOT start the API or web dev server — run `make dev` for that.
up:
	docker compose up -d postgres mailpit pgadmin garage

down:
	docker compose --profile dev --profile preview down

build:
	docker compose build

logs:
	docker compose logs -f

restart:
	docker compose --profile dev restart app

# --- Dependencies ---

# Cache Deno dependencies inside the container (uses deno_cache volume).
install:
	docker compose run --rm --no-deps app deno install --frozen

# --- Email Templates ---

email-build:
	docker compose run --rm --no-deps app deno task email-build

# --- Code Quality ---

lint:
	docker compose run --rm --no-deps app deno lint apps/ packages/

fmt:
	docker compose run --rm --no-deps app deno fmt

fmt-check:
	docker compose run --rm --no-deps app deno fmt --check

check: install
	docker compose run --rm --no-deps app deno check apps/api/src/main.ts

# --- Testing ---

check-tests:
	docker compose run --rm --no-deps app deno check apps/api/src/ packages/shared/src/

test:
	docker compose run --rm app deno test --no-check --allow-env --allow-read --allow-write --allow-net --allow-sys --allow-ffi apps/api/src/ packages/shared/src/

test-coverage:
	docker compose run --rm app deno test --no-check --allow-env --allow-read --allow-write --allow-net --allow-sys --allow-ffi --coverage=coverage/ apps/api/src/ packages/shared/src/

test-api:
	docker compose run --rm app deno test --no-check --allow-env --allow-read --allow-write --allow-net --allow-sys --allow-ffi apps/api/src/

test-shared:
	docker compose run --rm --no-deps app deno test --allow-env --allow-read --allow-write --allow-net packages/shared/src/

test-specific:
	docker compose run --rm app deno test --no-check --allow-env --allow-read --allow-write --allow-net --allow-sys --allow-ffi $(filter)

# --- Database ---

DRIZZLE_KIT := npm:drizzle-kit@0.31.10

db-migrate:
	docker compose run --rm app sh -c "cd packages/db && deno run -A $(DRIZZLE_KIT) migrate"

db-generate:
	docker compose run --rm app sh -c "cd packages/db && deno run -A $(DRIZZLE_KIT) generate"

db-push:
	docker compose run --rm app sh -c "cd packages/db && deno run -A $(DRIZZLE_KIT) push"

db-seed:
	docker compose run --rm app deno run --allow-all packages/db/src/seed.ts

db-studio:
	docker compose run --rm -p 5555:5555 app sh -c "cd packages/db && deno run -A $(DRIZZLE_KIT) studio --host=0.0.0.0 --port=5555"

db-reset:
	docker compose run --rm app bash -c "echo 'Drop and recreate database manually, then run db-migrate and db-seed'"

# --- Admin Setup ---

setup:
	docker compose run --rm app deno run --allow-all apps/api/src/setup.ts

# --- Development ---

# Start full-stack dev environment:
#   • API with hot reload on http://localhost:8000
#   • Vite dev server with HMR on http://localhost:5173
#   • Vite proxies /api requests to the API container automatically
#
# Both services run as long-running containers (not one-shot `run`).
# Use `make down` or Ctrl-C + `docker compose --profile dev down` to stop.
dev: up
	docker compose --profile dev up app web-dev

# Start API dev server only (hot reload on :8000).
dev-api: up
	docker compose --profile dev up app

# Start Vite web dev server only (:5173).
# Assumes the API is already running (make dev-api or make dev).
web-dev:
	docker compose --profile dev up web-dev

# --- Frontend ---

# Build the React SPA (outputs to apps/web/dist/).
web-build:
	docker compose run --rm --no-deps app sh -c "cd apps/web && deno run -A npm:vite build"

# Preview production build — builds the web app and serves it via Caddy on :8080
# alongside the production-like API on :8000.
preview: web-build up
	docker compose --profile preview up app-preview web

# --- CI ---

ci: fmt-check lint check check-tests test-coverage
