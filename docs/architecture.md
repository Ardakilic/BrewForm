# Architecture

This document is the reference for _how_ the system is structured. Two companion docs cover the
_why_ and the _flow_:

- [`decisions.md`](decisions.md) — architectural decision records (Hono, JWT, Drizzle ORM, caching,
  module pattern, etc.)
- [`request-lifecycle.md`](request-lifecycle.md) — end-to-end trace of a request from the edge to
  the response, including middleware order, validation, error path, and side-effect path

## Monorepo Structure

BrewForm uses a pnpm workspaces monorepo (`pnpm-workspace.yaml`). Four packages:

| Package           | Purpose                                       | Runtime                |
| ----------------- | --------------------------------------------- | ---------------------- |
| `apps/api`        | Hono backend API                              | Node 24 (tsx)          |
| `apps/web`        | React SPA frontend                            | Browser (static SPA)   |
| `packages/shared` | Types, Zod schemas, constants, utils, i18n    | Shared (api + web)     |
| `packages/db`     | Drizzle schema, migrations, seed data, client | Server (api only)      |

### Dependency Graph

```
apps/web ──────→ packages/shared
                       ↑
apps/api ──┬──→ packages/shared
           └──→ packages/db ──→ packages/shared
```

The frontend **never** imports from `@brewform/db`. All type sharing happens through
`@brewform/shared`.

### Package Identifiers

- `@brewform/shared` — types, schemas, constants, utils, i18n
- `@brewform/db` — Drizzle client, schema, migrations

Both are configured as pnpm workspace members in `pnpm-workspace.yaml` (`packages: ['apps/*', 'packages/*']`).

Among the utilities in `@brewform/shared` is `generateUniqueUsername(baseUsername)`, which appends a suffix to produce a unique username when the base is already taken. Username and email uniqueness is enforced consistently via `isUsernameTaken` and `isEmailTaken` helpers, both of which apply a `deletedAt IS NULL` filter.

## Backend Module Pattern

Each API domain module follows a strict 3-layer pattern:

```
modules/
  recipe/
    model.ts      ← Drizzle query builder (raw data access, typed selects/inserts)
    service.ts    ← Business logic (validation, authorization, orchestration)
    index.ts      ← Controller (Hono routes, Zod validation, response formatting)
```

**Key rules:**

- **Services never import from `drizzle-orm`** directly — they import from model files
- **Models use Drizzle relational queries and typed builders** for all database access
- **Controllers validate with shared Zod schemas** — `@brewform/shared/schemas`
- **File-level lint suppressions**: modules use
  `// biome-ignore lint/suspicious/noExplicitAny: <reason>`

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

All caching goes through the `CacheProvider` interface — services never construct a cache
backend directly:

```typescript
interface CacheProvider {
  get<T>(key: string[]): Promise<T | null>;
  set<T>(key: string[], value: T, options?: { ttlMs?: number }): Promise<void>;
  delete(key: string[]): Promise<void>;
  deleteByPrefix(prefix: string[]): Promise<void>;
}
```

Two implementations:

- **`InMemoryCacheProvider`** — default (and test), uses an in-process Map with TTL support.
  Cache does not survive restarts.

The active provider is chosen at startup based on `CACHE_DRIVER` env variable (default
`memory`) and injected into Hono context. The interface keeps a Redis/Valkey-backed provider
a localized follow-up that touches no consumers.

## Validation

Zod schemas live in `@brewform/shared/schemas` and are shared between frontend and backend:

- **Hard validation** — blocks save. Applied in API controllers via `c.req.json()` → schema
  `.parse()`
- **Soft validation** — warns but allows save. Applied in service layer, returns warnings alongside
  data

Example: recipe creation uses `RecipeCreateSchema` (hard validation with `.refine()`) while warnings
like "extraction time seems short for espresso" are computed separately.

## Portability Rules (§6.2)

BrewForm maintains database portability:

- **No raw SQL** — all queries via Drizzle ORM
- **No JSONB/UUID columns** — all structured data is relational, all IDs are
  `$defaultFn(() => crypto.randomUUID())` strings
