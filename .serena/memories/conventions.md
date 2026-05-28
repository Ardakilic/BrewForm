## API Module Pattern (3-layer)

Every domain module: `model.ts` → `service.ts` → `index.ts`

- **model.ts** — Drizzle query builder, raw data access, typed selects/inserts
- **service.ts** — Business logic, validation, authorization, orchestration. **Never imports from drizzle-orm directly** — imports from model files.
- **index.ts** — Controller: Hono routes, Zod validation, response formatting

## Hono Context

All routes use `<AppEnv>`: `c.get('userId')`, `c.get('user')`, `c.get('cache')`, `c.get('requestId')`.
Middleware stack: cors → requestId → rateLimit(100/min) → cache injection → error handler → routes.

## Cache

Never call `Deno.openKv()` directly. Use `CacheProvider` interface injected via DI:
- `DenoKVCacheProvider` (production)
- `InMemoryCacheProvider` (testing, selected by `CACHE_DRIVER=memory`)

## Lint & Format

- Module files use `// deno-lint-ignore-file no-explicit-any require-await` at top
- All imports use explicit `.ts` extensions
- Format: `deno fmt` with lineWidth:100, indentWidth:2, singleQuote, semiColons

## Database Conventions

- Soft deletes everywhere: `deletedAt timestamp with time zone`, query with `findFirst({ where: eq(t.deletedAt, null) })`
- No raw SQL, no JSONB/UUID, no Postgres-specific operators
- `$defaultFn(() => crypto.randomUUID())` for all IDs
- Connection pool max: 10 (postgres-js driver)

## Testing

- Framework: `describe`/`it` from `jsr:@std/testing/bdd`, `expect` from `jsr:@std/expect`
- Tests run with `--no-check` (type-check is separate)
- Email notifications suppressed when `APP_ENV === 'test'`

## Logging

- Every new feature or changed codepath must include structured logging at appropriate levels
- Shared interface: `import type { Logger } from '@brewform/shared/logger'`
- API implementation: `import { createLogger } from './utils/logger/index.ts'` — pino-based JSON structured
- Web implementation: `import { createLogger } from '@/utils/logger.ts'` — console-based, filtered by VITE_LOG_LEVEL
- Create module-scoped logger at file top: `const log = createLogger('module-name')`
- API services: add `log.debug({ ids }, 'fn started/completed')` on every public function entry/exit. Errors: `log.error({ err, ...context }, 'fn failed')`
- Web pages: add mount/unmount debug logs via `useEffect`
- Log levels: trace (verbose debug), debug (entry/exit), info (significant events), warn (recoverable), error (failures), fatal (unrecoverable)
- Never log secrets, tokens, passwords, API keys, or PII (emails, IPs)
- Error logs must include the `err` object for stack trace correlation
- Env vars: LOG_LEVEL=info, LOG_FORMAT=json (API); VITE_LOG_LEVEL=info (web)
- See TODO_logs.md for modules still needing coverage