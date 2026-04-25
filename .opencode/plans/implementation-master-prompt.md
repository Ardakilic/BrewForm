# BrewForm — Continuation Prompt

Copy the entire contents below the `---` line and paste it as a new chat message to resume implementation from any checkpoint. The implementation state is always tracked in `state.md` — no need to regenerate this prompt.

---

## Project Overview

You are implementing **BrewForm**, a web application for digitalizing, sharing, and discovering coffee brewing recipes and tasting notes.

**This prompt is your primary directive.** Read the documents listed below in order, then begin implementing the next phase indicated by `state.md`.

### Documents to read (in this order):

1. **`/Users/arda/projects/BrewForm/.opencode/plans/state.md`** — READ THIS FIRST. It tells you exactly which phase to implement next, what has been completed, and key decisions made so far.
2. **`/Users/arda/projects/BrewForm/brewform-plan.md`** — The full 1566-line project specification (reference as needed).
3. **`/Users/arda/projects/BrewForm/.opencode/plans/gap-analysis.md`** — Gaps found between the plan and implementation. Apply the relevant fixes for the current phase.
4. **The current phase plan file** — Read the specific phase file from `/Users/arda/projects/BrewForm/.opencode/plans/` (e.g. `phase4-backend-core.md`) before starting each phase. The file names follow the pattern `phase{N}-{name}.md`.

## Critical Operational Rules

1. **ALL commands must run through Docker.** The user does NOT have Deno, Node, or any JS runtime installed locally. Every `deno`, `npm`, `npx`, `deno test`, `deno lint`, `deno fmt`, `deno check` command must go through `docker compose run --rm app <cmd>` or `docker compose exec app <cmd>`. The Makefile wraps all common commands.

2. **Use `docker compose run --rm app`** for standalone commands (lint, fmt, test, check, install, prisma generate). Use `docker compose exec app` for commands that need the running stack (migrations with DB, seeding).

3. **Use Context7 MCP** for library documentation. When you need docs for Hono, Prisma, BaseUI, Zod, React, or any library, use the `context7_resolve-library-id` and `context7_query-docs` tools. Library IDs:
   - Hono: `/llmstxt/hono_dev_llms_txt`
   - Prisma: `/websites/prisma_io`
   - BaseUI: `/websites/base-ui_react`

4. **Do NOT use import maps.** All imports use explicit specifiers. The `deno.json` must NOT contain `"imports"`.

5. **Track implementation state** in `/Users/arda/projects/BrewForm/.opencode/plans/state.md`. Update it after completing each phase. Mark phases as `pending`, `in_progress`, or `completed`.

6. **CSS Framework**: Tailwind CSS v4 (use `@tailwindcss/vite` plugin).

7. **UI Library**: BaseUI (`@base-ui-components/react`) for headless components.

8. **Deno version**: `denoland/deno:debian-2.7.13`

9. **Package manager**: npm (with workspaces), uses `*` instead of pnpm's `workspace:*`.

10. **Seed script**: Uses Node.js (`.cjs`) since Prisma Client is a Node module.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Deno 2.7.13 |
| Monorepo | Turborepo (npm workspaces) |
| Backend | Hono |
| Frontend | React (static SPA via Vite) |
| UI | BaseUI + Tailwind CSS v4 |
| ORM | Prisma |
| Database | PostgreSQL |
| Cache | Deno KV |
| Email | MJML |
| Logging | Pino (structured, secret redaction) |
| Validation | Zod (shared between frontend and backend) |
| Date | date-fns |
| OpenAPI | hono-openapi |
| Testing | Deno test runner, BDD via `@std/testing/bdd`, `@std/expect` + `@std/assert` |
| CI | GitHub Actions |

## Monorepo Structure

```
brewform/
├── package.json              # root: workspaces + turbo
├── turbo.json                # task pipeline
├── deno.json                 # lint/fmt/test config only (NO import maps)
├── .env.example
├── Makefile                  # all Docker-wrapped commands
├── Dockerfile                # multi-stage: deps → build → runner (Deno + Node.js 22)
├── docker-compose.yml        # app, postgres, mailpit, pgadmin
├── apps/
│   ├── api/                  # Hono backend (Deno runtime)
│   └── web/                  # React SPA (Vite build)
├── packages/
│   ├── shared/               # Types, Zod schemas, constants, utils, i18n
│   └── db/                   # Prisma schema, migrations, client, seed
├── files/
│   └── scaa-2.json           # SCAA flavor wheel data
└── docs/                     # Feature documentation
```

## Key Architecture Decisions

