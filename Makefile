# ============================================
# BrewForm Makefile
# All commands run through Docker/Docker Compose
# ============================================

.PHONY: help install dev build start stop restart logs shell test lint format db-migrate db-seed db-studio clean prune

# Default target
help:
	@echo "BrewForm - Coffee Dive-in Recipe Platform"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Development:"
	@echo "  install       Install all dependencies"
	@echo "  dev           Start development environment"
	@echo "  build         Build all applications"
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
	@echo "  db-generate   Generate Prisma client"
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
	@echo "  check         Run all checks"
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
	@mkdir -p node_modules apps/api/node_modules apps/web/node_modules
	docker compose run --rm api pnpm install
	docker compose run --rm web pnpm install

dev:
	docker compose up -d postgres redis mailpit pgadmin
	@echo "Waiting for services to be healthy..."
	@sleep 5
	docker compose up api web

build:
	docker compose build --no-cache

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
	docker compose exec api pnpm --filter @brewform/api db:generate

db-migrate:
	docker compose exec api pnpm --filter @brewform/api db:migrate

db-migrate-dev:
	docker compose exec api pnpm --filter @brewform/api prisma migrate dev

db-seed:
	docker compose exec api pnpm --filter @brewform/api db:seed

db-seed-taste-notes:
	docker compose exec api pnpm --filter @brewform/api db:seed:taste-notes

db-studio:
	docker compose exec api pnpm --filter @brewform/api prisma studio

db-reset:
	@echo "Warning: This will reset the database and delete all data!"
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	docker compose exec api pnpm --filter @brewform/api prisma migrate reset --force

db-push:
	docker compose exec api pnpm --filter @brewform/api prisma db push

# ============================================
# Testing Commands
# ============================================

test:
	docker compose exec api pnpm test
	docker compose exec web pnpm test

test-api:
	docker compose exec api pnpm test

test-web:
	docker compose exec web pnpm test

test-coverage:
	docker compose exec api pnpm test:coverage
	docker compose exec web pnpm test:coverage

test-watch:
	docker compose exec api pnpm test -- --watch

# ============================================
# Code Quality Commands
# ============================================

lint:
	docker compose exec api pnpm lint
	docker compose exec web pnpm lint

lint-fix:
	docker compose exec api pnpm lint:fix
	docker compose exec web pnpm lint:fix

format:
	docker compose exec api pnpm format

check:
	docker compose exec api pnpm check

typecheck:
	docker compose exec api pnpm typecheck
	docker compose exec web pnpm typecheck

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
