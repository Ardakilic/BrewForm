## Core Commands (all via Docker / `make`)

```bash
# Infrastructure
make up              # Start postgres, mailpit, pgadmin, garage (NOT the app)

# Setup (first run)
make install         # Cache deno dependencies
make email-build     # Build MJML → HTML templates (required before API)
make db-generate && make db-migrate && make db-seed  # Full DB setup

# Development
make dev             # Full-stack: API :8000 + Vite :5173
make dev-api         # API only (:8000)
make web-dev         # Web only (:5173, needs API running)

# Code Quality
make check           # Type-check all workspaces
make lint            # Lint all
make fmt             # Format all
make fmt-check       # Check formatting without changes

# Testing
make test            # All tests
make test-api        # API tests only
make test-shared     # Shared package tests only
make test-specific filter=path/to/test.ts  # Single test

# Build
make build-api       # Build API (email templates)
make build-web       # Build React SPA → apps/web/dist/

# Database
make db-studio       # Drizzle Studio on :5555
make db-reset        # Instructions to reset

# CI
make ci              # Full pipeline: fmt + lint + check + build + test
```

## Running a single test directly
```
deno test --no-check --allow-all apps/api/src/path/to/file_test.ts
```

## Required command order
Type-check → Test (never flip): `deno task check` then `deno task test`.