- **No `@db.Uuid` or `@db.JsonB`** in Prisma — all IDs are `@default(uuid())` strings, all structured data is relational. This maintains DB portability per §6.2.
- **Soft deletes everywhere** — `deletedAt DateTime?` on all main entities.
- **EmojiTag enum stores stable keys** (fire, rocket, etc.) not actual emoji characters. Mapping is in `@brewform/shared/constants/emoji-tags.ts`.
- **UserPreferences as separate 1:1 table** with individual boolean columns for email notifications (not JSON).
- **RecipeVersion is immutable** — no `updatedAt` column.
- **CacheProvider interface** — services never call `Deno.openKv()` directly, always through injected `CacheProvider`.
- **Services never import from `@prisma/client` directly** — they import from module model files.
- **No Postgres-specific Prisma features** unless isolated with `// POSTGRES-SPECIFIC` comment.
- **Validation uses shared Zod schemas** applied both on API and (optionally) frontend.
- **All numeric values stored in canonical units** (grams, ml, Celsius, seconds). Conversion only at UI layer.

## Verification Commands

```bash
# Format check
make fmt-check

# Lint
make lint

# Type check
make check

# Run tests
make test

# Full CI check
make ci

# Install dependencies
make install

# Database operations (after postgres is running)
make db-generate
make db-migrate
make db-seed    # Uses: docker compose exec app node packages/db/prisma/seed.cjs

# Start the stack
make up
```

## Implementation Workflow

For each phase:
1. Read `state.md` to confirm which phase is next
2. Read the corresponding phase plan file (e.g. `phase3-shared.md`)
3. Read the gap analysis and apply the relevant fixes for that phase
4. Create all files specified in the plan
5. Verify the phase compiles/passes type checking via `docker compose run --rm app deno check apps/api/src/main.ts`
6. Update `state.md` with progress and mark the phase as completed
7. Move to next phase

## Phase Plan Files

| Phase | File | Description |
|-------|------|-------------|
| 1 | `phase1-infrastructure.md` | Monorepo setup, Docker, Makefile, all package.json files, shared types/schemas/constants/utils/i18n, minimal entry points |
| 2 | `phase2-database.md` | Complete Prisma schema (23+ models, 13 enums), seed script with SCAA data parsing |
| 3 | `phase3-shared.md` | Gap fill for shared package (additional types, schemas, constants, utils) |
| 4 | `phase4-backend-core.md` | Env config, CacheProvider, Pino logger, response helpers, middleware, routes, graceful shutdown |
| 5 | `phase5-auth.md` | JWT auth, register/login/refresh/reset, MJML email templates |
| 6 | `phase6-domain-modules.md` | 14 domain modules: user, recipe, equipment, bean, vendor, taste, photo, comment, follow, badge, setup, preference, search, qrcode |
| 7 | `phase7-admin.md` | Admin CRUD, audit logging, cache flush, content moderation |
| 8 | `phase8-frontend-foundation.md` | React+Router, theme system (light/dark/coffee), API client, auth context, global layout |
| 9 | `phase9-frontend-features.md` | All pages/components: auth, recipes, taste autocomplete, profiles, onboarding, admin, etc. |
| 10 | `phase10-testing.md` | BDD tests, 85%+ coverage, 90% for taste notes |
| 11 | `phase11-cicd.md` | GitHub Actions workflow, Deno Deploy, GitHub Pages |
| 12 | `phase12-documentation.md` | Feature docs, API docs, README |

All phase plan files are located at `/Users/arda/projects/BrewForm/.opencode/plans/`.

## Gap Analysis

The full gap analysis is in `/Users/arda/projects/BrewForm/.opencode/plans/gap-analysis.md`. **Read it before each phase** and apply the fixes listed for that specific phase. The gap analysis is organized by phase, so just apply the relevant section.

## What Has Been Completed

See `/Users/arda/projects/BrewForm/.opencode/plans/state.md` for the full and always-up-to-date accounting of completed phases, model details, and key decisions. That file is updated after every phase and is the single source of truth for implementation progress.

## Instructions

1. **Read `state.md`** to determine the current phase
2. **Read the phase plan file** for that phase
3. **Read `gap-analysis.md`** and apply the fixes for that phase
4. **Implement** the phase, creating all specified files
5. **Verify** with `make check` (or `docker compose run --rm app deno check apps/api/src/main.ts`)
6. **Update `state.md`** marking the phase as completed and noting the next phase
7. **Continue** to the next phase or report completion
8. **Self-improve this prompt** — After completing each phase, re-read this file (`/Users/arda/projects/BrewForm/.opencode/plans/implementation-master-prompt.md`) and update it with any new insights, gotchas, or corrections discovered during implementation. This makes the prompt progressively more reliable for future sessions. Examples of improvements:
   - Add a gotcha you hit (e.g. "npm workspaces hoist deps to root, so Dockerfile only needs root node_modules")
   - Correct a wrong assumption in the prompt
   - Add a missing operational rule that caused confusion
   - Update architecture decisions if they changed during implementation
   - Add dependencies or file paths that weren't obvious
   - Note any divergence from the original phase plan
   Do NOT remove information — only add or correct. Keep the prompt concise.

## Gotchas Discovered During Implementation

