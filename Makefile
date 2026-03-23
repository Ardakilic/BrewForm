# ============================================
# BrewForm Makefile
# All commands run through Docker/Docker Compose
# ============================================

.PHONY: help install vscode-setup dev build rebuild start stop restart logs shell test lint format format-check db-migrate db-seed db-studio db-generate db-reset db-reset-hard reset-password clean prune up

# Default target
help:
	@echo "BrewForm - Coffee Dive-in Recipe Platform"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Development:"
	@echo "  install       Install all dependencies"
	@echo "  vscode-setup  Setup VSCode settings (copies .vscode/settings.json.example)"
	@echo "  up            Start all services in detached mode"
	@echo "  dev           Start development environment"
	@echo "  build         Build all applications"
	@echo "  rebuild       Rebuild and restart all services"
	@echo "  start         Start production environment"
	@echo "  stop          Stop all containers"
	@echo "  restart       Restart all containers"
	@echo "  logs          View container logs"
	@echo "  logs-api      View API container logs"
	@echo "  logs-web      View Web container logs"
	@echo ""
	@echo "Database:"
	@echo "  db-migrate    Run database migrations"
	@echo "  db-seed       Seed database with sample data"
	@echo "  db-seed-taste-notes  Seed taste notes from SCAA JSON file"
	@echo "  db-studio     Open Prisma Studio"
	@echo "  db-reset      Reset database (warning: destructive)"
	@echo "  db-reset-hard Complete database reset with migrations and seeds"
	@echo "  db-generate   Generate Prisma client"
	@echo "  reset-password Reset user password (USER=email PASSWORD=optional)"
	@echo ""
	@echo "Testing:"
	@echo "  test          Run all tests"
	@echo "  test-api      Run API tests"
	@echo "  test-web      Run Web tests"
	@echo "  test-coverage Run tests with coverage"
	@echo ""
	@echo "Code Quality:"
	@echo "  lint          Run linter"
	@echo "  lint-fix      Fix linting issues"
	@echo "  format        Format code"
	@echo "  format-check  Check code formatting"
	@echo "  check         Run all checks (lint, typecheck, format-check)"
	@echo ""
	@echo "Utilities:"
	@echo "  shell-api     Open shell in API container"
	@echo "  shell-web     Open shell in Web container"
	@echo "  shell-db      Open psql shell"
	@echo "  clean         Remove containers and volumes"
	@echo "  prune         Deep clean (removes images too)"

# ============================================
# Development Commands
# ============================================

install:
	@mkdir -p apps/api/node_modules apps/web/node_modules
	docker compose run --rm api deno install --allow-scripts=npm:@prisma/engines,npm:prisma,npm:@node-rs/argon2,npm:esbuild
	docker compose run --rm web deno install --allow-scripts=npm:esbuild

vscode-setup:
	@if [ ! -f .vscode/settings.json ]; then \
		mkdir -p .vscode && \
		cp .vscode/settings.json.example .vscode/settings.json && \
		echo "✅ VSCode settings created from template"; \
	else \
		echo "⚠️  .vscode/settings.json already exists. Remove it first to recreate."; \
	fi

up:
	docker compose up -d

dev:
	docker compose up -d postgres redis mailpit pgadmin
	@echo "Waiting for services to be healthy..."
	@sleep 5
	docker compose up api web

build:
	docker compose build --no-cache

rebuild:
	docker compose build --no-cache && docker compose up -d

start:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

stop:
	docker compose down

restart:
	docker compose restart

logs:
	docker compose logs -f

logs-api:
	docker compose logs -f api

logs-web:
	docker compose logs -f web

# ============================================
# Database Commands
# ============================================

db-generate:
	docker compose run --rm api deno task db:generate

db-migrate:
	docker compose run --rm api deno task db:migrate

db-migrate-dev:
	docker compose run --rm api deno task db:migrate:dev

db-seed:
	docker compose run --rm api deno task db:seed

