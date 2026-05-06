# ============================================================
# BrewForm — Makefile (Turborepo Monorepo)
# All commands run through Docker. No local Deno/Node required.
# ============================================================

# --- App Lifecycle ---

up:
	docker compose up -d

down:
	docker compose down

build:
	docker compose build

logs:
	docker compose logs -f app

restart:
	docker compose restart app

# --- Dependencies ---

install:
	docker compose run --rm app deno install

# --- Turbo Tasks (standalone) ---

turbo-build:
	docker compose run --rm app deno run -A npm:turbo@^2.5.0 run build

turbo-test:
	docker compose run --rm app deno run -A npm:turbo@^2.5.0 run test

turbo-lint:
	docker compose run --rm app deno run -A npm:turbo@^2.5.0 run lint

turbo-check:
	docker compose run --rm app deno run -A npm:turbo@^2.5.0 run check

# --- Code Quality ---

lint:
	docker compose run --rm app deno lint apps/ packages/

fmt:
	docker compose run --rm app deno fmt apps/ packages/

fmt-check:
	docker compose run --rm app deno fmt --check apps/ packages/

check: install
	docker compose run --rm app deno check --unstable-sloppy-imports apps/api/src/main.ts

# --- Testing ---

check-tests:
	docker compose run --rm app deno check --unstable-sloppy-imports apps/api/src/ packages/shared/src/

test:
	docker compose run --rm app deno test --unstable-sloppy-imports --no-check --allow-env --allow-read --allow-write --allow-net --allow-sys --allow-ffi apps/api/src/ packages/shared/src/

test-coverage:
	docker compose run --rm app deno test --unstable-sloppy-imports --no-check --allow-env --allow-read --allow-write --allow-net --allow-sys --allow-ffi --coverage=coverage/ apps/api/src/ packages/shared/src/

test-api:
	docker compose run --rm app deno test --unstable-sloppy-imports --no-check --allow-env --allow-read --allow-write --allow-net --allow-sys --allow-ffi apps/api/src/

test-shared:
	docker compose run --rm app deno test --allow-env --allow-read --allow-write --allow-net packages/shared/src/

test-specific:
	docker compose run --rm app deno test --unstable-sloppy-imports --no-check --allow-env --allow-read --allow-write --allow-net --allow-sys --allow-ffi $(filter)

# --- Database ---

db-migrate:
	docker compose run --rm app sh -c "cd packages/db && deno run -A npm:drizzle-kit@latest migrate"

db-generate:
	docker compose run --rm app sh -c "cd packages/db && deno run -A npm:drizzle-kit@latest generate"

db-push:
	docker compose run --rm app sh -c "cd packages/db && deno run -A npm:drizzle-kit@latest push"

db-seed:
	docker compose run --rm app deno run --allow-all packages/db/src/seed.ts

db-studio:
	docker compose run --rm --service-ports app sh -c "cd packages/db && deno run -A npm:drizzle-kit@latest studio --host=0.0.0.0 --port=5555"

db-reset:
	docker compose run --rm app bash -c "echo 'Drop and recreate database manually, then run db-migrate and db-seed'"

# --- Admin Setup ---

setup:
	docker compose run --rm app deno run --allow-all apps/api/src/setup.ts

# --- Frontend ---

web-build:
	docker compose run --rm app deno run -A npm:turbo@^2.5.0 run build --filter=@brewform/web

web-dev:
	docker compose run --rm --service-ports app deno run -A npm:turbo@^2.5.0 run dev --filter=@brewform/web

# --- CI ---

ci: fmt-check lint check check-tests test-coverage

# --- Dev ---

dev-api:
	docker compose run --rm --service-ports app deno run --allow-all --watch apps/api/src/main.ts

dev:
	docker compose up -d postgres mailpit pgadmin && docker compose run --rm --service-ports app deno run -A npm:turbo@^2.5.0 run dev
