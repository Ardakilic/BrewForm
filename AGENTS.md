## Implementation workflow
- Use Serena MCP (`serena_*`) tools for code understanding, navigation, and editing.
  - Tool prefix: opencode namespaces Serena tools by the MCP server name `"serena"` — the raw server logs show bare names but the agent uses `serena_*`.
  - Activate with `serena_activate_project` using the project **name** `brewform` (from `.serena/project.yml`), NOT the full path `/Users/arda/projects/BrewForm`.
- Before editing, use `get_symbols_overview` or `find_symbol` to understand the relevant code structure.
- Use `search_for_pattern` for cross-file searches and `replace_content` for regex-based edits.
- **Always use Context7 MCP for library, code, language, and framework documentation.**
- Delegate separate jobs (research, file edits, etc.) to sub-agents so the main loop context is used more efficiently.

## Development commands

Everything runs through Docker. No local Deno installation required. Use `make <target>`:

- `make up` — start infrastructure only (postgres, mailpit, pgadmin, garage); does NOT start app
- `make install` — cache deno dependencies (required once)
- `make email-build` — compile MJML → HTML templates (required before API runs)
- `make db-generate && make db-migrate && make db-seed` — full DB setup
- `make dev` — start API (:8000) + Vite HMR (:5173)
- `make check` — type-check all workspaces
- `make lint` — lint all apps and packages
- `make test` — run all tests (via Docker, with `--allow-all`)

Granular targets: `make check-api`, `make check-web`, `make test-api`, `make test-shared`, `make test-specific filter=path/to/test.ts`.

Run a single test file: `deno test --no-check --allow-all apps/api/src/path/to/file_test.ts` (inside Docker: `make test-specific filter=path/to/test.ts`).

Type-check + lint after every edit. Test command order matters: `deno task check` then `deno task test`.

## Architecture

Monorepo with 4 Deno workspace members:
```
apps/web  ───→ @brewform/shared
                    ↑
apps/api  ─┬──→ @brewform/shared
           └──→ @brewform/db  ──→ @brewform/shared
```

- **Frontend NEVER imports from `@brewform/db`** — only `@brewform/shared`.
- Client runs in Docker; Vite resolves `@brewform/shared/*` via explicit aliases in `apps/web/vite.config.ts`.
- Vite proxies `/api/*` to `http://app:8000` in Docker (host networking auto-detected).

## API module pattern

Every domain module follows 3-layer pattern: `model.ts` → `service.ts` → `index.ts`.

- **Services import from model files, never from `drizzle-orm` directly.**
- Controllers validate with shared Zod schemas from `@brewform/shared/schemas`.
- All Hono routes use typed `<AppEnv>` context (userId, user, cache, requestId).
- Middleware stack order: cors → requestId → rateLimit(100/min) → cache injection → error handler → routes.

## OpenAPI documentation

