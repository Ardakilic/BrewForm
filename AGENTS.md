## Implementation workflow
- Use ripgrep (`grep -r`/`rg`) and the TypeScript LSP for semantic navigation (symbol search, references, diagnostics).
- **Always use Context7 MCP for library, code, language, and framework documentation.**
- Delegate separate jobs (research, file edits, etc.) to sub-agents so the main loop context is used more efficiently.

## Development commands

Everything runs through Docker. No local Node/pnpm installation required (the optional pre-commit
hook is the exception, see "Git Hooks"). Use `make <target>`; `make help` lists every target:

- `make up` — start the infrastructure services only: `postgres`, `mailpit`, `pgadmin`, `garage`.
  It does NOT start the app. `compose.yml` also defines `valkey` (Valkey 9.1), which `make up`
  does not start: run `docker compose up -d valkey` to try the redis cache or rate-limit store.
  The app services sit behind Compose profiles: `app` + `web-dev` (profile `dev`, started by
  `make dev`) and `app-preview` + `web` (profile `preview`, started by `make preview`).
- `make install` — install pnpm workspace dependencies (required once)
- `make email-build` — compile MJML → HTML templates (required before API runs)
- `make db-generate && make db-migrate && make db-seed` — full DB setup
- `make dev` — start API (:8000) + Vite HMR (:5173)
- `make check` — type-check all workspaces
- `make lint` — lint all apps and packages
- `make test` — run all tests (api, shared, db and web workspaces; Vitest)
- `make test-db-provision` — create + migrate + seed the `brewform_test` DB (idempotent; required
  once before DB-backed tests run, safe to re-run; mirrors the `test` job of
  `.github/workflows/ci.yml`)
- `make docs-check` — doc-drift check and docblock scan (see "Docs & specs")

Granular targets: `make check-api`, `make check-web` (web type-check, `tsc`), `make check-tests`
(type-check the api and shared workspaces, test files included), `make test-api`,
`make test-shared`, `make test-web`, `make test-coverage`,
`make test-specific filter=path/to/test.ts`.

Run a single test file:
- api, db or shared: `make test-specific filter=src/path/to/file.test.ts` (the filter is a
  substring, run through the api, db and shared workspaces only, never web), or
  `pnpm --filter @brewform/api exec vitest run src/path/to/file.test.ts` inside the `app` container;
- web: `docker compose run --rm --no-deps app pnpm --filter @brewform/web exec vitest run <path>`.

Type-check + lint + **format** after every edit. Run `make check` before the tests, and check each
suite's exit code separately: never `make test | tail` — the pipe returns `tail`'s exit code and
hides failures. Biome exits 0 when it only reports warnings, so read its output. After finishing a
batch of edits, run `make fmt` to apply `biome check --write` (lineWidth 100, indentWidth 2, single
quotes, semicolons) — the agent's symbolic edits preserve logic but may not match Biome's exact
whitespace rules, so a final `make fmt` is mandatory before commit/PR. CI enforces
`pnpm run fmt-check` and will fail the build on unformatted code.

## Architecture

Monorepo with 4 pnpm workspace members (`apps/*`, `packages/*` in `pnpm-workspace.yaml`):
```
apps/web  ───→ @brewform/shared
                    ↑
apps/api  ─┬──→ @brewform/shared
           └──→ @brewform/db  ──→ @brewform/shared
```

- **Frontend NEVER imports from `@brewform/db`** — only `@brewform/shared`.
- Client runs in Docker; Vite resolves `@brewform/shared/*` via explicit aliases in `apps/web/vite.config.ts`.
- The Vite dev server proxies `/api/*` to `VITE_API_PROXY_TARGET` (`apps/web/vite.config.ts`;
  the compose `web-dev` service sets `http://app:8000`, the default is `http://localhost:8000`).

## API module pattern

Every domain module follows 3-layer pattern: `model.ts` → `service.ts` → `index.ts`.

