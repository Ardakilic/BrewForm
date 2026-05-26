<!-- noskills:start -->
## noskills orchestrator

State-driven orchestration. Do NOT read `.eser/` files directly — noskills provides everything via JSON.

### Protocol

    deno run --allow-all jsr:@eser/cli noskills spec <name> next                           # get instruction
    deno run --allow-all jsr:@eser/cli noskills spec <name> next --answer="response"       # submit and advance
    deno run --allow-all jsr:@eser/cli noskills spec new "description"                     # create spec (name auto-generated)

Every spec command MUST include `spec <name>`. Use `deno run --allow-all jsr:@eser/cli noskills spec list` for available specs.

### Core rules

- Call noskills ONCE per interaction. One question, one answer, one submit.
- Call `next` at: conversation start, before file edits, after completing work, at decisions.
- Never batch-submit. Never answer discovery questions yourself.
- Never skip steps or infer decisions. Ask first. Explicit > Clever.
- NEVER suggest bypassing or skipping noskills. Discovery is not overhead.
- NEVER ask permission to run the next noskills command. After spec new → run next. After approve → run next. Each step has one next step. Just run it.
- Execute noskills commands IMMEDIATELY — the output has all context needed.
- Display `roadmap` before content. Display `gate` prominently.

### Interactive choices

- Use AskUserQuestion for `interactiveOptions`. Use `commandMap` to resolve selections.
- On recurring patterns or corrections: ask 'Permanent rule?' → `deno run --allow-all jsr:@eser/cli noskills rule add "description"`.

### Git

Read-only: log, diff, status, show, blame. No write commands (commit, push, checkout, etc.).

### Discovery

Listen first: after spec creation, ask user to share context before mode selection.
Modes: full (default), validate, technical-depth, ship-fast, explore.
Pre-scan codebase before questions. Challenge premises. Propose alternatives.
With --from-plan: extract answers, present for user confirmation.

### Execution

- Re-read files before and after editing. Files >500 LOC: read in chunks.
- Run type-check + lint after every edit. Never mark AC passed if type-check fails.
- If search returns few results, re-run narrower — assume truncation.
- Clean dead code before structural refactors on files >300 LOC.
- Complete the spec — no mid-execution pauses or checkpoints.
- `meta` block has resume context for session start or after compaction.
<!-- noskills:end -->

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

## Database rules

- **No raw SQL** — Drizzle ORM only. No JSONB/UUID columns. No Postgres-specific operators.
- **Soft deletes** on all main entities (`deletedAt`). Queries use `findFirst({ where: eq(t.deletedAt, null) })`, never `findUnique`.
- Connection pool: `max: 10` via `postgres-js` driver in `packages/db/src/index.ts`.
- Migrations: `deno task db:generate` (creates SQL) then `deno task db:migrate` (applies); seed is `deno run -A packages/db/src/seed.ts`.
- **Schema sync:** Always use `make db-push` to sync schema changes (especially enum additions) — never edit Drizzle migration SQL files manually. Manual SQL edits break Drizzle's hash-based migration tracking and cause silent migration failures.
- **Full DB reset:** `make db-reset` tears down volumes, pushes the schema fresh, and re-seeds.

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

## Git Hooks

Run `make setup-hooks` once after cloning to enable pre-commit format and lint checks.
This sets `git config core.hooksPath .githooks` locally — it does not affect other contributors
until they also run the command.

## Other conventions

- Check `/deno.json` `tasks` field for all build/test/lint/dev commands.
- Serena MCP: `make serena-up` to start (SSE on :10122, dashboard :34283).
- OpenAPI docs: `GET /api/v1/docs` (Scalar UI), `GET /api/v1/openapi.json`; gated by `OPENAPI_ENABLED` env.