db-seed-taste-notes:
	docker compose run --rm api deno task db:seed:taste-notes

db-studio:
	docker compose run --rm api deno task db:studio

db-reset:
	@echo "Warning: This will reset the database and delete all data!"
	@read -p "Are you sure? [y/N] " confirm && [ "$confirm" = "y" ] || exit 1
	docker compose run --rm api deno run --allow-all node_modules/.bin/prisma migrate reset --force

db-reset-hard:
	@echo "Warning: This will completely reset the database, recreate it, and run all migrations and seeds!"
	@echo "All data will be permanently lost."
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	@echo "Stopping services..."
	docker compose stop api web
	@echo "Resetting database volume..."
	docker compose down -v postgres
	@echo "Starting database..."
	docker compose up -d postgres
	@echo "Waiting for database to be ready..."
	sleep 10
	@echo "Running migrations..."
	docker compose run --rm api deno task db:migrate
	@echo "Seeding database..."
	docker compose run --rm api deno task db:seed
	@echo "Starting all services..."
	docker compose up -d
	@echo "Database reset complete!"

db-push:
	docker compose run --rm api deno task db:push

reset-password:
ifndef USER
	@echo "Usage: make reset-password USER=<email-or-username> [PASSWORD=<new-password>]"
	@echo ""
	@echo "Examples:"
	@echo "  make reset-password USER=admin@brewform.local"
	@echo "  make reset-password USER=admin PASSWORD=MySecurePassword123!"
	@exit 1
endif
ifdef PASSWORD
	docker compose run --rm api deno run --allow-all prisma/reset-password.ts $(USER) "$(PASSWORD)"
else
	docker compose run --rm api deno run --allow-all prisma/reset-password.ts $(USER)
endif

# ============================================
# Testing Commands
# ============================================

test:
	docker compose run --rm api deno task test
	docker compose run --rm web deno task test

test-api:
	docker compose run --rm --service-ports api deno task test

test-web:
	docker compose run --rm --service-ports web deno task test

test-coverage:
	docker compose run --rm --service-ports api deno task test:coverage
	docker compose run --rm --service-ports web deno task test:coverage

test-watch:
	docker compose run --rm --service-ports api deno task test:watch

# ============================================
# Code Quality Commands
# ============================================

lint:
	docker compose run --rm api deno task lint
	docker compose run --rm web deno task lint

lint-fix:
	docker compose run --rm api deno task lint:fix
	docker compose run --rm web deno task lint:fix

format:
	docker compose run --rm api deno task format
	docker compose run --rm web deno task format

format-check:
	docker compose run --rm api deno task format:check
	docker compose run --rm web deno task format:check

check:
	docker compose run --rm api deno task check
	docker compose run --rm web deno task check

typecheck:
	docker compose run --rm api deno task typecheck
	docker compose run --rm web deno task typecheck

# ============================================
# Shell Commands
# ============================================

shell-api:
	docker compose exec api sh

shell-web:
	docker compose exec web sh

shell-db:
	docker compose exec postgres psql -U brewform -d brewform

shell-redis:
	docker compose exec redis redis-cli

# ============================================
# Cleanup Commands
# ============================================

clean:
	docker compose down -v --remove-orphans
	@echo "Cleaned up containers and volumes"

prune:
	docker compose down -v --remove-orphans --rmi all
	docker system prune -f
	@echo "Deep clean completed"

# ============================================
# Production Commands
# ============================================

prod-build:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml build

prod-start:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

prod-logs:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f

prod-stop:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml down

# ============================================
# Initialization
# ============================================

init: install db-migrate db-seed
	@echo "BrewForm initialized successfully!"
	@echo "Run 'make dev' to start the development environment"

setup:
	@echo "Setting up BrewForm..."
	cp -n .env.example .env || true
	make install
	make db-migrate
	make db-seed
	@echo ""
	@echo "Setup complete! Run 'make dev' to start."