- **No Postgres-specific query operators** — no `mode: 'insensitive'`, etc.
- **All filterable fields reference normalized entities or enums**
- **Services import from model files**, never from `drizzle-orm` directly
- **Postgres-specific features** are isolated with `// POSTGRES-SPECIFIC` comments if unavoidable
- **All schema changes** (tables, columns, indexes, enums, constraints) are made in
  `packages/db/src/schema.ts` (the Drizzle TypeScript schema) first. Run
  `make db-generate && make db-migrate` to auto-generate and apply the migration.
  **Never edit the generated SQL migration files manually** — manual edits break Drizzle's
  hash-based migration tracking and cause silent failures.

## Database

### Schema Overview

28 tables and 12 enums in a single Drizzle schema:

- **Core**: User, UserPreferences, Recipe, RecipeVersion
- **Recipe parts**: RecipeTasteNote, RecipeEquipment, RecipeAdditionalPreparation
- **Social**: Comment, UserFollow, UserRecipeLike, UserRecipeFavourite, UserRecipeRating
- **Assets**: Photo, RecipeVersionPhoto, Bean, Vendor, Equipment, CoffeeVariety
- **Configuration**: Setup, TasteNote, BrewMethodEquipmentRule
- **Gamification**: Badge, UserBadge
- **Moderation**: Report, AuditLog, PasswordReset, EquipmentDeleteRequest, EmailVerificationToken

### Soft Deletes

All main entities have a `deletedAt timestamp with time zone` field. Queries use
`findFirst({ where: eq(table.deletedAt, null) })` instead of `findUnique` for soft-delete filtering,
since `deletedAt` is not a unique constraint.

### Comment Moderation (`isAdmin` Flag)

`Comment_Service.createComment` and `Comment_Service.deleteComment` both accept an `isAdmin: boolean` parameter that grants elevated permissions:

- **Replies** — when `isAdmin` is `true`, the service allows the caller to reply to any comment on any recipe, bypassing the normal recipe-owner check. When `isAdmin` is `false`, only the recipe owner may reply.
- **Deletions** — when `isAdmin` is `true`, the service allows the caller to delete any comment regardless of authorship, bypassing the normal author check. When `isAdmin` is `false`, only the comment's own author may delete it.

The `isAdmin` flag is derived from the authenticated user object (`c.get('user').isAdmin`) set by `authMiddleware` and forwarded by the comment router — no separate `adminMiddleware` is applied to comment routes.

Default (non-admin) behaviour: only the recipe owner may reply to a comment; only the comment's author may delete it.

### Connection Pooling

Configured via `DATABASE_URL` and `postgres-js` options:

```
DATABASE_URL=postgresql://user:pass@host:5432/brewform
```

Connection pooling is handled by the `postgres-js` driver (`max: 10` in `packages/db/src/index.ts`).

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

## OpenAPI

The API exposes an auto-generated OpenAPI 3.x specification derived from `describeRoute(...)`
metadata that now covers **all mounted route groups** (`auth`, `recipe`, `admin`, `health`, `beans`,
`badges`, `coffee-varieties`, `comments`, `contact`, `equipment`, `follow`, `photos`, `preferences`,
`qrcode`, `reports`, `setups`, `taste-notes`, `users`, `vendors`, `share`, `sitemap`). Two endpoints,
both gated by the `OPENAPI_ENABLED` env flag:

- `GET /api/v1/openapi.json` — machine-readable spec for client generation or Postman import
- `GET /api/v1/docs` — a Scalar-based HTML viewer (loaded from a CDN)

The spec is built at request time via `hono-openapi`'s `openAPIRouteHandler`, so any new route gets
picked up automatically. See `decisions.md` ADR-012 for why we kept `zValidator` instead of swapping
to `hono-openapi`'s validator.

### Adding a new route (required)

Every new route — or any change to a route's request/response shape — MUST carry OpenAPI metadata.
A route without `describeRoute()` is considered incomplete (the coverage test will fail).

1. Prepend `describeRoute({ tags, summary, description, security, parameters, requestBody, responses })`
   from `hono-openapi`. Keep `zValidator(...)` as the validator (ADR-012); never import
   `hono-openapi`'s `validator`. Metadata must not change runtime behavior.
2. Document responses with `resolver(successEnvelope(XOutputSchema))` /
   `resolver(paginatedEnvelope(XOutputSchema))` and `resolver(ErrorEnvelopeSchema)` for each error
   (always `401` on auth-guarded routes; `404`/`403`/`400`/`409` where mapped).
