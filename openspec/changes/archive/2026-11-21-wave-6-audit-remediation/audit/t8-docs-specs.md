# t8 — Documentation & OpenSpec truth: validation notes

User decision (verbatim): "Fix all of the docs on agents,mg, openspec etc." (AGENTS.md, every doc, openspec).

Ground truth checked on 2026-11-18 against `main` (`ada9f6e`): root `package.json`
(`packageManager: pnpm@12.18.0`, `engines.node`/`devEngines.runtime` `^26.13.0`), `.nvmrc` = `26`,
`Dockerfile:18` / `Dockerfile.web:14` `node:26.13.0-trixie-slim` + `npm install -g pnpm@12.18.0`,
`pr.yml`/`ci.yml` (`pnpm/action-setup@v6` `version: 12.18.0`, `setup-node` `node-version-file: '.nvmrc'`),
`biome.json` (only `"preset": "recommended"` + web warn overrides), the four `vitest.config.ts`,
`apps/api/src/config/env.ts:20-25` (`CACHE_ENABLED`, `CACHE_DRIVER: z.enum(['memory','redis'])`, `REDIS_URL`),
`compose.yml:136-147` (valkey 9.1), `pnpm-workspace.yaml` (catalog: drizzle-orm, bcryptjs, zod, vite, vitest,
drizzle-kit 0.31.11, typescript 7.0.2), openspec CLI 1.4.1.

## 1. Claim validation

| # | Audit claim | Verdict | Evidence |
|---|---|---|---|
| 1 | AGENTS.md:85 and `docs/architecture.md:149` prescribe `eq(t.deletedAt, null)`; code uses `isNull()` | **Confirmed** (count is 160 now, not 154) | `grep -rn "isNull(.*deletedAt" apps/api/src` = 160; zero `deletedAt, null` in code. Both docs say *never* use `findUnique` (harmless, but it is a Prisma-ism). |
| 2 | 25 of 46 specs mention Deno | **Partially** — 24 by `grep -ril deno`; **text-sanitization** is a 25th (it has `jsr:@std/...` and Deno test sanitizer options but never the word "deno") | `openspec/specs/text-sanitization/spec.md:105,108`. Not in any track's ownership list — see §6. |
| 3 | `remote-cache` mandates `Deno.openKv`/`CACHE_DRIVER=deno-kv` | **Confirmed** | 110 mentions; contradicts `env.ts:24` and `env.test.ts` (asserts `deno-kv` is rejected). |
| 4 | `remove-deno-node24-pnpm` is unarchived with stale deltas | **Confirmed** | `openspec list`: "✓ Complete"; deltas say Node 24 / `.nvmrc 24` / memory-only cache; proposal lists 6 Modified capabilities but only 3 delta folders exist; no REMOVED for deno-runtime / deno-workspace-management. `openspec validate remove-deno-node24-pnpm --strict` → valid. `openspec archive --help` → `--skip-specs` exists. |
| 5 | Five archived capabilities never synced | **Confirmed** | recipe-comparison (2026-07-28-f08, 13 reqs), recipe-drink-type-sync (d06, 4), recipe-fork-page (d04, 5), type-consolidation (d08, 3), unit-system-display (fix-use-unit-system, 4). Verified each against code (§3). |
| 6 | FEATURE_SUGGESTIONS matrix contradicts ROADMAP; F24 dup of F09; F23 Deno codec premise; 11 F-plans reference Deno; F03/F20/F26 say F02 missing | **Confirmed** | `FEATURE_SUGGESTIONS.md:240-256` (F09/F05/F11/F02 "⚠️ Outdated"), 34 `](plans/F…md)` links (resolve to `plans/plans/`); `F24:15` overview promises "see exactly what changed between versions" (= F09); `F23:5`; F-plans with Deno: F07(6), F16, F17, F23(5), F27, F29(6), F30; `F03:3,5`, `F20:3,5`, `F26:6`, `F25:9,20`. |
| 7 | sharp works on Node 26 (F23) | **Confirmed** (Context7 `/lovell/sharp`) | sharp 0.35 needs Node-API v9 (Node ≥ 20.9); prebuilt linux-x64/arm64 for glibc ≥ 2.28 (Debian trixie = 2.41); no install/postinstall script, so no `allowBuilds` entry needed. |
| 8 | `docs/api.md` lacks brew-logs, collections, notifications, merge, diff, sitemap, cursor/F11 params; documents removed `grinder`; broken d28 link | **Confirmed** | `docs/api.md:234-235`, `:468` (`emailNewFollowers`, pre-F05 name). README:222 "100+ endpoints". |
| 9 | `docs/notifications.md`, ADR-006, docs index predate F04/F05/redis | **Confirmed** | `notifications.md:1` "Email Notifications", flags `UserPreferences.newFollower` (renamed `notifyNewFollower`, `schema.ts:123-127`); `decisions.md:110-122` "Redis/Valkey … explicit follow-up"; README docs table omits logging.md, seo.md, comments.md. |
| 10 | AGENTS.md:110 lists Deno lint rule names; biome.json has no exclusions; wave-5 rules lapsed | **Confirmed**, plus a sharper finding | Context7 `/biomejs/website`: `noExplicitAny` is recommended but **warning** severity (never fails the CLI); `useAwait` and `noEmptyBlockStatements` are not recommended. So all three wave-5 guarantees lapsed, not two. `docs/architecture.md:303-306` "excluded repo-wide" is false; `:60` calls line-level suppressions "file-level". |
| 11 | code-documentation spec enforced by `audit/docblock-scan.ts` which uses `Deno.*` and runs nowhere | **Confirmed** | scanner lives only in `openspec/changes/archive/2026-07-27-wave-5-debt-clearance/audit/` (138 lines, regex-based, `Deno.readDir`/`readTextFile` only — trivial `node:fs` port). ADR-013 ("JSDoc on entry points only", cites non-existent `brewform-plan.md`) contradicts the spec. |
| 12 | D28 phase 2 orphaned | **Confirmed** | `TECHNICAL_DEBT.md:256` says "removal" resolved; `packages/shared/src/schemas/recipe.ts:149-160` still says "D29 or later" (D29 reused). |
| 13 | `pr_description.md` is a stale root artifact | **Refuted for the repo** | It is git-ignored (`.gitignore:49`) and was never tracked (`git log -- pr_description.md` empty). Only a local file; no repo change needed. |
| 14 | `TODO_logs.md` says complete but logging gaps remain; AGENTS.md:162 points to it | **Confirmed** | AGENTS.md:162; the gaps themselves are fixed by the API logging owner, t8 removes the pointer/file. |
| 15 | `docs/requirements-audit-report.md` stale (Deno 2.9.0, `brewform-plan.md`) | **Confirmed** | `:1-9`. Move to `docs/history/`. |
| 16 | `make check-web` described as lint | **Confirmed** | `Makefile:75` help text and `README.md:97`; it runs `tsc --noEmit -p tsconfig.json`. |
| 17 | `robots.txt` `Disallow: /equipment` blocks `/equipments` | **Confirmed** | `apps/web/vite.config.ts:41` + `apps/web/public/robots.txt`; `/equipment` is the private page (`router.tsx:278`, `RequireAuth`), `/equipments` and `/equipment/:id` are public. |