- **Services import from model files, never from `drizzle-orm` directly.**
- Controllers validate with shared Zod schemas from `@brewform/shared/schemas`.
- Services throw the typed errors from `apps/api/src/utils/errors.ts` (`NotFoundError`,
  `ForbiddenError`, `ConflictError`, `ValidationError`); `middleware/errorHandler.ts` maps them,
  and Postgres SQLSTATEs (`23505` → 409 `CONFLICT`, `57014` → 503 `QUERY_TIMEOUT`, …), to the
  error envelope.
- All Hono routes use typed `<AppEnv>` context (userId, user, cache, requestId).
- Middleware stack order (`apps/api/src/main.ts`): cors → requestId → secureHeaders → rateLimit
  (the `global` policy, keyed by client IP; skips `/health`, `/ready` and `GET /uploads/*`) →
  bodyLimit (1 MB on every route except `/api/v1/photos`, which gets the photo cap
  `PHOTO_BODY_MAX_BYTES`; both answer 413 `PAYLOAD_TOO_LARGE`) → cache injection → crawler →
  onError (via `app.onError`, not stack middleware) → optional `/uploads/:path{.+}` static handler
  (local storage driver only, its own `uploads` policy) → routes.
- **Rate limiting:** routes mount named policies from `apps/api/src/utils/rate-limit/policies.ts`
  with `rateLimit(POLICIES.<name>)` or `rateLimitFailures(...)`: IP-keyed policies before body
  validation and auth, email-keyed ones after `zValidator`, user-keyed ones after `authMiddleware`.
  The client IP comes only from `getClientIp(c)` (`apps/api/src/utils/client-ip/index.ts`,
  driven by the `TRUST_PROXY` trust boundary), never from a raw `X-Forwarded-For`, `X-Real-IP` or
  `CF-Connecting-IP` header. Counters live in their own store (`RATE_LIMIT_STORE=memory|redis`,
  a dedicated Redis connection when `redis`), independent of the cache; only
  `RATE_LIMIT_ENABLED=false` turns limiting off.
- **Cache:** never construct a cache backend in a module. The `CacheProvider` is chosen once at
  startup from `CACHE_ENABLED`, `CACHE_DRIVER` and `REDIS_URL` (`createCacheProvider()`, installed
  with `setCacheProvider()` in `main.ts`): bounded `InMemoryCacheProvider` (`memory`, the default),
  `RedisCacheProvider` behind the fail-soft wrapper (`redis`), or `NullCacheProvider`
  (`CACHE_ENABLED=false`). Routes read it from `c.get('cache')`; services receive a
  `CacheProvider` argument or use the `cacheProvider` singleton from
  `apps/api/src/utils/cache/singleton.ts`. A cache failure is a miss, never an HTTP error, so
  correctness must never depend on the cache.
- **Accepted deviation:** the `contact` module is a controller-only email endpoint with no
  DB access; it intentionally skips the `model.ts`/`service.ts` split.

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
  for request bodies: every route documents its body through `jsonRequestBody`, which the
  repository adopted when `resolver()` converted only response schemas. Re-check the installed
  hono-openapi 1.x documentation (via Context7) before changing this convention.
- **Do NOT** `import 'zod-openapi/extend'` — that subpath does not exist in `zod-openapi` v6 and
  breaks the build; `resolver()` reads metadata natively from Zod v4 schemas.
- **Response/entity schemas** live in `packages/shared/src/schemas/responses/` (`<Entity>OutputSchema`),
  the envelope helpers in `packages/shared/src/schemas/response.ts`. Derive output schemas from the
  ACTUAL `service.ts` return shape (joined objects, computed/count fields, flags), add each as an
  additive export with a co-located unit test, and register any new tag in the `tags` array in
  `apps/api/src/routes/openapi.ts`.