- **Prisma client generation**: Must run `cd packages/db && npx prisma generate` from within that directory. Running from root with `--schema` flag works but may produce stale types. If generated types seem wrong (e.g., missing fields), do `rm -rf node_modules/.prisma node_modules/@prisma && npm install && cd packages/db && npx prisma generate`.
- **Prisma type assertions**: Generated Prisma types may lag behind schema changes. Use `as any` type assertions for newer fields (like `isAdmin`, `isBanned`, `deletedAt` in `where` clauses) until the client is fully regenerated.
- **Zod `.refine()` + `.partial()`**: When a Zod schema has `.refine()`, calling `.partial()` on it won't work because `.refine()` wraps it in `ZodEffects`. Extract the base schema separately and call `.partial()` on that. Pattern: `const BaseSchema = z.object({...}); export const CreateSchema = BaseSchema.refine(...); export const UpdateSchema = BaseSchema.partial()`.
- **Hono type variables**: Custom context variables need explicit Hono type declaration: `const app = new Hono<{ Variables: { requestId: string; cache: CacheProvider; userId: string | null; user: unknown | null } }>()`.
- **Hono `c.json()` status codes**: Must use Hono's `StatusCode` type or `ContentfulStatusCode` type, not plain `number`. Import from `hono/utils/http-status`.
- **`@prisma/client` version alignment**: Root `package.json` must match `packages/db/package.json` version. Mismatch (e.g., `^7.8.0` vs `^6.19.3`) causes npm hoisting issues and broken Prisma client generation.
- **Docker `node_modules` volume caching**: The `docker-compose.yml` mounts `/app/node_modules` as an anonymous volume. This means Prisma client regeneration in one container may not persist to the next. The `Makefile` `db-generate` command now clears `node_modules/.prisma` before regeneration to avoid stale caches. Always run `make db-generate` (or the equivalent `rm -rf` + `prisma generate` sequence) before `make check` if the Prisma schema has changed.
- **Hono JWT API**: Use `import { sign, verify, decode } from 'hono/jwt'` (not `hono/utils/jwt`). The `sign(payload, secret)` function accepts a plain object, not a `{ alg, typ }` header object. `verify(token, secret, 'HS256')` requires 3 arguments including the algorithm. `decode(token)` returns `{ header, payload }` where both need `as unknown as Record<string, unknown>` casting.
- **Deno lint `deno-lint-ignore` syntax**: The `// deno-lint-ignore <rule>` comment must NOT contain explanatory text after the rule codes — Deno parses ALL subsequent words as additional rule codes. Use only `// deno-lint-ignore no-explicit-any`, with explanations on a separate comment line. For file-wide suppressions, use `// deno-lint-ignore-file <rule>`.
- **Prisma `as any` pattern for query options**: When casting Prisma query options with `as any`, put `as any` on the ENTIRE options object, not on individual properties. When `data: {...} as any` is used, TypeScript infers the rest of the options object (like `include`) as type `never`, causing `Type '{ preferences: true }' is not assignable to type 'never'`. Instead use `prisma.user.findFirst({ where: {...}, include: {...} } as any)`.
- **Prisma `findUnique` vs `findFirst` for soft deletes**: `findUnique` only accepts unique fields in `where`, not filter fields like `deletedAt`. Use `findFirst` when filtering by `deletedAt: null`.
- **Password hashing**: Use `bcryptjs` (not native `bcrypt`) for Deno compatibility. `hashSync`/`compareSync` for synchronous hashing with 10 rounds.
- **Response helper types**: Use `ContentfulStatusCode` (from `hono/utils/http-status`), not `StatusCode`. The `StatusCode` type includes informational 1xx codes which aren't valid JSON response codes and cause type narrowing errors.
- **Custom type declarations in Deno**: For npm packages without types (like `mjml`), create `.d.ts` files in `apps/api/src/types/` and add them to `deno.json` via `compilerOptions.types` array.
- **Hono sub-router typing**: Each sub-router must use `new Hono<AppEnv>()` with the shared `AppEnv` type from `types/hono.ts` to properly type `c.get('userId')`, `c.get('cache')`, etc. Without this, TypeScript can't resolve context variable types. The `AppEnv` type is `{ Variables: { requestId: string; cache: CacheProvider; userId: string | null; user: unknown | null } }`.
- **Hono route params return `string | undefined`**: `c.req.param('id')` returns `string | undefined`. Use `!` assertion since route params are guaranteed, or handle undefined explicitly.
- **Hono `c.get('userId')` after authMiddleware**: Returns `string | null` per Variables type. After authMiddleware, it's guaranteed string. Use `c.get('userId') as string` (not `c.get('userId')!` which only removes undefined).
- **Prisma compound unique constraints**: When using `@@unique([followerId, followingId])`, the Prisma where clause must use the exact constraint name: `where: { followerId_followingId: { followerId, followingId } }`.
- **QR code binary response**: Use `new Response(data, { headers: {...} })` instead of `c.body()` for binary/union types. `c.body()` doesn't accept `Uint8Array | string` unions.
- **APP_URL env variable**: Added to config (`APP_URL`, defaults to `http://localhost:8000`) for QR code generation base URL.
- **Deno lint file-level ignores**: For model/service files heavy on `any` and async passthrough, use `// deno-lint-ignore-file no-explicit-any require-await` at the top rather than per-line suppressions.