### Additional drift found while verifying AGENTS.md / docs

- AGENTS.md:37-38 "host networking auto-detected" — false; the proxy target is `VITE_API_PROXY_TARGET` (compose sets `http://app:8000`), default `http://localhost:8000` (`apps/web/vite.config.ts:7-9`).
- AGENTS.md:20 granular targets omit `make test-web`, `make check-tests`, `make test-coverage`.
- AGENTS.md:84 "No raw SQL / no Postgres-specific operators" — reality: `ilike` in 4 modules, `sql` fragments in a registry (`lint-style` spec), `DATABASE_PROVIDER` enum is dead config. t7 proposes replacement wording (pg_trgm ADR); t8 applies it.
- AGENTS.md:111 says each `biome-ignore` is "immediately preceded by a comment explaining the rationale" — reality: 265 suppressions carry the justification in Biome's `: reason` suffix; almost none has a preceding comment. Rule rewritten to match Biome.
- AGENTS.md OpenAPI section pins "hono-openapi v1.3.0" — installed `^1.5.0`. Context7 (`/rhinobase/hono-openapi`) now describes `resolver()` as usable for request bodies too; the `jsonRequestBody` rule still works, so keep it but drop the version claim and re-verify when applying.
- AGENTS.md has no i18n rule (both `en.json` and `tr.json`, flat keys, parity test).
- `docs/architecture.md:136` "28 tables and 12 enums" — actual 32 `pgTable`, 15 `pgEnum`; `:179-186` middleware list misses secureHeaders, bodyLimit, crawler, `/uploads`; `:207-213` OpenAPI group list misses brew-logs, collections, notifications and claims full coverage (t-OpenAPI owner is closing the admin/auth gaps); `:223-233` notifications email-only; Testing section misses `make test-web` / `make test-db-provision`.
- `docs/request-lifecycle.md:54-60` middleware table has the same 5-row stale order.
- `docs/seo.md:47,63` hard-code `https://brewform.app`; the app derives the origin from `VITE_PUBLIC_APP_URL`.
- `docs/decisions.md:15` links `openspec/changes/remove-deno-node24-pnpm/` (moves to archive in this change).
- `pnpm-workspace.yaml:5-7`, `renovate.json` comments, `apps/api/vitest.config.ts:8`, `packages/db/src/schema.ts` (1), `packages/shared/src/utils/date.ts` (1), `apps/api/src/modules/auth/model.test.ts:11` (sanitizer options) — stale Deno-era comments in code.
- `openspec/config.yaml` has no `context:`; 29 main specs have "Purpose: TBD"; after archiving wave 6 there are 34 (the new capabilities of every track add more).

