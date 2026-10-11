# Design: Deno → Node 24 + pnpm, drop Serena

## Context

BrewForm is a Deno monorepo (`deno.json` workspace `apps/*`+`packages/*`, `catalog: drizzle-orm/bcryptjs/zod`, ~30 `deno task` shims). Scouts inventoried: 4 `deno.json` + `deno.lock` + `.deno-version` (2.9.3), 29 `Deno.*` files, 178 `jsr:` files (every `*.test.ts` + a few prod), 38 `deno-lint-ignore` files, `Dockerfile`/`Dockerfile.web` on `denoland/deno:debian-2.9.3`, `compose.yml` `deno run` commands + `denokv:0.14.0` sidecar, 3 GH workflows on `setup-deno@v2`, `Makefile` fully `deno`-driven. Serena is confirmed dev-only (zero hits in `apps/**`, `packages/**`, `Dockerfile*`, `.github/**`). Reference patterns: API 3-layer module (`model→service→index.ts`), shared Zod schemas, Hono `<AppEnv>`, Drizzle-only DB, soft deletes. Context7 sources: `pnpm/pnpm` v11, `nodejs/node` 24 (strip-types on by default since 22.18), `hono` v4.13, `drizzle-orm`, `zod` v4.

## Goals / Non-Goals

**Goals:** one runtime (Node 24 LTS), one package manager (pnpm), identical app behavior + API shapes, green `pr.yml`/`ci.yml` on Node, GHCR images on `node:24-bookworm-slim`, zero `Deno.*`/`jsr:`/`deno.json` remnants.
**Non-Goals:** new features, KV persistence upgrade (memory default; Redis is a follow-up), Alpine images, npm-vs-pnpm re-litigation, Deno Deploy parity (docs deleted, not ported).

## Decisions

### Decision 1: pnpm, not npm (you asked; it also fits)
Deno `catalog:` maps 1:1 to pnpm `catalog:` in `pnpm-workspace.yaml` (`packages: ['apps/*','packages/*']`); consumers keep `"dep": "catalog:"`. `pnpm --filter @brewform/api <script>` / `pnpm -r` replaces `deno task --cwd`. `pnpm dlx` replaces `deno run -A npm:<pkg>` (drizzle-kit). `pnpm deploy --filter … --prod` replaces hand-rolled prod copies. Rejected npm workspaces: no catalog equivalent, looser hoisting hides phantom imports that pnpm's strict `node_modules` correctly fails. Consequence: must set `allowBuilds` (esbuild/vite, drizzle-kit deps, `@resvg/resvg-js`) once via approve-builds flow or CI breaks; structural settings go in `pnpm-workspace.yaml`, not `.npmrc` (pnpm 11 ignores non-auth `.npmrc` keys).

### Decision 2: Pin Node 24 + pnpm with three files, CI via action-setup
`.nvmrc` (`24`) for fnm/nvm, `packageManager: pnpm@<exact>` (no range — corepack rejects ranges) + `devEngines.packageManager { onFail: download }` for self-switch, `engines/devEngines.runtime` Node 24. CI uses `pnpm/action-setup` pinned to the same version (deterministic, no `corepack enable` step) + `pnpm install --frozen-lockfile`. Rejected corepack-only: extra enable step, flakier. Coolify docs drift noted (`plan` cites Deno 2.9.0 vs actual 2.9.3) — rewrite both deploy docs to Node pins.

### Decision 3: `tsc` check + `tsx` run, Vitest everywhere, Biome
Node 24 strip-types runs TS but only erasable syntax (`erasableSyntaxOnly:true`, no `enum`/param-properties/legacy decorators; `--experimental-transform-types` not adopted). So prod runs `tsx src/main.ts` (Docker + prod) — root `noEmit:true` and api `build` = email-templates only, so there is no `dist/` to execute; a real `dist` build is a deferred follow-up. Dev also runs via `tsx --watch` (one devDep). `deno check` → `tsc --noEmit`; `deno test` (178 `jsr:` files) → Vitest (already used by `apps/web`, so smallest diff; rejected `node:test` — full rewrite with no DX gain); `deno fmt/lint` → Biome single binary (closest to Deno's built-in; rejected Prettier+ESLint pair as two tools for one job).

### Decision 4: Server, KV, cron — smallest behavior-preserving swaps
`Deno.serve` → `@hono/node-server` `serve({ fetch: app.fetch, port })` (same Hono app object). `Deno.Kv` → `memory` driver default (drop `denokv:0.14.0` sidecar + `DENO_KV_*` env); Redis/Valkey is an explicit follow-up, not this change. `Deno.cron('evaluate-badges','0 * * * *')` → `node-cron` same expression in-process. `Deno.env` → `process.env` + `dotenv`, `node:fs/path`, `minimist`/`process.argv`. Consequence: KV-backed cache loses persistence until Redis lands — accepted, documented in spec.

### Decision 5: Images stay split, bases go slim
`Dockerfile` (API) + `Dockerfile.web` (Vite → Caddy `dist/`) keep their 3-stage shape; only stages 1–2 change base to `node:24-bookworm-slim` pinned (`node:24.11.0-bookworm-slim` or newer), `pnpm fetch` + `pnpm install --frozen-lockfile --offline` for cache-stable deps layers, `pnpm --filter … build`, `tsc` gate replacing `deno check`. Rejected `node:24-alpine`: musl breaks `pg`/native/`node-gyp`. Caddy runner unchanged. `docker-entrypoint.sh` becomes `drizzle-kit migrate && check-users-empty && seed && tsx src/main.ts` (via pnpm — no `dist/`, same reason as Decision 3).

### Decision 6: Serena deleted outright, memories salvaged
No sidecar, no shim, no adapter. `.serena/` + configs + compose service + Makefile targets + docs removed in one task; any still-true `.serena/memories` lines folded into `AGENTS.md` first. Rejected gradual: nothing depends on it at runtime.

## Risks / Trade-offs

- [Risk] Strict pnpm `node_modules` exposes phantom imports Deno tolerated → mitigation: per-workspace `tsc` + `vitest` in CI catch them; `vite.config.ts` alias block re-verified against installed `@brewform/*`.
- [Risk] `jsr:` long tail (every API test) → mitigation: codemod `jsr:@std/testing/bdd`→`vitest`, `jsr:@std/expect`→`vitest`, `jsr:@std/path|fs`→`node:`; `npm:fast-check`→bare.
- [Risk] KV persistence loss → mitigation: memory default documented; Redis follow-up change scoped separately.
- [Risk] `allowBuilds` omission breaks CI on first run → mitigation: commit approve-builds list in same PR as manifests.
- [Trade-off] `tsc` build step vs Deno's run-direct: slower dev loop, but type-safe and strip-types-limit-free.

## Migration Plan

1. Land Serena deletion alone (isolated, revertible by re-adding sidecar).
2. Land manifests + toolchain (`pnpm-workspace.yaml`, `package.json`s, Biome/Vitest/tsc configs, `allowBuilds`, `.nvmrc`) with lockfile.
3. Land runtime port (env/fs/serve/KV/cron) + `jsr:` codemod + meta-test rewrites.
4. Land Docker/compose/entrypoints + GH workflows + Makefile/hooks/Renovate + docs (`AGENTS.md`, `README.md`, `docs/*`, both Coolify docs, `TODO_logs.md`).
5. Rollback: revert to `main` (images still publish from old Dockerfiles until cutover tag); no DB migration involved so no data rollback.

## Open Questions

- KV follow-up: Redis vs Valkey vs Postgres-backed — decided later, not blocking.
- None blocking this change.
