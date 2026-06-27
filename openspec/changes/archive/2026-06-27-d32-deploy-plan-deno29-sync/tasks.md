# Tasks — d32 Deploy plan & local-dev reconciliation

> All line numbers are hints from the working tree at change-authoring time; they shift as edits
> are applied. **Prefer string-based find/replace** (the exact before→after strings are in
> `design.md` → "Appendix A: Apply edit-map"). After each section, re-grep to confirm no stragglers.

## 1. Local-dev Deno cache mount fix (`compose.yml`)

- [x] 1.1 `app` service (line ~51): `      - deno_cache:/root/.cache/deno` → `      - deno_cache:/deno-dir`.
- [x] 1.2 `web-dev` service (line ~95): `      - deno_cache:/root/.cache/deno` → `      - deno_cache:/deno-dir`.
- [x] 1.3 Confirm zero remaining wrong-path mounts: `grep -rn '/root/.cache/deno' compose.yml docs README.md coolify_deployment_plan.md` returns nothing.

## 2. Compose image pinning (`compose.yml`)

- [x] 2.1 Preview `web` service (line ~216): `    image: caddy:2-alpine` → `    image: caddy:2.11.4-alpine` (match `Dockerfile.web`).
- [x] 2.2 Confirm: `grep -n 'caddy:' compose.yml` shows only `caddy:2.11.4-alpine` (no bare `caddy:2-alpine`).

## 3. Hermetic compose-config guard test

- [x] 3.1 Add `packages/shared/src/compose-config.test.ts` per the sketch in `design.md` → "Appendix B".
      BDD (`jsr:@std/testing/bdd` + `jsr:@std/expect`); resolve `compose.yml` from `import.meta.url`
      (`../../../compose.yml`, mirroring `workspace.test.ts`). Text assertions only — no `@std/yaml`.
- [x] 3.2 Assert `deno_cache:/deno-dir` present AND `deno_cache:/root/.cache/deno` absent.
- [x] 3.3 Assert `caddy:2.11.4-alpine` present AND `image: caddy:2-alpine` absent.
- [x] 3.4 Module docblock on the test + docblock on the `readComposeFile` helper.
- [x] 3.5 `deno task test:shared` (or `make test-shared`) collects and passes the new test.

## 4. Deployment guide reconciliation (`coolify_deployment_plan.md`)

> Verbatim before→after strings and insertion blocks: `design.md` → "Appendix A".

- [x] 4.1 drizzle-kit pin: replace `npm:drizzle-kit@0.31.10` → `npm:drizzle-kit@0.31` (line ~529 migrate, line ~744 generate). Verify: `grep -n 'drizzle-kit@0.31.10' coolify_deployment_plan.md` returns nothing.
- [x] 4.2 Caddy pin: `caddy:2-alpine` → `caddy:2.11.4-alpine` (line ~131, §2 prerequisites table).
- [x] 4.3 Insert the Deno-2.9.0 runtime note after the "## Step 0 — Pre-flight" heading (line ~183) — Appendix A, block A1.
- [x] 4.4 Insert the `deno ci` build note near the §2 Dockerfile prerequisite rows (lines ~129–131) — Appendix A, block A2.
- [x] 4.5 Insert the workspace-layout note after the "## Step 7 — First deploy: migrations & seed" heading (line ~523) — Appendix A, block A3.
- [x] 4.6 Insert the unstable-flags note after the API-start line (line ~536, `exec deno run --unstable-cron --unstable-kv apps/api/src/main.ts`) — Appendix A, block A4. Do NOT remove the flags.
- [x] 4.7 Refresh the §2 "Codebase prerequisites" table **Status** column: the D30/D31 rows still read "Not yet implemented" but shipped (D30 = commit `8a07857`, D31 = `eaffcdf`). `grep -n 'Not yet implemented' coolify_deployment_plan.md`; change each to `Done (shipped in D30/D31)` (or equivalent).

## 5. Docblocks (project convention)

> Suggested docblock text: `design.md` → "Appendix C".

- [x] 5.1 `packages/db/src/seed.ts` (top of file, before line 1 `import …`): add a `@module` docblock describing the idempotent seed.
- [x] 5.2 `packages/shared/src/workspace.test.ts` (top of file, before line 1): add a `@module` docblock for the workspace-integrity suite (the `readJson` helper + constants are already documented).
- [x] 5.3 `scripts/generate-icons.ts` (top of file, before line 1): add a `@module` docblock for the icon-generation script.
- [x] 5.4 `apps/api/scripts/build-email-templates.ts` (before line ~43 `function escapeBackticks`): add a function docblock (escapes `\`, backtick, `$` for safe template-literal embedding).

## 6. Verification

- [x] 6.1 `deno fmt --check` passes (or run `deno fmt`).
- [x] 6.2 `deno lint apps/ packages/` passes.
- [x] 6.3 `deno task check` passes.
- [x] 6.4 `deno task test:shared` passes (includes the new guard test + `workspace.test.ts`).
- [x] 6.5 `openspec validate d32-deploy-plan-deno29-sync --strict` passes.
- [ ] 6.6 Manual smoke: `make up && make dev`, then `make down && make up` — the second start reuses the cache (no full dependency re-fetch), proving the `/deno-dir` mount persists.

## 7. d31 close-out (cross-reference)

- [ ] 7.1 Close PR #54 (`feat/workspace-management`) with a note pointing to `d31-deno-29-upgrade` as its superseding change, and delete the stale branch. (Owned by `d31` §14.1; tracked here so the loose end is not lost.)