## 2. OpenSpec tooling constraint found (blocks the brief's REMOVED plan)

Sandbox test with openspec 1.4.1 (scratch copy of the repo's `openspec/`):

1. A change whose delta REMOVES **every** requirement of a spec validates (`openspec validate --strict` → valid) but
   `openspec archive` aborts the **whole** change: "Validation errors in rebuilt spec for foo (will not write
   changes): ✗ Spec must have at least one requirement — Aborted. No files were changed."
2. Deleting `openspec/specs/foo/` first does not help: the delta then creates an empty new spec and aborts the
   same way (`specs-apply.js:140-155` ignores REMOVED for new specs, then the rebuilt spec has zero requirements).
3. RENAMED + MODIFIED (MODIFIED keyed by the new name) archives correctly — used for Deno-titled requirements.
4. The full t8 delta set (24 folders) validates and archives cleanly in a sandbox after deleting the three
   retired spec folders (`+46 ~50 -2 →10`).

**Consequence:** `deno-runtime`, `deno-workspace-management` and `remote-cache` cannot be retired with REMOVED
delta folders without breaking the wave-6 archive. t8 therefore ships **no** delta folders for them; a task
deletes the three folders with `git rm -r` before the archive, the REMOVED rationale is recorded in
design.md/proposal.md ("Removed capabilities"), and the doc-drift check's `retiredCapabilities` map accepts
their absence. **No other track should create an all-REMOVED delta either.**

## 3. Orphaned capability corrections (archived text vs code)

- **recipe-comparison**: implementation differs from the archived spec — `RecipeMergeSchema` adds
  `.default({})` on `selections` and a `.refine` rejecting self-merge (`recipe.ts:225-252`);
  `fetchRecipeVersionWithRelations` also loads `recipe` (`model.ts:1288-1298`); `mergeRecipes` adds an access
  check (author or `public`), `isFavourite: false` and an error log (`service.ts:847-901`); `DiffHighlighter`
  gained a `status` prop (version-diff); compare route is `/recipes/compare/:slug1/:slug2` with a modal dialog.
  **Gap:** the access check ignores `recipe.deletedAt` (a soft-deleted public recipe can still be merged) and
  excludes `unlisted`, unlike `canViewRecipe` (`service.ts:767-776`). The ADDED spec requires
  `deletedAt` → `RECIPE_NOT_FOUND` and the shared predicate; the route test has no FORBIDDEN case. The
  "All verification commands pass" requirement and the Files tables were dropped (process, not capability);
  the Deno test-pattern bullets were replaced by Vitest.
- **recipe-drink-type-sync**: true; `drinkTypeEnum = pgEnum('drink_type', [...DRINK_TYPE_VALUES])`. Remaining
  `as DrinkType` casts are boundary casts (select events, `drinkType: z.string()` in the response schema).
- **recipe-fork-page**: true; title/load-error strings are i18n keys (`recipe.fork.*`), route is lazy.
- **type-consolidation**: true (`types/user.ts:100`, web imports from `@brewform/shared/types`).
- **unit-system-display**: true except `/users/me` preferences now carry flat `notify*` flags (F05), not
  `emailNotifications`.

## 4. remove-deno-node24-pnpm strategy