3. Document JSON request bodies with `jsonRequestBody(InputSchema)`
   (`apps/api/src/utils/openapi/index.ts`) — `resolver()` only converts responses in hono-openapi
   v1.3.0. Never `import 'zod-openapi/extend'` (the subpath does not exist in `zod-openapi` v6; it breaks the build).
4. Add the entity Output Schema under `packages/shared/src/schemas/responses/` (derived from the real
   `service.ts` return shape, additive, with a co-located unit test) and register any new tag in the
   `tags` array of `routes/openapi.ts`. Non-JSON routes document their true content type, not a JSON envelope.
5. Run `make test-api` — `routes/openapi.coverage.test.ts` enforces coverage, tagging, and zero orphan tags.

## Notifications

Social-event email delivery (follow / like / comment / new public recipe by followee) lives in
`apps/api/src/utils/notify/`. Each helper:

1. Loads the recipient and their `UserPreferences`.
2. Returns silently if the relevant flag is off or `APP_ENV === 'test'`.
3. Renders an MJML template and sends via SMTP.

Calls are fire-and-forget so SMTP failures never block social actions. See
[`notifications.md`](notifications.md) for trigger points, templates, and how to add a new category.

## Background Jobs

Hourly badge evaluation runs as a `node-cron` schedule:

```typescript
// apps/api/src/utils/jobs/cron.ts — registered by importing main.ts.
// No start/stop API; the schedule lives as long as the process.
cron.schedule('0 * * * *', evaluateAllBadges, { name: 'evaluate-badges' });
```

The handler is wrapped in a try/catch so a failing run never tears down the
scheduler. Shutdown does not cancel the schedule — `process.exit(0)` ends it
with the process.

## Graceful Shutdown

The server handles SIGTERM and SIGINT by:

1. Shutting down the HTTP server
2. Closing postgres-js client (`client.end()`)
3. Closing the email transporter
4. Calling `process.exit(0)`

## Testing

Tests use Vitest with BDD-style syntax:

```typescript
import { describe, expect, it } from 'vitest';
```

Commands:

- `make test` — full test suite
- `make test-api` — API tests only
- `make test-shared` — shared package tests only
- `make test-specific filter=path/to/test.ts` — single test file

Tests run without type-checking (type checking done separately via `pnpm run check`).
All barrel file imports use explicit `.ts` extensions.

## Code Style & Formatting

BrewForm uses Biome as the single source of truth for code formatting and linting. The config
lives in `biome.json`: `lineWidth: 100`, `indentWidth: 2`, single quotes, semicolons always.

### Mandatory `make fmt` before commit

**Run `make fmt` after every batch of edits, before committing or pushing.** Symbolic edits and
regex replacements (whether from an agent, an IDE, or a manual refactor) preserve logic but may not
match Biome's exact whitespace rules — trailing commas, line wrapping, indentation, and semicolon
insertion are all normalised by `biome check --write` in ways that are easy to miss by eye.

CI enforces `pnpm run fmt-check` in both the `ci.yml` quality job and the `pr.yml` check job, and
**fails the build on any formatting diff**. The pre-commit hook (`.githooks/pre-commit`, enabled via
`make setup-hooks`) also runs `pnpm run fmt-check` locally, but do not rely on the hook alone — run
`make fmt` proactively after each batch of edits, not just at commit time.

### Commands

| Command | Purpose |
|---------|---------|
| `make fmt` | Apply `biome check --write` to all files (in-place) |
| `make fmt-check` | Check formatting without changes (CI uses this) |
| `make lint` | Run `biome check` across all workspaces |
| `make check` | Type-check all workspaces (`tsc --noEmit`) |
| `make ci` | Full pipeline: `fmt-check` → `lint` → `check` → `build` → `test` |

### Lint exclusions

The following rules are excluded repo-wide (configured in `biome.json`): see
`openspec/specs/lint-style/spec.md`. Module files that need `any` for Drizzle row types or test
fixtures use a single line-level directive:
`// biome-ignore lint/suspicious/noExplicitAny: <reason>` on the preceding line.

### Import conventions

- All imports use explicit file extensions (`.ts`, `.tsx`) — no sloppy imports.
- Shared dependency versions are pinned in the `pnpm-workspace.yaml` `catalog` and each
  workspace's `package.json`.
