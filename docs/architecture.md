# Architecture

## Monorepo Structure

BrewForm uses a Turborepo monorepo with npm workspaces. Four packages:

| Package | Purpose | Runtime |
|---------|---------|---------|
| `apps/api` | Hono backend API | Deno Deploy |
| `apps/web` | React SPA frontend | Browser (GitHub Pages) |
| `packages/shared` | Types, Zod schemas, constants, utils, i18n | Shared (api + web) |
| `packages/db` | Prisma schema, migrations, seed data, client | Server (api only) |

### Dependency Graph

```
apps/web ──────→ packages/shared
                       ↑
apps/api ──┬──→ packages/shared
           └──→ packages/db ──→ packages/shared
```

The frontend **never** imports from `@brewform/db`. All type sharing happens through `@brewform/shared`.

### Package Identifiers

- `@brewform/shared` — types, schemas, constants, utils, i18n
- `@brewform/db` — Prisma client, schema, migrations

Both are configured as npm workspace packages in the root `package.json` using `*` protocol (not `workspace:*`).

## Backend Module Pattern

Each API domain module follows a strict 3-layer pattern:

```
modules/
  recipe/
    model.ts      ← Prisma wrapper (raw data access, as any casts)
    service.ts    ← Business logic (validation, authorization, orchestration)
    index.ts      ← Controller (Hono routes, Zod validation, response formatting)
```

**Key rules:**
- **Services never import from `@prisma/client`** — they import from model files
- **Models use `as any` type assertions** for Prisma query options (generated types may lag behind schema changes)
- **Controllers validate with shared Zod schemas** — `@brewform/shared/schemas`
- **File-level lint suppressions**: modules use `// deno-lint-ignore-file no-explicit-any require-await`

### Hono Context Variables

All routes share typed context variables via `AppEnv`:

```typescript
import type { AppEnv } from '../../types/hono.ts';
const router = new Hono<AppEnv>();
// c.get('userId')   → string | null (set by authMiddleware)
// c.get('user')     → unknown | null (set by authMiddleware)
// c.get('cache')    → CacheProvider (injected by middleware)
// c.get('requestId') → string (set by requestIdMiddleware)
```

## Cache Architecture

All caching goes through the `CacheProvider` interface — services never call `Deno.openKv()` directly:

```typescript
interface CacheProvider {
  get<T>(key: string[]): Promise<T | null>;
  set<T>(key: string[], value: T, options?: { ttlMs?: number }): Promise<void>;
  delete(key: string[]): Promise<void>;
  deleteByPrefix(prefix: string[]): Promise<void>;
}
```

Two implementations:
- **`DenoKVCacheProvider`** — production, uses Deno KV with TTL support
- **`InMemoryCacheProvider`** — testing, uses an in-process Map

The active provider is chosen at startup based on `CACHE_DRIVER` env variable and injected into Hono context.

## Validation

Zod schemas live in `@brewform/shared/schemas` and are shared between frontend and backend:

- **Hard validation** — blocks save. Applied in API controllers via `c.req.json()` → schema `.parse()`
- **Soft validation** — warns but allows save. Applied in service layer, returns warnings alongside data

Example: recipe creation uses `RecipeCreateSchema` (hard validation with `.refine()`) while warnings like "extraction time seems short for espresso" are computed separately.

## Portability Rules (§6.2)

BrewForm maintains database portability:

- **No raw SQL** — all queries via Prisma Client
- **No `@db.JsonB`, `@db.Uuid`** — all structured data is relational, all IDs are `@default(uuid())` strings
- **No Postgres-specific query operators** — no `mode: 'insensitive'`, etc.
- **All filterable fields reference normalized entities or enums**
- **Services import from model files**, never from `@prisma/client`
- **Postgres-specific features** are isolated with `// POSTGRES-SPECIFIC` comments if unavoidable

## Database

### Schema Overview

24 models and 12 enums in a single Prisma schema:

- **Core**: User, UserPreferences, Recipe, RecipeVersion
- **Recipe parts**: RecipeTasteNote, RecipeEquipment, RecipeAdditionalPreparation
- **Social**: Comment, UserFollow, UserRecipeLike, UserRecipeFavourite
- **Assets**: Photo, RecipeVersionPhoto, Bean, Vendor, Equipment
- **Configuration**: Setup, TasteNote, BrewMethodEquipmentRule
- **Gamification**: Badge, UserBadge
- **Moderation**: Report, AuditLog, PasswordReset

### Soft Deletes

All main entities have a `deletedAt DateTime?` field. Queries use `findFirst({ where: { deletedAt: null } })` instead of `findUnique` for soft-delete filtering, since `deletedAt` is not a unique constraint.

### Connection Pooling

Configured via `DATABASE_URL` parameters:
```
DATABASE_URL=postgresql://user:pass@host:5432/brewform?connection_limit=10&pool_timeout=30
```

## Middleware Stack

Applied in order:

1. **CORS** — allows configured origins
2. **Request ID** — generates unique `requestId` for tracing
3. **Rate Limiting** — 100 requests per minute per IP
4. **Cache Injection** — sets `CacheProvider` on context
5. **Error Handler** — catches all errors, returns consistent error envelope

Route-level middleware:
- **`authMiddleware`** — required auth (valid JWT, not banned, not deleted)
- **`optionalAuthMiddleware`** — inspect token if present, allow anonymous
- **`adminMiddleware`** — requires auth + admin role

## Background Jobs

Simple interval-based job scheduler:

```typescript
registerJob('badge-evaluation', 3600000, evaluateBadges);
startJobs();   // Called on server startup
stopJobs();    // Called on graceful shutdown
```

Jobs are registered with a name, interval (ms), and handler function. The scheduler is started/stopped with the server lifecycle.

## Graceful Shutdown

The server handles SIGTERM and SIGINT by:

1. Stopping background jobs
2. Shutting down the HTTP server
3. Closing Deno KV connection
4. Disconnecting Prisma client
5. Calling `Deno.exit(0)`

## Testing

Tests use the Deno test runner with BDD-style syntax from JSR:

```typescript
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
```

Commands:
- `make test` — full test suite
- `make test-api` — API tests only
- `make test-shared` — shared package tests only
- `make test-specific filter=path/to/test.ts` — single test file

Tests run with `--no-check` (type checking done separately via `make check`) and `--unstable-sloppy-imports` (for barrel file paths without `.ts` extensions).