Chosen: wave-6 carries the correct deltas (`node-runtime`, `pnpm-workspace` ADDED here; `cache-driver` by t2;
Deno-referencing requirements MODIFIED/RENAMED by their owners), and the **first task of the whole change** runs
`openspec archive remove-deno-node24-pnpm --skip-specs -y` so its stale deltas are never applied. Alternatives:
rewrite its deltas then archive (two changes touching the same capabilities, ordering risk, its proposal
would still be wrong); archive as-is (writes Node 24 / memory-only requirements); delete the folder (loses
history).

## 5. Coordination matrix (doc files t8 owns that other tracks will want to change)

| File | Incoming edits | From |
|---|---|---|
| `AGENTS.md` | middleware line (`bodyLimit` 1 MB + photo cap) | t4a |
| `AGENTS.md` | "Web data loading" section | t5 |
| `AGENTS.md` | Database-rules wording (pg_trgm, bounded reads) | t7 |
| `AGENTS.md` | rate-limit/trusted-proxy note; cache DI rule | t2 |
| `docs/decisions.md` | new ADRs (cache driver, rate-limit store, pg_trgm search, web data loading, upload keys) | t2, t7, t5, t4a |
| `docs/architecture.md` | cache section `:92-101`, middleware `:179`, web data flow | t2, t5 |
| `docs/request-lifecycle.md` | `:17`, `:58` rate-limit rows | t2 |
| `docs/api.md` | Photos section, search params, 429 contract, `:530`, `:557` | t4a, t7, t2 |
| `docs/auth.md` | `:52` (registration-disabled log IP), refresh-token revocation | t2, security owner |

Proposed rule: the owning track lands its code and may draft these edits; t8's final consolidation pass
(after all code tracks) reconciles wording, ADR numbering and cross-links, so each file has one final editor.
**ADR number registry** (prevents "next free number" collisions): ADR-015 cache driver + `CACHE_ENABLED` (t2),
ADR-016 rate-limit store and client identity (t2), ADR-017 database-side search ranking with pg_trgm (t7),
ADR-018 web data loading with router loaders/actions (t5), ADR-019 server-generated upload keys (t4a),
ADR-020 JSDoc on every exported symbol, enforced by `scripts/docblock-scan.ts` (t8, supersedes ADR-013),
ADR-021 generated API reference (t8). Later decisions take ADR-022+ in merge order.

## 6. Unowned spec with removed-tooling references: text-sanitization

`openspec/specs/text-sanitization/spec.md` is in no track's list. Two requirements need MODIFIED deltas or the
doc-drift check fails after archive:
- "sanitizeText has dedicated unit-test coverage" — drop "no `{ sanitizeOps, sanitizeResources }` options".
- "sanitize test file follows pure-utility conventions" — bullet 1 → "Import `describe, expect, it` from
  `vitest`"; bullet 4 → "NOT pass a test-options object to `describe`".
Recommendation: assign to t8 (one small delta folder) or to the security track.

## 7. Whole-change sandbox archive (all tracks' deltas on disk at 2026-11-18)

Copying every folder under `specs/` into a scratch change and running `openspec validate --strict` then
`openspec archive -y` (after deleting the three retired folders) succeeds: `+200 ~83 -7 →10`. Residual
removed-tooling tokens afterwards: `cache-driver` (4, negative assertions — allowlisted), `node-runtime` and
`doc-drift-check` (allowlisted), `text-sanitization` (unowned, §6), `container-deployment:294` (t4b: "Deno KV no
longer…" remark — ask t4b to rephrase), and the Purpose text of `lint-style`, `deployment-guide`,
`local-dev-environment` (post-archive task). 44 specs have a "Purpose: TBD" placeholder after the archive.

## 8. Deno/`jsr:` token inventory (inputs to the doc-drift allowlist and cleanup tasks)

- openspec/specs: 24 + text-sanitization (owners per track lists; t8's 19 handled here).
- docs: `decisions.md` (ADR-001 history — allowlisted), `deployment.md` (t4b), `deployment_coolify.md:368`
  (t4b), `requirements-audit-report.md` (→ `docs/history/`).
- plans: F07, F16, F17, F23, F27, F29, F30, FEATURE_SUGGESTIONS (in scope, fixed); D-plans, TECHNICAL_DEBT,
  AUDIT (allowlisted history).
- code/config: listed in §1 "Additional drift".
