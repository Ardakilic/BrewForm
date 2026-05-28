## Tech Stack

| Layer      | Technology                       |
|------------|----------------------------------|
| Runtime    | Deno 2.7                         |
| Backend    | Hono (Deno Deploy)              |
| Frontend   | React 19 + Vite + Tailwind v4 + Base UI |
| ORM        | Drizzle ORM (postgres-js)       |
| Database   | PostgreSQL 18                    |
| Cache      | Deno KV (prod) / InMemoryMap (test) |
| Storage    | Local filesystem or S3 (Garage) |
| Email      | MJML (pre-compiled at build)    |
| Validation | Zod (shared between fe/be)      |
| Logging    | Shared Logger interface, pino (API), Console (Web) |
| Testing    | Deno test + `@std/testing/bdd` + `@std/expect` |
| CI/CD      | GitHub Actions → Deno Deploy    |

## Package Identifiers
- `@brewform/shared` — types, Zod schemas, constants, utils, i18n
- `@brewform/db` — Drizzle client, schema, migrations, seed
- `@brewform/api` — Hono backend
- `@brewform/web` — React SPA

## Key Config
- Deno unstable features: cron, kv
- Lint: excludes no-explicit-any, require-await, no-empty, no-import-prefix, no-unversioned-import
- Format: lineWidth 100, indentWidth 2, singleQuote, semiColons
- All imports use explicit `.ts` extensions
- Vite resolves `@brewform/shared/*` via explicit aliases (Node can't resolve TS from package.json exports)

## Test Env Requirements
- `DATABASE_URL` and `JWT_SECRET` must be set
- `CACHE_DRIVER=memory` skips Deno KV
- `APP_ENV=test` suppresses email notifications