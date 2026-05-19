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