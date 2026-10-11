# Proposal: Remove Serena MCP, migrate Deno → Node 24 LTS with pnpm

## Why

Deno owns the runtime, toolchain, CI, and images (`.deno-version` 2.9.3, `denoland/deno` bases, `deno task/lint/fmt/test` everywhere). Only one dev owns Deno knowledge; hiring, Stack Overflow, and Coolify/Nixpacks defaults all assume Node. Serena MCP is an opt-in sidecar (`--profile serena`) with zero runtime imports — pure dev-tooling weight (`.serena/`, compose service, Makefile targets, docs). Replacing both with Node 24 + pnpm removes two niche tools at once and lands on the boring, hireable stack: `node:24-bookworm-slim` images, `pnpm --frozen-lockfile` installs, `tsc` + Vitest + Biome.

## What Changes

- Delete Serena: `.serena/`, `.mcp.json` serena block, `opencode.json` serena block, `compose.yml` `serena:` service, `Makefile` `serena-*` targets, `AGENTS.md` Serena section, `README.md` + `docs/serena-mcp.md` + `docs/docker.md` rows, `.gitignore` serena lines. Migrate useful `.serena/memories/*.md` lines into `AGENTS.md`, then delete.
- Replace `deno.json` workspace + `catalog:` + `tasks` with `pnpm-workspace.yaml` (`packages: ['apps/*','packages/*']`, `catalog:` for `drizzle-orm/bcryptjs/zod` + hoisted `vite/vitest/drizzle-kit/typescript`), per-package `package.json` (`@brewform/*` names, `workspace:*` links, real scripts replacing `deno task` shims). Delete `deno.json*`, `deno.lock`, `.deno-version`. Add `.nvmrc` (`24`), `packageManager: pnpm@<exact>` + `devEngines` pins, minimal `.npmrc`.
- Port 29 `Deno.*` files: `Deno.env` → `process.env` + dotenv, `node:fs/path`, `Deno.serve` → `@hono/node-server`, `Deno.openKv`/`Deno.Kv` → memory default (Redis/Valkey optional follow-up), `Deno.cron` → `node-cron`, `Deno.Command`/`Deno.args` → `node:child_process`/`process.argv`, `import.meta.main` guards → entrypoint checks.
- Rewrite 178 `jsr:`/`npm:` specifiers to bare npm (`vitest` runner everywhere, `node:` builtins); delete `@deno/vite-plugin` from `apps/web/vite.config.ts`; convert 38 `deno-lint-ignore` headers to Biome/ESLint disables.
- Tooling swap: `deno fmt` → Biome, `deno lint` → Biome (or ESLint flat), `deno check` → `tsc --noEmit`, `deno test` → Vitest, `deno task` → `pnpm --filter/-r` scripts, `drizzle-kit` via `pnpm dlx`/devDep, coverage gate via `c8`/vitest coverage. Rewrite `Makefile` (~30 targets), `docker-entrypoint.sh`, `compose.yml` commands, `Dockerfile` + `Dockerfile.web` bases, `.github/workflows/{pr,ci,release}.yml` (`pnpm/action-setup`, `pnpm install --frozen-lockfile`), `.githooks/pre-commit`, `renovate.json` (npm + node managers), `AGENTS.md` workflow section.
- Rewrite meta-tests that assert Deno artifacts: `workspace.test.ts`, `compose-config.test.ts`, `cache.test.ts` (deno-kv driver), `cron.test.ts`, `coverage-gate.ts`.

## Capabilities

### New Capabilities
- `node-runtime`: Node 24 LTS runtime contract (type-stripping limits, `process.env`, Hono node-server, Drizzle `postgres-js`/`node-postgres`, Zod v4 from npm).
- `pnpm-workspace`: pnpm monorepo contract (`pnpm-workspace.yaml`, `catalog:`, `workspace:*`, `--filter`, `--frozen-lockfile`, `allowBuilds`).

### Modified Capabilities
- `container-deployment`, `local-dev-environment`, `ci-image-publishing`, `lint-style`, `remote-cache` (KV backend), `deployment-guide`: Deno specifics replaced with Node/pnpm equivalents.

## Impact

- Database/Shared/API: mechanical import + env rewrites; no schema change. `CacheProvider` KV backend is the one behavior risk (memory default drops persistence; Redis restores it as follow-up).
- Frontend: `vite.config.ts` de-Deno'd (`process.env`, alias block kept); build output identical (`dist/` → Caddy, unchanged runner).
- OpenAPI: none (no route shape change).
- Tests: every `jsr:@std/testing/bdd` file retouched to Vitest; DB-backed tests keep `brewform_test` + `postgres:18-alpine` service.
- Deps: net removal (`jsr:`, `@deno/vite-plugin`, `denoland/deno`); net adds: `@hono/node-server`, `node-cron`, `dotenv`, `tsx` (dev only), Biome/Vitest toolchain.
- Out of scope: Redis/Valkey sidecar (optional follow-up), Deno Deploy docs deletion beyond prose, `plan_serena.md` dangling link fix (delete with `docs/serena-mcp.md`).
