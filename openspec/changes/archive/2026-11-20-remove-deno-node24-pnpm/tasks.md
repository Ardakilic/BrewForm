# Tasks: remove-deno-node24-pnpm

## 1. Serena deletion

- [x] 1.1 Delete `.serena/` + remove serena blocks from `.mcp.json`, `opencode.json`; fold still-true memory lines into `AGENTS.md`
- [x] 1.2 Remove `serena:` service from `compose.yml`, `serena-*` targets from `Makefile` (+`.PHONY`), serena lines from `.gitignore`
- [x] 1.3 Delete `docs/serena-mcp.md` (incl. dangling `plan_serena.md` link), scrub `README.md` Serena section + `docs/docker.md` row + `AGENTS.md` Serena directives

## 2. pnpm manifests + toolchain

- [x] 2.1 Write `pnpm-workspace.yaml` (`packages: ['apps/*','packages/*']`, `catalog:` for `drizzle-orm/bcryptjs/zod` + `vite/vitest/drizzle-kit/typescript`), root `package.json` (`@brewform/root`, `workspaces`, `packageManager: pnpm@<exact>`, `devEngines`, `engines: node 24`, real scripts), per-package `package.json` names `@brewform/*` + `workspace:*` links; add `.nvmrc` (`24`), minimal `.npmrc`. Pinned `pnpm@12.10.1`; added `@hono/node-server`, `node-cron`, `dotenv`, `tsx`, `vitest`, `@biomejs/biome`.
- [x] 2.2a Add pnpm manifests alongside Deno; run `pnpm install`, commit `pnpm-lock.yaml` + `allowBuilds` list (esbuild only needed)
- [x] 2.2b (Wave 2, after §4 codemod) Delete `deno.json*` (root + 4 workspace), `deno.lock`, `.deno-version`; remove remaining `deno task` shims
- [x] 2.3a Add `tsconfig.*` (`target esnext`, `module nodenext`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, `rewriteRelativeImportExtensions`, `noEmit`), Biome config (fmt+lint), Vitest configs for `apps/api`/`packages/*` (coverage via v8)
- [x] 2.3b (moved to 6.3) Verify `pnpm -r exec tsc --noEmit` clean — only possible after §3–§4 port; api 353 / shared 199 / db 33 pre-port errors recorded as baseline

## 3. Runtime port (`Deno.*` → Node)

- [x] 3.1 `apps/api/src/main.ts`: `@hono/node-server` `serve()`, `process.env`, signal handling, entrypoint guard; `config/env.ts`, `packages/db/src/index.ts`, `drizzle.config.ts`, `seed.ts`, `setup.ts` → `process.env` + `node:fs/path`
- [x] 3.2 `utils/cache/index.ts` → memory default (drop `Deno.Kv` types, `denokv` env); `scripts/flush-cache.ts`/`flush-db.ts`, `storage/local.ts` → `node:fs`; `utils/jobs/cron.ts` → `node-cron` (`0 * * * *`); `scripts/build-email-templates.ts`, `generate-icons.ts`, `coverage-gate.ts`, `check-users-empty.ts` → `node:` equivalents
- [x] 3.3 `apps/web/vite.config.ts`: delete `@deno/vite-plugin` + `deno()`, `Deno.env.get` → `process.env`; keep `@brewform/shared/*` aliases verified against installed workspaces

## 4. Import + lint codemod

- [x] 4.1 Codemod 178 `jsr:`/`npm:` specifiers (`@std/testing/bdd`+`@std/expect`+`mock`→`vitest`, `@std/path|fs`→`node:`, `npm:fast-check/mjml/nodemailer/resvg`→bare); delete `jsr:` devDeps from `apps/api`/`packages/db` `package.json`s
- [x] 4.2 Convert 38 `deno-lint-ignore` headers to Biome/ESLint disables (or adopt the rule); run `pnpm fmt` + `pnpm lint`
- [x] 4.3 Rewrite meta-tests: `workspace.test.ts` (assert pnpm manifests, no `catalog:` drift), `cache.test.ts` (memory driver), `cron.test.ts` (node-cron), `storage.test.ts` (`node:fs`), `seed*.test.ts`; replace `coverage-gate.ts` deno-spawn with vitest/c8 gate. (`compose-config.test.ts` imports-only; full rewrite deferred to 5.2 with compose.yml.)

## 5. Docker / compose / entrypoints

- [x] 5.1 `Dockerfile`: `node:24-bookworm-slim` stages, `pnpm fetch` + frozen offline install, `pnpm dlx drizzle-kit generate`, email-build, `tsc` gate, `tsx src/main.ts` runner (no `dist/` — `noEmit:true`, api `build` = email-templates only); `docker-entrypoint.sh` → `drizzle-kit migrate && check-users-empty && seed && tsx`.
- [x] 5.2 `Dockerfile.web`: node builder (`pnpm install`, `vite build`), Caddy runner unchanged; `compose.yml`: node `deps` target, `node --watch`/`tsx` + `vite` commands, drop `denokv` service + `DENO_KV_*` + `deno_cache` volume; rewrite `compose-config.test.ts` to node expectations (deferred from 4.3)
- [x] 5.3 `Makefile`: rewrite ~30 targets to `pnpm --filter`/`pnpm dlx`/`node`/`npx tsc`/`vitest`/`drizzle-kit`; update `.githooks/pre-commit` (Biome check + ESLint), `renovate.json` (npm + node managers)

## 6. CI + docs + verification

- [x] 6.1 `.github/workflows/pr.yml` + `ci.yml` + `release.yml`: `pnpm/action-setup` (pinned 12.10.1) + `setup-node 24`, `pnpm install --frozen-lockfile`, `db:generate` freshness check, email-build, Biome check, `tsc`, `vite build`, `vitest run --coverage` per job (keep `postgres:18-alpine` + `brewform_test` env); release image bases → `node:24-bookworm-slim`
- [x] 6.2 Docs: `AGENTS.md` (node/pnpm commands, no Serena), `README.md`, `docs/{architecture,docker,deployment,deployment_coolify}.md`, `coolify_deployment_plan.md` (Redis-or-memory topology, no `--unstable-*`), `TODO_logs.md`, `.env.example`s (drop `DENO_*`)
- [x] 6.3 Final verification: `pnpm fmt-check && pnpm lint && pnpm check && pnpm build && pnpm test` green; `git grep -Ei 'deno(\.|\b)|jsr:|npm:|@deno/|denoland|DENO_' -- apps packages scripts docker* compose.yml .github Makefile` empty except intentional enforcement-test literals (`workspace.test.ts` REMOVED_DENO_FILES, `compose-config.test.ts` `not.toContain` checks, `deno-kv` rejection regression tests); `make fmt` applied
