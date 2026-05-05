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

check:
	docker compose run --rm app bash -c "deno install 2>/dev/null && rm -rf node_modules/.prisma && cd packages/db && deno run -A npm:prisma@^6.19.3 generate 2>/dev/null && cd /app && deno check --unstable-sloppy-imports apps/api/src/main.ts"

# --- Testing ---

test:
	docker compose run --rm app deno test --unstable-sloppy-imports --no-check --allow-env --allow-read --allow-write --allow-net --allow-sys apps/api/src/ packages/shared/src/

test-coverage:
	docker compose run --rm app deno test --unstable-sloppy-imports --no-check --allow-env --allow-read --allow-write --allow-net --allow-sys --coverage=coverage/ apps/api/src/ packages/shared/src/

test-api:
	docker compose run --rm app deno test --unstable-sloppy-imports --no-check --allow-env --allow-read --allow-write --allow-net --allow-sys apps/api/src/

test-shared:
	docker compose run --rm app deno test --allow-env --allow-read --allow-write --allow-net packages/shared/src/

test-specific:
	docker compose run --rm app deno test --unstable-sloppy-imports --no-check --allow-env --allow-read --allow-write --allow-net --allow-sys $(filter)

# --- Database ---

db-migrate:
	docker compose exec app deno run -A npm:prisma@^6.19.3 migrate deploy --schema=packages/db/prisma/schema.prisma

db-generate:
	docker compose run --rm app bash -c "rm -rf node_modules/.prisma && cd packages/db && deno run -A npm:prisma@^6.19.3 generate --schema=prisma/schema.prisma"

db-dev-migrate:
	docker compose exec app deno run -A npm:prisma@^6.19.3 migrate dev --schema=packages/db/prisma/schema.prisma

db-seed:
	docker compose exec app deno run --allow-all packages/db/prisma/seed.ts

db-studio:
	docker compose exec app deno run -A npm:prisma@^6.19.3 studio --schema=packages/db/prisma/schema.prisma

db-reset:
	docker compose exec app deno run -A npm:prisma@^6.19.3 migrate reset --force --schema=packages/db/prisma/schema.prisma

# --- Admin Setup ---

setup:
	docker compose exec app deno run --allow-all apps/api/src/setup.ts

# --- Frontend ---

web-build:
	docker compose run --rm app deno run -A npm:turbo@^2.5.0 run build --filter=@brewform/web

web-dev:
	docker compose run --rm --service-ports app deno run -A npm:turbo@^2.5.0 run dev --filter=@brewform/web

# --- CI ---

ci: fmt-check lint check test-coverage

# --- Dev ---

dev-api:
	docker compose run --rm --service-ports app deno run --allow-all --watch apps/api/src/main.ts

dev:
	docker compose up -d postgres mailpit pgadmin && docker compose run --rm --service-ports app deno run -A npm:turbo@^2.5.0 run dev