- Non-JSON routes document their true content type (e.g. `text/html`, `application/xml`, `image/*`)
  and are NOT wrapped in a JSON success envelope.
- The introspection coverage test `apps/api/src/routes/openapi.coverage.test.ts` builds the real
  router and enforces, for the 20 base paths in its `IN_SCOPE_BASE_PATHS` list, that every route is
  documented and tagged and that auth-guarded operations document `401`, plus no orphan tags.
  `/api/v1/auth`, `/api/v1/recipes` (including the notes routes), `/api/v1/admin` and the health
  probes are excluded until they are covered: the test only requires at least one tagged operation
  for each. Document the routes you add there anyway, and run `make test-api` after adding routes.
- Regenerate `docs/api-reference.md` with `pnpm --filter @brewform/api run docs:api` (in Docker:
  `docker compose run --rm --no-deps app pnpm --filter @brewform/api run docs:api`) after any
  route or schema change, and commit it. It is generated from the OpenAPI document; never edit it
  by hand. `docs/api.md` holds only the cross-cutting API conventions.

## Database rules

- **No raw SQL statements** — Drizzle ORM only. No JSONB/UUID columns. Query code in `model.ts` uses
  Drizzle builders. `ilike` is the accepted case-insensitive match operator. A `sql` template
  **fragment** is allowed only where Drizzle has no builder (e.g. `CASE` expressions, row-value
  comparisons, `NULLS LAST`) and only for a use listed in the accepted-exception registry of the
  `lint-style` spec (`openspec/specs/lint-style/spec.md`, "Raw SQL is confined to an
  accepted-exception registry"). It must interpolate Drizzle columns and bound values, never
  concatenate user input, and must carry a `// D03 raw-SQL exception: <why>` comment. No other
  Postgres-specific operators (`@@`, `%`, `~*`, JSON operators) in application query code.
  Schema-level Postgres features are permitted: index ordering, CHECK constraints, GIN indexes with
  operator classes, and extensions approved by an ADR in `docs/decisions.md` (currently `pg_trgm`,
  ADR-017 "Database-side search ranking"). An extension is enabled only through a
  `drizzle-kit generate --custom` migration containing `CREATE EXTENSION IF NOT EXISTS <name>;`.
- **Bounded reads** — every list or search query in `model.ts` applies `limit` (at most the schema's
  `perPage` maximum). Ordering, ranking and pagination happen in SQL, never by loading a full result
  set into the API process.
- **Soft deletes** on all main entities (`deletedAt`). Filter with `isNull(t.deletedAt)`, e.g.
  `and(eq(t.id, id), isNull(t.deletedAt))`.
- **Recipe visibility:** recipe listings build their visibility filter only from
  `listableRecipeCondition`/`viewableRecipeCondition` in `apps/api/src/modules/recipe/model.ts`
  (discovery surfaces pass `null`); services use `canViewRecipe`/`canListRecipe`; never compare
  `recipes.visibility` inline (enforced by `visibility.enforcement.test.ts`; admin is exempt).
  Unlisted means direct-link only.
- **Case-insensitive identifiers:** compare `user.email`/`user.username` with
  `eq(lower(col), value.toLowerCase())` using the `lower()` helper from `@brewform/db/schema`
  (served by the `_lower_unique` indexes). Claim unique generated values (recipe slugs) with
  `insert … onConflictDoNothing({ target }).returning()` inside the transaction; never catch
  `23505` inside a transaction and keep using it (Postgres aborts the transaction). A soft-deleted
  join row with a composite unique key is revived with `onConflictDoUpdate` that clears
  `deleted_at`.
- Connection pool: `max: 10` via the `postgres-js` driver in `packages/db/src/index.ts` (options in
  `packages/db/src/pool-options.ts`), with a server-side statement timeout per connection
  (`DB_STATEMENT_TIMEOUT_MS`, default 10000 ms, `0` disables); a cancelled statement answers
  503 `QUERY_TIMEOUT`.
- Migrations: `pnpm run db:generate` (creates SQL) then `pnpm run db:migrate` (applies); seed is `pnpm run db:seed`.
- **Schema changes:** All schema changes (tables, columns, indexes, enums, constraints) MUST be made in `packages/db/src/schema.ts` (the Drizzle TypeScript schema). Then run `make db-generate && make db-migrate` to auto-generate and apply the migration. **Never manually edit the generated SQL migration files** — Drizzle's hash-based migration tracking depends on them being unmodified, and manual edits cause silent migration failures. `make db-push` (drizzle-kit push) is for prototyping only — use `db-generate` + `db-migrate` for schema changes: push writes no migration and does NOT detect new CHECK constraints or indexes.
- **`drizzle-kit generate --custom` workaround (TTY-less environments):** Drizzle Kit 0.31's interactive `generate` prompts for column renames require a TTY — non-interactive shells (CI, piped stdin, agents without a PTY) error out with "Interactive prompts require a TTY terminal". The non-interactive pivot is `drizzle-kit generate --custom --name=<tag>` which creates an empty SQL migration shell + a snapshot that is an EXACT COPY of the previous snapshot (NOT regenerated from the current schema). After writing the SQL by hand (per the design's reference template), you MUST also **manually update `meta/<NNNN>_snapshot.json`** to reflect EVERY schema change introduced by the migration — including but not limited to: renamed columns (both the JSON object key AND the `name` value inside), new enum values (under the `enums` section — Drizzle's snapshot stores them as a `values` array), new/dropped columns, new indexes, new constraints. After editing, **run `make db-generate` again and assert it outputs "No schema changes, nothing to migrate 😴"** — if it produces a new migration file, your snapshot is missing a change the schema declares; diff the new migration to find the gap, fold it into the snapshot, delete the stray migration + its snapshot + journal entry, and re-run until clean. CI's `quality` job runs `pnpm run db:generate` followed by `git diff --exit-code` as a freshness check; a snapshot that doesn't match the schema fails the build. The hand-written SQL in the `.sql` file is NOT cross-checked against the snapshot — both must be authored to agree.
- **Seed idempotency:** `packages/db/src/seed.ts` must be safe to run repeatedly. All seed helpers that insert into tables with unique constraints MUST use `onConflictDoNothing({ target: [...] })` keyed on those constraints, or select-and-reuse existing rows for tables without usable unique keys. This lets `make db-seed` recover when containers are recreated but the Postgres named volume still holds previous seed data. The seed script entrypoint MUST be guarded with `if (import.meta.main)` so the file can be imported by tests without executing the full seed.
- **Full DB reset:** `make db-reset` drops and recreates the dev database, creates the `pg_trgm`
  extension (drizzle-kit push does not manage extensions), pushes the schema fresh with
  `make db-push`, re-seeds, and flushes the API cache. A database built this way has no migration
  history, so `make db-migrate` against it fails with "type already exists"; that is expected.

## Web data loading

React Router data APIs are the only web data-loading paradigm (ADR-018): loaders for route reads,
actions for mutations, fetchers against resource routes for component-level reads and writes. No
TanStack Query, SWR or custom query hooks.

- **Route reads:** every route that renders server data gets it from its `loader`, in a co-located
  `<Page>.data.ts` module or under `apps/web/src/routes/`. A loader reads params and search params
  only from its `params`/`request` arguments, passes `request.signal` to every API client call,
  wraps its body in `withDataLog`, and throws a 404 `Response` for a missing resource. Lazy routes
  use the object form `lazy: { loader, action, Component }`. Components read
  `useLoaderData<typeof loader>()` (a type-only import of the data module, no `as` casts) and
  derive pending UI from `useNavigation()`. Page and component `.tsx` modules never export a
  `loader` or an `action`.
- **Mutations:** route or resource-route `action`s, submitted with `<Form>`, `useSubmit()` or
  `useFetcher().submit()`. An action returns `{ ok: true, ... }` on success and `{ ok: false, error }`
  for expected failures (validation, 4xx, network) instead of throwing; the component branches on
  `ok`, rolls back optimistic UI and shows the failure with `useToast()`. Scope revalidation with
  `shouldRevalidate` or `defaultShouldRevalidate: false` so an action re-runs only the loaders whose
  data it changed (likes, favourites, follows and comment actions never re-run the recipe detail
  loader).
- **Component-level reads** (typeaheads, the unread badge, the add-to-collection list, brew stats,
  the private recipe note, the QR download) use `useFetcher().load()` against resource routes under
  the `resources/` path (`apps/web/src/routes/resources/`); a new `load()` cancels the previous one.
- **Auth:** guarded loaders and actions are wrapped in `requireAuth`/`requireAdmin`
  (`apps/web/src/routes/auth-guards.ts`), which redirect a 401 to
  `/login?next=<encoded path+search>` (and an admin 403 to `/`).
- **`useEffect` allowlist:** non-fetch side effects only — subscribing to browser events
  (`storage`, `focus`, media queries), DOM focus management, timers, mount/unmount debug logs,
  document-head sync (`SEOHead`), and triggering `fetcher.load()` / `revalidator.revalidate()` in
  response to an external event. An effect never calls the API client or `fetch(` and never stores
  network results in state. The single exception is the session store
  `apps/web/src/contexts/AuthContext.tsx` (above the router; it bootstraps the session with
  `userApi.me()`).
- **Boundary:** pages and components never value-import `api/client.ts`, `api/index.ts` or
  `api/static-cache.ts`; types come from `api/types.ts` and `ApiError` from `api/errors.ts`.
  `hooks/useStaticCacheSync.ts` may import only `CACHE_BUST_KEY` and `clearStaticCache`. Enforced
  by the Biome `style/noRestrictedImports` override (`error`),
  `apps/web/src/data-loading.enforcement.test.ts` and `apps/web/src/architecture.test.ts`
  (`make test-web`).
- **URL state:** the URL is the source of truth for every list selection (filters, sort, page, tab,
  search query); component state holds only text that is still being typed. List pages use
  `useListUrlState` and `useDebouncedUrlText` (`apps/web/src/hooks/useListUrlState.ts`) with the
  page's shared parser — the same function its loader uses — which normalises invalid values to
  their defaults and never writes a default into the URL. A filter, sort, search or tab change
  removes `page` (back to page 1); a page change keeps every other param. Discrete controls push a
  history entry; text inputs commit after a 300 ms debounce with a `replace` navigation and re-sync
  when the URL changes (Back/Forward, clear-all, a shared link).

## Testing

- Framework: Vitest — import `describe`/`it`/`expect`/`vi` from `vitest` (the web workspace runs
  in jsdom with Testing Library).
- Tests run without type-checking (type-checking done separately via `make check` and
  `make check-tests`).
- Test files use `*.test.ts` (or `*.test.tsx`) naming — never `*_test.ts`.
- API test files that load config (every DB-backed test) import the shared setup first, before any
  other import: `import '../../test-setup.ts';` (path relative to the file). It supplies the
  `DATABASE_URL`/`JWT_SECRET` fallbacks and sets `LOG_LEVEL=silent`.
- Tests need `DATABASE_URL` and `JWT_SECRET` set; `CACHE_DRIVER=memory` and `APP_ENV=test` skip external cache and email.
- DB-backed tests target the dedicated `brewform_test` database (the `make test*` targets inject `DATABASE_URL` for it) — NEVER the dev `brewform` DB, which tests would pollute. Run `make test-db-provision` once after `make up` (it mirrors the provisioning steps of the `test` job in `.github/workflows/ci.yml`), and again after adding a migration.
- DB test files run serially (`fileParallelism: false` in `apps/api/vitest.config.ts` and
  `packages/db/vitest.config.ts`) because they share one database and assert counts; clean up the
  rows you create (reusable fixtures live in the modules' `test-helpers.ts`).
- Logger assertions spy on the module's exported logger with `vi.spyOn(log, '<level>')` (for
  example `vi.spyOn(service.log, 'debug')`), assert with `toHaveBeenCalledWith(...)`, and restore
  spies in `afterEach` (`vi.restoreAllMocks()`).
- Email notifications are suppressed when `APP_ENV === 'test'`.

## Code style

- Formatting: Biome (`biome check`, config in `biome.json`: lineWidth 100, indentWidth 2, single quotes, semicolons).
- **Run `make fmt` before every commit.** Symbolic edits and regex replacements preserve logic but
  may not match Biome's exact whitespace rules (trailing commas, line wrapping, indentation). CI runs
  `pnpm run fmt-check` and fails the build on any diff. The pre-commit hook (`.githooks/pre-commit`,
  enabled via `make setup-hooks`) also enforces this locally, but do not rely on the hook alone —
  run `make fmt` proactively after each batch of edits, not just at commit time.
- **Lint policy (Biome, `biome.json`):** the `recommended` preset, with
  `suspicious/noExplicitAny`, `suspicious/useAwait` and `suspicious/noEmptyBlockStatements` set to
  `error`. `apps/web/**` lowers a set of a11y rules, `correctness/useExhaustiveDependencies` (hook
  deps), `security/noDangerouslySetInnerHtml` and `suspicious/noArrayIndexKey` to `warn`, and adds
  the `style/noRestrictedImports` API-client boundary at `error` (see "Web data loading").
  Warnings policy: warnings are reported but do not fail `make lint` or CI (no
  `--error-on-warnings`), so any rule that must block is set to `error` explicitly in
  `biome.json`; read the lint output instead of trusting the exit code alone.
- **Suppressions** are line-level `// biome-ignore <category>/<group>/<rule>: <justification>`
  comments (e.g. `// biome-ignore lint/suspicious/noExplicitAny: <why>`) that name exactly one
  rule, cover exactly one statement and carry a real justification after the colon (never Biome's
  `<explanation>` placeholder). No file-level (`biome-ignore-all`) or range
  (`biome-ignore-start`/`biome-ignore-end`) form, in production or test code. Prefer a typed fix
  (`Partial<T>`, `vi.mocked(...)`, `satisfies`, `unknown` plus narrowing). Enforced by
  `packages/shared/src/lint-policy.test.ts` (`make test-shared`).
- **Docblocks:** every exported production symbol under `apps/api/src`, `apps/web/src`,
  `packages/shared/src` and `packages/db/src` has a `/** … */` docblock (ADR-020); a `//` or plain
  `/* */` comment does not count. Enforced by `node scripts/docblock-scan.ts --check` (part of
  `make docs-check`).
- All imports use explicit file extensions (`.ts`, `.tsx`, etc.) — no sloppy imports.
- **Charts:** build every chart, meter and rating display on the `apps/web/src/utils/chart`
  primitives (`sanitizeNumber`, `clamp`, `niceTicks`, `durationTicks`, `estimateTextWidth`,
  `wrapLabel`, the layout helpers) instead of local copies, and compute layout in pure functions
  (no DOM measurement). Never put `<text>` inside an SVG with `preserveAspectRatio="none"`: render
  such labels as HTML over the chart (stretched strokes use `vector-effect="non-scaling-stroke"`).
  Take every colour from the theme tokens in `apps/web/src/styles/globals.css` (no hex literals;
  text ≥ 4.5:1 and marks ≥ 3:1 in the light, dark and coffee themes) and format durations and
  metrics with `apps/web/src/utils/format.ts`. Every chart change adds geometry tests: each label's
  box inside its viewBox and not overlapping a sibling, for en and tr labels and edge inputs.

## i18n

- Every user-visible web string (text, `placeholder`, `aria-label`, `alt`, `title`, toasts, error
  messages) goes through `t()` from `useTranslation()` (`apps/web/src/contexts/I18nContext.tsx`);
  no hard-coded UI literals (`apps/web/src/i18n-literals.test.ts` guards the attributes). `t()`
  takes only a key; fill placeholders with `.replace('{name}', value)`.
- Keys are flat dotted strings (`"nav.recipes"`). Add each new key to BOTH
  `packages/shared/src/i18n/en.json` and `packages/shared/src/i18n/tr.json` in the same change; the
  deterministic parity test `packages/shared/src/i18n/i18n.test.ts` fails when the two key sets
  differ (`make test-shared`).

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
  Pass database errors through `toLoggableError(err)` (`apps/api/src/utils/errors.ts`): Drizzle
  error messages carry the query's bound parameters (emails, password hashes, note text).
- Rate-limit keys never contain raw emails (email keys are the first 32 hex characters of the
  SHA-256 of the normalised address; IP keys are the normalised address, IPv6 as its /64), and
  rate-limit, client-IP and request logs never contain IP addresses, emails, raw header values or
  store keys — only `policy`, `limit`, `userId` and request-scoped ids.
- API services: add entry/exit debug logs on every public function.
- Web pages: add mount/unmount debug logs via `useEffect`. Web loaders and actions wrap their body
  in `withDataLog(log, label, ids, fn)` (`apps/web/src/routes/data-logging.ts`) for the
  started/completed/failed logs.
- Web API client errors are already logged — propagate errors properly to the caller.

### Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | API pino log level |
| `LOG_FORMAT` | `json` | API format (`json`/`pretty`) |
| `VITE_LOG_LEVEL` | `info` | Web console log level |

## Docs & specs

- `make docs-check` (root script `docs:check`) runs two dependency-free Node scripts:
  `node scripts/doc-drift-check.ts` (removed-tooling tokens, stale idioms, broken relative links,
  archived capabilities missing from `openspec/specs`, placeholder Purposes; exemptions with a
  mandatory reason in `scripts/doc-drift-allowlist.json`) and `node scripts/docblock-scan.ts --check`.
  Run it before opening a PR. CI runs the same two scripts in the `doc-drift` job of
  `.github/workflows/ci.yml` (plain Node, no install), and `publish` needs that job.
- Fill in the "Docs & specs" checklist of `.github/pull_request_template.md`: AGENTS.md, README.md,
  the affected `docs/*.md` and `openspec/specs` updated for runtime, infra, config or env changes;
  OpenAPI metadata plus a regenerated `docs/api-reference.md` for route changes; the
  `.env.example` files and deployment guide for new env vars; `openspec validate <change> --strict`;
  `make docs-check`.
- OpenSpec rules:
  - The first line after `### Requirement:` must contain SHALL or MUST (the CLI parses only that
    line as the requirement text).
  - Change a requirement's title with a `## RENAMED Requirements` FROM/TO entry, then key its
    MODIFIED block by the new title.
  - Never ship a delta that REMOVES every requirement of a capability: `openspec archive` then
    aborts the whole change. Instead, `git rm -r openspec/specs/<capability>` just before
    archiving and list the capability under `retiredCapabilities` in
    `scripts/doc-drift-allowlist.json`.
  - After archiving, replace the placeholder Purpose that `openspec archive` writes into each new
    `openspec/specs/<capability>/spec.md` with a real one (the doc-drift check rejects the
    placeholder).
  - Validate with `openspec validate <change> --strict` before archiving.
- Historical documents live in `docs/history/` with a "historical snapshot" banner; they are
  allowlisted and never updated — fix the current doc instead.
- ADRs live in `docs/decisions.md` as `ADR-NNN — <title>` with Decision / Why / Trade-off. Numbers
  are sequential and never reused (wave 6 pre-allocated ADR-015 to ADR-021); a superseded ADR stays
  and is marked "Superseded by ADR-NNN". The next new decision takes ADR-022.

## Git Hooks

Run `make setup-hooks` once after cloning to enable pre-commit format and lint checks.
This sets `git config core.hooksPath .githooks` locally — it does not affect other contributors
until they also run the command.

`.githooks/pre-commit` runs `pnpm run fmt-check` and `pnpm run lint` directly on the host, not in
Docker, so it needs host Node 26 + pnpm and a host `pnpm install`; without them every commit fails.
If you only use Docker, skip the hook and run `make fmt-check` and `make lint` yourself.

## Other conventions

- Discover commands in the root `package.json` `scripts` field (per-workspace scripts in `apps/*/package.json` and `packages/*/package.json`, run via `pnpm --filter <package> run <script>`).
- Semantic navigation uses ripgrep and the TypeScript LSP.
- OpenAPI docs: `GET /api/v1/docs` (Scalar UI), `GET /api/v1/openapi.json`; gated by `OPENAPI_ENABLED` env. The generated route reference is `docs/api-reference.md`.
- **Deployment docs:** `docs/deployment_compose.md` (Docker Compose self-hosting:
  `compose.production.yml`, `.env.production` from `.env.production.example`, the `make prod-*`
  targets) and `docs/deployment_coolify.md` (Coolify v4.1.x, as-built).
- **Images:** published to GHCR (`ghcr.io/ardakilic/brewform-{api,web}`) only by the CI-gated
  `publish` job of `.github/workflows/ci.yml`, which runs on pushes to `main` and `v*` tags after
  every other job passed and pushes the exact images the `images` job smoke-tested. There is no
  `release.yml` and no `make release`; `make images` builds local `brewform-api:local` /
  `brewform-web:local` tags only. The web image is configured at runtime by
  `docker-web-entrypoint.sh`: `VITE_API_URL` (writes `/config.js`), `API_UPSTREAM` (same-origin
  proxy for `/api/*`, `/uploads/*`, `/share/*` and `/health`), `TRUSTED_PROXIES` and
  `PUBLIC_APP_URL`.
- **Cache:** in-memory by default (`CACHE_ENABLED=true`, `CACHE_DRIVER=memory`; no sidecar needed).
  A shared Redis-protocol backend is optional via `CACHE_DRIVER=redis` + `REDIS_URL` (Valkey 9.1 in
  the compose files; `compose.production.yml` defaults to `redis`). `CACHE_ENABLED=false` installs
  `NullCacheProvider`. Rate-limit state is independent of the cache (`RATE_LIMIT_STORE`,
  `RATE_LIMIT_ENABLED`).
- **Client IP:** deployments behind a proxy set `TRUST_PROXY` (`none` default, `hops` with
  `TRUST_PROXY_HOPS`, or `cloudflare` with optional `TRUST_PROXY_CIDRS`);
  `compose.production.yml` defaults to `hops` with one hop behind its web edge. With `none` behind
  a proxy, every client shares one rate-limit bucket.
- **Health:** `GET /health` is liveness and `GET /ready` is readiness (fixed keys, `503` while
  shutting down or when the database does not answer). The API image `HEALTHCHECK` and the compose
  api check run `node /app/healthcheck.mjs /ready`; the web image `HEALTHCHECK` and the compose web
  check run `wget -q -O /dev/null http://127.0.0.1/healthz`. The Coolify API check is the `CMD`
  type with that command and the web check is HTTP `/healthz`. Uptime monitors use `/health`.
- **Compose data locations:** `UPLOADS_SOURCE`, `POSTGRES_DATA_SOURCE`, `BACKUPS_SOURCE` (named
  volumes by default; a host folder when set to a path).
- Coolify nuance: `S3_ENDPOINT` is the account endpoint only (no bucket path).
