# BrewForm — Observability & DevOps Implementation Plan

## Stack Context

- **Runtime:** Deno 2.x, deployed on Deno Deploy
- **API framework:** Hono
- **ORM:** Drizzle (`packages/db/`, `npm:drizzle-kit`)
- **Cache:** Deno KV in production (`CACHE_DRIVER=deno-kv`); in-memory for tests (`CACHE_DRIVER=memory`)
- **Logging:** pino — `createLogger(moduleName)` at `apps/api/src/utils/logger/index.ts`
- **Frontend:** React 19 + Vite + React Router v7
- **No third-party services** — no external analytics, no error monitoring

---

## Issues in Scope

| ID | Title                           | Priority | Effort  |
|----|---------------------------------|----------|---------|
| N8 | No API/web tests on PR workflow | Medium   | 2–3 h   |
| L1 | Vite sourcemaps disabled        | Low      | 15 min  |

---

## N8 — Add Full Test Suite to PR Workflow

### Problem

`.github/workflows/pr.yml` only runs `packages/shared` tests. API tests and frontend tests never execute on pull requests, allowing broken logic to be merged undetected.

### Why `CACHE_DRIVER: memory` in tests

Deno KV when run outside of Deno Deploy is backed by SQLite on disk. Using `CACHE_DRIVER: deno-kv` in CI means cache state persists to disk between test runs unless each test explicitly calls `Deno.openKv(":memory:")` — which the application code does not do. The official Deno docs recommend the in-memory driver for testing to guarantee ephemeral, isolated state across runs. `memory` is therefore the correct value for all CI test jobs.

### File: `.github/workflows/pr.yml`

Replace the entire file:

```yaml
name: PR Checks

on:
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - uses: denoland/setup-deno@v2
        with:
          deno-version: v2.x

      - name: Install dependencies
        run: deno install --frozen

      - name: Generate Drizzle migration
        run: deno task db:generate

      - name: Build email templates
        run: deno task email-build

      - name: Format check
        run: deno fmt --check

      - name: Lint
        run: deno lint apps/ packages/

      - name: Type check
        run: deno task check

      - name: Build web
        run: deno task build:web

  test-unit:
    runs-on: ubuntu-latest
    needs: check
    steps:
      - uses: actions/checkout@v6

      - uses: denoland/setup-deno@v2
        with:
          deno-version: v2.x

      - name: Install dependencies
        run: deno install --frozen

      - name: Run shared package tests
        run: >
          deno test
          --allow-env
          --allow-read
          --allow-write
          --allow-net
          packages/shared/src/

  test-api:
    runs-on: ubuntu-latest
    needs: check
    services:
      postgres:
        image: postgres:18-alpine
        env:
          POSTGRES_USER: brewform
          POSTGRES_PASSWORD: brewform
          POSTGRES_DB: brewform_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    env:
      DATABASE_URL: postgresql://brewform:brewform@localhost:5432/brewform_test
      DATABASE_PROVIDER: postgresql
      JWT_SECRET: test-secret-for-ci-only-minimum-16-chars
      CACHE_DRIVER: memory
      APP_ENV: test
      APP_PORT: 8000
      CORS_ALLOWED_ORIGINS: http://localhost:5173
      LOG_LEVEL: info
      LOG_FORMAT: json
      STORAGE_DRIVER: local
      ENABLE_REGISTRATION: true

    steps:
      - uses: actions/checkout@v6

      - uses: denoland/setup-deno@v2
        with:
          deno-version: v2.x

      - name: Install dependencies
        run: deno install --frozen

      - name: Assert no uncommitted migrations
        run: |
          deno task db:generate
          git diff --exit-code

      - name: Build email templates
        run: deno task email-build

      - name: Run database migrations
        run: deno task db:migrate

      - name: Seed test database
        run: deno run --allow-all packages/db/src/seed.ts

      - name: Run API tests
        run: >
          deno test
          --no-check
          --allow-env
          --allow-read
          --allow-write
          --allow-net
          --allow-sys
          --allow-ffi
          apps/api/src/

      - name: Upload coverage
        if: always()
        uses: actions/upload-artifact@v7
        with:
          name: coverage-api-pr
          path: coverage/
          retention-days: 7

  test-web:
    runs-on: ubuntu-latest
    needs: check
    steps:
      - uses: actions/checkout@v6

      - uses: denoland/setup-deno@v2
        with:
          deno-version: v2.x

      - name: Install dependencies
        run: deno install --frozen

      - name: Run web tests
        # ⚠️  Verify the exact task name against apps/web/deno.json before applying.
        # Common patterns: `deno task --cwd apps/web test`
        # or a root-level alias like `deno task test:web`.
        run: deno task --cwd apps/web test
```

### File: `.github/workflows/ci.yml`

Open the existing file. Find the job that runs API tests (the one with a `postgres` service container). Ensure its `env` block contains both of these values — add them if missing, replace if different:

```yaml
CACHE_DRIVER: memory
STORAGE_DRIVER: local
```

---

## L1 — Enable Hidden Sourcemaps

### Problem

`apps/web/vite.config.ts` has `sourcemap: false`. When errors appear in Deno Deploy logs referencing minified output (e.g. `main.abc123.js:1:24531`) there is no way to trace them back to source.

`sourcemap: 'hidden'` generates `.map` files alongside the build output but does **not** append `//# sourceMappingURL=…` to the bundles — maps are never served to end users. They remain in `dist/assets/` for local debugging only.

### File: `apps/web/vite.config.ts`

Find the build options block and change one line:

```ts
// Before
sourcemap: false,

// After
sourcemap: 'hidden',
```

### File: `.gitignore`

Append at the end if not already present:

```
apps/web/dist/**/*.map
```

---

## Verification Checklist

### N8

- [ ] Open a PR with a deliberate failing API test — `test-api` job turns red
- [ ] Open a PR with a deliberate failing web test — `test-web` job turns red
- [ ] Open a PR with all tests passing — `test-unit`, `test-api`, and `test-web` all go green
- [ ] Confirm `CACHE_DRIVER: memory` in both `pr.yml` and `ci.yml` test job env blocks
- [ ] Confirm `STORAGE_DRIVER: local` in both `pr.yml` and `ci.yml` test job env blocks

### L1

- [ ] `deno task build:web` then `ls apps/web/dist/assets/*.map` — `.map` files present
- [ ] `grep -r sourceMappingURL apps/web/dist/assets/*.js` — no output (hidden mode confirmed)
- [ ] `.map` files are listed in `.gitignore` and not committed