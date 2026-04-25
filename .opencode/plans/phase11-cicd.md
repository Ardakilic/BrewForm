# BrewForm Phase 11 — CI/CD

## Status: READY

## Overview

GitHub Actions workflow for CI and deployment: lint/check/test on every push, deploy backend to Deno Deploy, deploy frontend to GitHub Pages.

---

## File Inventory

### 1. `.github/workflows/ci.yml`

Main CI + CD pipeline:

```yaml
name: CI & Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  # --- Lint, Format Check, Type Check ---
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: denoland/setup-deno@v2
        with:
          deno-version: v2.x

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install dependencies
        run: npm install

      - name: Generate Prisma client
        run: npx prisma generate --schema=packages/db/prisma/schema.prisma

      - name: Format check
        run: deno fmt --check

      - name: Lint
        run: deno lint

      - name: Type check
        run: deno check apps/api/src/main.ts

  # --- Tests with Coverage ---
  test:
    runs-on: ubuntu-latest
    needs: quality
    services:
      postgres:
        image: postgres:17-alpine
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
      JWT_SECRET: test-secret-for-ci-only-minimum-16-chars
      CACHE_DRIVER: memory
      APP_ENV: test
      APP_PORT: 8000
      CORS_ALLOWED_ORIGINS: http://localhost:5173

    steps:
      - uses: actions/checkout@v4

      - uses: denoland/setup-deno@v2
        with:
          deno-version: v2.x

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install dependencies
        run: npm install

      - name: Generate Prisma client
        run: npx prisma generate --schema=packages/db/prisma/schema.prisma

      - name: Run database migrations
        run: |
          export DATABASE_URL="postgresql://brewform:brewform@localhost:5432/brewform_test"
          npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma

      - name: Run seed data
        run: |
          export DATABASE_URL="postgresql://brewform:brewform@localhost:5432/brewform_test"
          deno run --allow-all packages/db/prisma/seed.ts

      - name: Run tests with coverage
        run: deno test --coverage=coverage/ apps/ packages/shared/src/

      - name: Generate coverage report
        run: deno coverage coverage/

      - name: Check coverage threshold
        run: |
          deno coverage coverage/ --lcov > coverage/lcov.info
          echo "Coverage report generated"

      - name: Upload coverage
        uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: coverage/

  # --- Deploy Backend to Deno Deploy ---
  deploy-backend:
    needs: [quality, test]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read

    steps:
      - uses: actions/checkout@v4

      - uses: denoland/setup-deno@v2
        with:
          deno-version: v2.x

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install dependencies
        run: npm install

      - name: Generate Prisma client
        run: npx prisma generate --schema=packages/db/prisma/schema.prisma

      - name: Deploy to Deno Deploy
        uses: denoland/deployctl@v1
        with:
          project: brewform-api
          entrypoint: apps/api/src/main.ts
          root: .

  # --- Build and Deploy Frontend to GitHub Pages ---
  deploy-frontend:
    needs: [quality, test]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write

    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}

    steps:
      - uses: actions/checkout@v4

      - uses: denoland/setup-deno@v2
        with:
          deno-version: v2.x

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install dependencies
        run: npm install

      - name: Build frontend
        run: npx turbo run build --filter=@brewform/web
        env:
          VITE_API_URL: https://brewform-api.deno.dev/api/v1

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: apps/web/dist/

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

### 2. `.github/workflows/pr.yml`

Lighter checks for pull requests (no deployment):

```yaml
name: PR Checks

on:
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: denoland/setup-deno@v2
        with:
          deno-version: v2.x

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install dependencies
        run: npm install

      - name: Generate Prisma client
        run: npx prisma generate --schema=packages/db/prisma/schema.prisma

      - name: Format check
        run: deno fmt --check

      - name: Lint
        run: deno lint

      - name: Type check
        run: deno check apps/api/src/main.ts

  test-unit:
    runs-on: ubuntu-latest
    needs: check
    env:
      DATABASE_URL: postgresql://brewform:brewform@localhost:5432/brewform_test
      JWT_SECRET: test-secret-for-ci-only-minimum-16-chars
      CACHE_DRIVER: memory
      APP_ENV: test
      APP_PORT: 8000
      CORS_ALLOWED_ORIGINS: http://localhost:5173

    steps:
      - uses: actions/checkout@v4

      - uses: denoland/setup-deno@v2
        with:
          deno-version: v2.x

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install dependencies
        run: npm install

      - name: Run unit tests (shared package only, no DB needed)
        run: deno test packages/shared/src/
```

### 3. `apps/web/vite.config.ts` — UPDATE for production API URL

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify(
      process.env.VITE_API_URL || '/api/v1'
    ),
  },
});
```

### 4. `apps/web/public/404.html`

For GitHub Pages SPA routing:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>BrewForm</title>
  <script>
    // Redirect all 404s to index.html for SPA routing
    // GitHub Pages serves this file for any non-matching path
    sessionStorage.redirect = location.pathname + location.search;
    location.replace('/');
  </script>
</head>
<body>
  Redirecting...
</body>
</html>
```

### 5. `apps/web/public/index.html` — SPA redirect script

Add to the existing `apps/web/index.html` (in `<head>` or as first script in `<body>`):

```html
<script>
  // Handle GitHub Pages SPA redirect
  if (sessionStorage.redirect) {
    const redirect = sessionStorage.redirect;
    delete sessionStorage.redirect;
    window.history.replaceState(null, '', redirect);
  }
</script>
```

### 6. `apps/web/public/_redirects` (for Netlify/fallback)

```
/*    /index.html   200
```

### 7. Environment Configuration for Production

The production environment variables need to be configured in Deno Deploy dashboard:

**Deno Deploy environment variables:**
- `DATABASE_URL` — Production PostgreSQL connection string
- `DATABASE_PROVIDER` — `postgresql`
- `CACHE_DRIVER` — `deno-kv` (automatic on Deno Deploy)
- `JWT_SECRET` — Production secret (generated, not the dev default)
- `JWT_ACCESS_EXPIRY` — `15m`
- `JWT_REFRESH_EXPIRY` — `7d`
- `CORS_ALLOWED_ORIGINS` — `https://brewform.github.io`
- `SMTP_HOST` — Production SMTP host
- `SMTP_PORT` — Production SMTP port
- `SMTP_USER` — Production SMTP user
- `SMTP_PASS` — Production SMTP password
- `EMAIL_FROM` — `noreply@brewform.com`
- `OPENAPI_ENABLED` — `false`
- `APP_ENV` — `production`
- `APP_PORT` — `8000`

---

## Key Design Decisions

- **Two workflows**: `ci.yml` runs on push to `main` (full CI + deploy), `pr.yml` runs on PRs (lint + check + unit tests only, no deployment).
- **Deno Deploy deployment** — uses `deployctl` action with OIDC authentication (no API key needed). Entry point: `apps/api/src/main.ts`.
- **GitHub Pages deployment** — builds the React SPA with `turbo run build --filter=@brewform/web`, deploys the `dist/` folder.
- **Environment split** — `VITE_API_URL` defaults to `/api/v1` for dev (proxied through Vite dev server) and `https://brewform-api.deno.dev/api/v1` for production (set during CI build).
- **SPA routing on GitHub Pages** — `404.html` redirect trick and `sessionStorage` restore ensure client-side routing works on GitHub Pages.
- **PostgreSQL service in CI** — the `test` job spins up a PostgreSQL container for integration tests that need a database.
- **Coverage artifact** — uploaded to GitHub Actions for review, but threshold enforcement happens in the test step itself.