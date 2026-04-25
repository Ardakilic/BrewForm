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
	docker compose run --rm app npm install

# --- Turbo Tasks (standalone) ---

turbo-build:
	docker compose run --rm app npx turbo run build

turbo-test:
	docker compose run --rm app npx turbo run test

turbo-lint:
	docker compose run --rm app npx turbo run lint

turbo-check:
	docker compose run --rm app npx turbo run check

# --- Code Quality ---

lint:
	docker compose run --rm app deno lint

fmt:
	docker compose run --rm app deno fmt

fmt-check:
	docker compose run --rm app deno fmt --check

check:
	docker compose run --rm app bash -c "npm install 2>/dev/null && rm -rf node_modules/.prisma && cd packages/db && npx prisma generate 2>/dev/null && cd /app && deno check apps/api/src/main.ts"

# --- Testing ---

test:
	docker compose run --rm app deno test --coverage=coverage/

coverage:
	docker compose run --rm app deno coverage coverage/

test-coverage: test coverage

# --- Database ---

db-migrate:
	docker compose exec app npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma

db-generate:
	docker compose run --rm app bash -c "rm -rf node_modules/.prisma && cd packages/db && npx prisma generate --schema=prisma/schema.prisma"

db-dev-migrate:
	docker compose exec app npx prisma migrate dev --schema=packages/db/prisma/schema.prisma

db-seed:
	docker compose exec app node packages/db/prisma/seed.cjs

db-studio:
	docker compose exec app npx prisma studio --schema=packages/db/prisma/schema.prisma

db-reset:
	docker compose exec app npx prisma migrate reset --force --schema=packages/db/prisma/schema.prisma

# --- Admin Setup ---

setup:
	docker compose exec app deno run --allow-all apps/api/src/setup.ts

# --- Frontend ---

web-build:
	docker compose run --rm app npx turbo run build --filter=@brewform/web

web-dev:
	docker compose run --rm --service-ports app npx turbo run dev --filter=@brewform/web

# --- CI ---

ci: fmt-check lint check test-coverage

# --- Dev ---

dev-api:
	docker compose run --rm --service-ports app deno run --allow-all --watch apps/api/src/main.ts

dev:
	docker compose up -d postgres mailpit pgadmin && docker compose run --rm --service-ports app npx turbo run dev