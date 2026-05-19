## Project Overview

BrewForm — web application for digitalizing, sharing, and discovering coffee brewing recipes.
Full-stack Deno monorepo with Hono API + React SPA frontend.

## Dependency Graph
```
apps/web → @brewform/shared
                ↑
apps/api  ─┬──→ @brewform/shared
           └──→ @brewform/db → @brewform/shared
```

**FRONTEND NEVER IMPORTS FROM @brewform/db.** Only @brewform/shared.

## Operations

- Everything runs through Docker. No local Deno required.
- `make up` starts infra only (postgres, mailpit, pgadmin, garage). Does NOT start app.
- `make dev` starts API :8000 + Vite :5173 with HMR.
- Build order: install → email-build → db-generate → db-migrate → db-seed → dev.

## Database

- 24 tables, 12 enums. Drizzle ORM only, no raw SQL.
- Soft deletes on all main entities (deletedAt). Use `findFirst({ where: eq(t.deletedAt, null) })`, never `findUnique`.
- No JSONB/UUID columns. No Postgres-specific operators. Connection pool max:10.
- Seed command: `deno run -A packages/db/src/seed.ts`.

## Serena

- Project name is `brewform` (from `.serena/project.yml`). Activate with `serena_activate_project` using the name, not the path.
- MCP server on :10122. Dashboard on :34283. Start with `make serena-up`.

For exact commands: `mem:suggested_commands`. For code conventions: `mem:conventions`. For tech details: `mem:tech_stack`.