Every new route (or change to a route's request/response shape) MUST include OpenAPI
metadata so the generated spec at `/api/v1/openapi.json` and the Scalar UI at `/api/v1/docs`
stay complete. This is mandatory, like logging — a route without `describeRoute()` is incomplete.

- Prepend `describeRoute({ ... })` (from `hono-openapi`) to every route with: `tags`, `summary`,
  `description`, `security: [{ bearerAuth: [] }]` on auth-guarded routes, path/query `parameters`,
  a `requestBody`, and typed `responses`.
- **Keep `@hono/zod-validator`'s `zValidator(...)` as the request validator (ADR-012).** Never
  import `hono-openapi`'s `validator`. OpenAPI metadata is additive and must not change runtime
  behavior, status codes, or response bodies.
- **Responses:** wrap the entity's Output Schema in an envelope and pass it through `resolver()`:
  `resolver(successEnvelope(XOutputSchema))`, `resolver(paginatedEnvelope(XOutputSchema))`, and
  `resolver(ErrorEnvelopeSchema)` for every documented error (always `401` on auth-guarded routes,
  plus `404`/`403`/`400`/`409` where the handler maps them).
- **Request bodies:** use `jsonRequestBody(InputSchema)` from `apps/api/src/utils/openapi/index.ts`
  (it runs Zod v4 `z.toJSONSchema` on the SAME schema `zValidator` uses). Do NOT use `resolver()`
  for request bodies — in `hono-openapi` v1.3.0 `resolver()` only converts response schemas.
- **Do NOT** `import 'zod-openapi/extend'` — that subpath does not exist in `zod-openapi` v6 and
  breaks the build; `resolver()` reads metadata natively from Zod v4 schemas.
- **Response/entity schemas** live in `packages/shared/src/schemas/responses/` (`<Entity>OutputSchema`),
  the envelope helpers in `packages/shared/src/schemas/response.ts`. Derive output schemas from the
  ACTUAL `service.ts` return shape (joined objects, computed/count fields, flags), add each as an
  additive export with a co-located unit test, and register any new tag in the `tags` array in
  `apps/api/src/routes/openapi.ts`.
- Non-JSON routes document their true content type (e.g. `text/html`, `application/xml`, `image/*`)
  and are NOT wrapped in a JSON success envelope.
- The introspection coverage test `apps/api/src/routes/openapi.coverage.test.ts` enforces that every
  in-scope route is documented, tagged, and free of orphan tags — run `make test-api` after adding routes.

## Database rules

- **No raw SQL** — Drizzle ORM only. No JSONB/UUID columns. No Postgres-specific operators in application query code (schema-level Postgres features like index ordering and CHECK constraints are permitted).
- **Soft deletes** on all main entities (`deletedAt`). Queries use `findFirst({ where: eq(t.deletedAt, null) })`, never `findUnique`.
- Connection pool: `max: 10` via `postgres-js` driver in `packages/db/src/index.ts`.
- Migrations: `deno task db:generate` (creates SQL) then `deno task db:migrate` (applies); seed is `deno run -A packages/db/src/seed.ts`.
- **Schema changes:** All schema changes (tables, columns, indexes, enums, constraints) MUST be made in `packages/db/src/schema.ts` (the Drizzle TypeScript schema). Then run `make db-generate && make db-migrate` to auto-generate and apply the migration. **Never manually edit the generated SQL migration files** — Drizzle's hash-based migration tracking depends on them being unmodified, and manual edits cause silent migration failures. The only exception is `make db-push` for lightweight rename/enum-addition syncs (but it does NOT detect new CHECK constraints or indexes).
- **Seed idempotency:** `packages/db/src/seed.ts` must be safe to run repeatedly. All seed helpers that insert into tables with unique constraints MUST use `onConflictDoNothing({ target: [...] })` keyed on those constraints, or select-and-reuse existing rows for tables without usable unique keys. This lets `make db-seed` recover when containers are recreated but the Postgres named volume still holds previous seed data. The seed script entrypoint MUST be guarded with `if (import.meta.main)` so the file can be imported by tests without executing the full seed.
- **Full DB reset:** `make db-reset` drops and recreates the database, pushes the schema fresh, re-seeds, and flushes the Deno KV cache.

## Testing

- Framework: `jsr:@std/testing/bdd` (`describe`/`it`) + `jsr:@std/expect`.
- Tests run with `--no-check` (type-checking done separately).
- Tests need `DATABASE_URL` and `JWT_SECRET` set; `CACHE_DRIVER=memory` and `APP_ENV=test` skip KV and email.
- Email notifications are suppressed when `APP_ENV === 'test'`.

## Code style

- Formatting: `deno fmt` (lineWidth 100, indentWidth 2, singleQuote, semiColons).
- Lint exclusions: `no-explicit-any`, `require-await`, `no-empty`, `no-import-prefix`, `no-unversioned-import`.
- Module files use `// deno-lint-ignore-file no-explicit-any require-await`.
- All imports use explicit file extensions (`.ts`, `.tsx`, etc.) — no sloppy imports.
- Cache: never call `Deno.openKv()` directly — use `CacheProvider` interface via DI.

## Logging

Every new feature or change that introduces a codepath must include structured logging.

### Logger setup

- **Shared interface**: `@brewform/shared/logger` defines `Logger`, `ChildLogger`, `CreateLogger`.
- **API**: `import { createLogger } from './utils/logger/index.ts'` — pino-based, JSON structured.
- **Web**: `import { createLogger } from '@/utils/logger.ts'` — console-based, level-filtered via `VITE_LOG_LEVEL`.

### Usage

```ts
// API services
const log = createLogger('module-name');
log.debug({ userId, recipeId }, 'functionName started');
log.debug({ userId }, 'functionName completed');
log.error({ err, userId }, 'functionName failed');

// Web pages
const log = createLogger('PageName');
useEffect(() => {
  log.debug({}, 'PageName mounted');
  return () => { log.debug({}, 'PageName unmounted'); };
}, []);
```

### Log levels

| Level | When to use |
|-------|-------------|
| `trace` | Very detailed debugging (only in development) |
| `debug` | Function entry/exit, state transitions |
| `info` | Significant events (startup, connections, cache hits) |
| `warn` | Recoverable issues (rate limit hits, retries) |
| `error` | Operation failures (DB errors, validation failures) |
| `fatal` | Unrecoverable errors (server crash) |

### Rules

- **Never log** passwords, tokens, secrets, API keys, or PII (emails, IPs).
- Create a module-scoped logger once at the top of the file.
- Use `log.debug({ relevantIds }, 'message')` — include traceable IDs, exclude payloads.
- Error logs must include the `err` object: `log.error({ err, ...context }, 'what failed')`.
- API services: add entry/exit debug logs on every public function.
- Web pages: add mount/unmount debug logs via `useEffect`.
- Web API client errors are already logged — propagate errors properly to the caller.
- See `TODO_logs.md` for modules still needing coverage.

### Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | API pino log level |
| `LOG_FORMAT` | `json` | API format (`json`/`pretty`) |
| `VITE_LOG_LEVEL` | `info` | Web console log level |

## Git Hooks

Run `make setup-hooks` once after cloning to enable pre-commit format and lint checks.
This sets `git config core.hooksPath .githooks` locally — it does not affect other contributors
until they also run the command.

## Other conventions

- Check `/deno.json` `tasks` field for all build/test/lint/dev commands.
- Serena MCP: `make serena-up` to start (SSE on :10122, dashboard :34283).
- OpenAPI docs: `GET /api/v1/docs` (Scalar UI), `GET /api/v1/openapi.json`; gated by `OPENAPI_ENABLED` env.
