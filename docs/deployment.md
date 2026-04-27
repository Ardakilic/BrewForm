# Deployment

## Architecture Overview

```
┌──────────────────┐       ┌──────────────────────────┐
│  GitHub Pages    │       │    Deno Deploy (free)     │
│  (Static SPA)    │──────▶│    Hono API + Prisma      │
│  React + Vite    │ CORS  │    Deno KV (cache)        │
└──────────────────┘       │    PostgreSQL (managed)    │
                           └──────────────────────────┘
```

- **Frontend**: React SPA built with Vite, deployed to GitHub Pages as static assets
- **Backend**: Hono API running on Deno Deploy, connecting to a managed PostgreSQL instance
- **Cache**: Deno KV for taste note hierarchy, popular recipes, and search result caching
- **Email**: SMTP (Mailpit in development, production SMTP in production)

## Backend Deployment (Deno Deploy)

1. Push to `main` branch
2. GitHub Actions workflow builds and deploys via `denoland/deployctl@v1` with OIDC authentication
3. Environment variables configured in the Deno Deploy dashboard
4. Entry point: `apps/api/src/main.ts`
5. Deno Deploy provides built-in Deno KV

Required environment variables for production:

| Variable               | Description                              |
| ---------------------- | ---------------------------------------- |
| `DATABASE_URL`         | PostgreSQL connection string             |
| `JWT_SECRET`           | Cryptographically random, ≥32 characters |
| `CORS_ALLOWED_ORIGINS` | `https://yourdomain.com`                 |
| `APP_URL`              | `https://your-api.deno.dev`              |
| `SMTP_HOST`            | Production SMTP host                     |
| `SMTP_PORT`            | Production SMTP port                     |
| `SMTP_USER`            | SMTP username                            |
| `SMTP_PASS`            | SMTP password                            |
| `SMTP_SECURE`          | `true` for production                    |
| `EMAIL_FROM`           | Sender email address                     |
| `APP_ENV`              | `production`                             |

## Frontend Deployment (GitHub Pages)

1. Push to `main` branch
2. GitHub Actions builds the React SPA
3. `VITE_API_URL` is injected at build time via Vite's `define` config:
   - Production: `https://brewform-api.deno.dev/api/v1`
   - Development: `/api/v1` (proxied by Vite dev server)
4. Built assets in `apps/web/dist/` deployed to GitHub Pages
5. SPA routing handled via `404.html` redirect trick with `sessionStorage`

The `404.html` trick:

- GitHub Pages returns `404.html` for unknown paths
- `404.html` saves the original URL path to `sessionStorage` and redirects to `/`
- `index.html` checks `sessionStorage` on load and restores the URL via `history.replaceState`

## Local Development

```bash
make up          # Start all services (postgres, mailpit, pgadmin, app)
make dev         # Start development server (hot reload)
make logs        # View API logs
make db-migrate  # Apply database migrations
make db-seed     # Seed sample data
make db-studio   # Open Prisma Studio GUI at localhost:5555
```

After seeding, admin credentials: `admin@brewform.local` / `admin123456`

### Development Services

| Service    | Port        | Purpose                        |
| ---------- | ----------- | ------------------------------ |
| API        | 8000        | Hono backend                   |
| Web (Vite) | 5173        | React dev server with HMR      |
| PostgreSQL | 5432        | Database                       |
| Mailpit    | 1025 / 8025 | SMTP server + web UI for email |
| pgAdmin    | 5050        | Database GUI                   |

### Docker Compose

The `docker-compose.yml` defines four services:

- **app**: Deno runtime with the API
- **postgres**: PostgreSQL 16 database
- **mailpit**: SMTP testing with web UI
- **pgadmin**: PostgreSQL admin GUI

## CI/CD Pipelines

### Main Pipeline (`.github/workflows/ci.yml`)

Triggers on push to `main`:

1. **Quality**: Format check, lint, type check (`deno check --unstable-sloppy-imports`)
2. **Test**: PostgreSQL service container, migrations, seed, test suite
3. **Deploy Backend**: Deploy to Deno Deploy via `deployctl`
4. **Deploy Frontend**: Build React SPA with `VITE_API_URL`, deploy to GitHub Pages

### PR Checks (`.github/workflows/pr.yml`)

Triggers on pull requests:

1. Format check
2. Lint
3. Type check
4. Shared package unit tests

## Environment Variables Reference

See `.env.example` for all configuration options. Key variables:

| Variable                | Default                     | Description                                |
| ----------------------- | --------------------------- | ------------------------------------------ |
| `APP_PORT`              | `8000`                      | Server port                                |
| `APP_ENV`               | `development`               | `development`, `production`, or `test`     |
| `LOG_LEVEL`             | `info`                      | Log level (debug, info, warn, error)       |
| `DATABASE_URL`          | —                           | **Required.** PostgreSQL connection string |
| `CACHE_DRIVER`          | `deno-kv`                   | `deno-kv` or `memory`                      |
| `JWT_SECRET`            | —                           | **Required.** ≥16 characters               |
| `JWT_ACCESS_EXPIRY`     | `15m`                       | Access token validity period               |
| `JWT_REFRESH_EXPIRY`    | `7d`                        | Refresh token validity period              |
| `CORS_ALLOWED_ORIGINS`  | `http://localhost:5173,...` | Comma-separated allowed origins            |
| `SMTP_HOST`             | `localhost`                 | SMTP server host                           |
| `SMTP_PORT`             | `1025`                      | SMTP server port                           |
| `UPLOAD_DIR`            | `./uploads`                 | Photo upload directory                     |
| `UPLOAD_MAX_SIZE_BYTES` | `10485760`                  | Max upload size (10 MB)                    |
| `APP_URL`               | `http://localhost:8000`     | Base URL for QR code generation            |
| `OPENAPI_ENABLED`       | `true`                      | Enable /openapi.json endpoint              |
