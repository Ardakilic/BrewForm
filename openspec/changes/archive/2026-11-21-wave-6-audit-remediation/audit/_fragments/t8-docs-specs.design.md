### Documentation & OpenSpec truth (t8)

**Context**

Agents treat `AGENTS.md`, `docs/` and `openspec/specs` as the source of truth, and all three drifted after the
Deno → Node 26 / pnpm migration (#135), `compose.production.yml` + the redis driver (#166) and valkey (#168).
Validated drift (full table with evidence in `audit/t8-docs-specs.md`):

- `AGENTS.md:85` and `docs/architecture.md:149` prescribe `eq(t.deletedAt, null)`, which binds `= $1` and never
  matches; the code uses `isNull(...deletedAt)` 160 times. `AGENTS.md:110` lists Deno lint rule names;
  `:111` describes a preceding-comment rule nobody follows (Biome's `: reason` suffix is used); `:37-38` claims
  proxy auto-detection; `:84` "no Postgres-specific operators" while `ilike` is used in 4 modules; `:162` points
  to the dead `TODO_logs.md` work list; no i18n rule.
- 24 main specs mention Deno and `text-sanitization` uses `jsr:` imports. `remote-cache` mandates
  `Deno.openKv`; `deno-runtime` and `deno-workspace-management` are live specs.
- `openspec/changes/remove-deno-node24-pnpm` is complete but unarchived, and its deltas are wrong today
  (Node 24, memory-only cache, no REMOVED for the Deno capabilities).
- Five archived capabilities never reached `openspec/specs` (recipe-comparison, recipe-drink-type-sync,
  recipe-fork-page, type-consolidation, unit-system-display); the shipped merge code has drifted from the
  archived text and has a soft-delete gap (`service.ts:855-857` ignores `recipe.deletedAt`).
- Biome's `recommended` preset sets `noExplicitAny` to warning (never fails CI) and omits `useAwait` and
  `noEmptyBlockStatements`, so all three wave-5 lint guarantees lapsed; the docblock scanner exists only in the
  wave-5 archive and uses `Deno.*`; ADR-013 contradicts the code-documentation spec.
- `docs/api.md` misses brew logs, collections, notifications, merge, diff, sitemap and the cursor/F11 params and
  documents the removed `grinder` filter; `docs/notifications.md`, ADR-006, the README docs table and
  `docs/architecture.md` (middleware, OpenAPI, tables, notifications, lint) are stale; `docs/seo.md` hard-codes a
  domain; `robots.txt` `Disallow: /equipment` hides the public `/equipments` catalog.
- Backlog: ROADMAP says "all debt resolved"; the FEATURE_SUGGESTIONS matrix contradicts it and has 34 broken
  links; F23/F29/F30/F16/F07/F17/F27 rest on Deno premises; F24 duplicates F09; F03/F20/F25/F26/F28 still say
  F02 is missing; D28 phase 2 is orphaned.
- Refuted: `pr_description.md` is git-ignored (`.gitignore:49`) and never tracked — no repo change needed.

**Decisions**

1. *Retire the remove-deno change without applying its deltas.* Choice: the first task of wave 6 runs
   `openspec archive remove-deno-node24-pnpm --skip-specs -y` (flag verified with `openspec archive --help`);
   wave 6 carries the correct deltas (`node-runtime`, `pnpm-workspace` here, `cache-driver` by t2, Deno
   requirements MODIFIED/RENAMED by each owner). Alternatives: rewrite its deltas and archive it (two changes
   editing the same capabilities, its proposal stays wrong); archive as-is (writes Node 24 / memory-only
   requirements); delete it (loses history). Rationale: one change, one correct source of truth.
2. *Retire `deno-runtime`, `deno-workspace-management` and `remote-cache` by deleting their folders, not by
   REMOVED deltas.* Sandbox-verified with openspec 1.4.1: a delta that removes every requirement of a spec
   validates but makes `openspec archive` abort the entire change ("Spec must have at least one requirement"),
   even when the folder is deleted first. Choice: `git rm -r` the three folders in a task before the archive,
   record the REMOVED rationale and migration (→ `node-runtime`, `pnpm-workspace`, `cache-driver`) in
   proposal/design, and list them under `retiredCapabilities` in the doc-drift allowlist. Alternatives:
   tombstone requirements (three vestigial capabilities); archiving wave 6 with `--skip-specs` (loses every
   track's deltas). **No other track may ship an all-REMOVED delta folder.**
3. *Deno-titled requirements use RENAMED + MODIFIED.* Headers such as "Production source has zero
   deno-lint-ignore-file directives" would otherwise survive in the main specs and fail the drift check;
   RENAMED (FROM/TO) + MODIFIED keyed by the new name archives cleanly (sandbox-verified). One-off historical
   requirements whose goal is met (wave-5 dependency batch, TypeScript 7 gate) are REMOVED with a migration.
4. *Orphaned archived capabilities are re-added as curated ADDED specs, corrected to the shipped code*, not
   blindly synced: implementation-level code blocks and "verification commands pass" process requirements are
   dropped; the merge access rule is aligned with `canViewRecipe` plus a soft-delete check (with a failing test
   first). Alternative: `/opsx:sync` of the archived text (re-introduces Deno test patterns and wrong details).
5. *Doc-drift guard as a dependency-free Node script + Vitest fixtures.* `scripts/doc-drift-check.ts` runs with
   plain `node` (native type stripping, `node:` built-ins), so the `doc-drift` CI job needs no install and runs
   in parallel with `quality`. Rules: removed-tooling token pattern
   `(?<![A-Za-z])deno(?:kv|land)?(?![A-Za-z])|jsr:` (case-insensitive; does not match "denote"), archived
   capabilities present unless retired, no "Purpose: TBD", relative links resolve, plus a code-remnant scan.
   Allowlist is one JSON file with mandatory reasons and stale-entry detection. Alternatives: a grep step in YAML
   (no fixtures, no allowlist hygiene), markdownlint/lychee (extra deps, network). The job lives in `ci.yml`
   because t4b deletes `pr.yml`.
6. *API reference is generated.* `apps/api/scripts/generate-api-reference.ts` builds the real route tree like
   `openapi.coverage.test.ts` (no DB/cache I/O, `postgres-js` connects lazily), fetches `/api/v1/openapi.json`
   in-process and renders `docs/api-reference.md`; CI fails on diff. `docs/api.md` keeps only conventions.
   Alternative: hand-update `docs/api.md` (re-drifts with every route). Generation reflects only documented
   routes, so completeness depends on OpenAPI coverage (admin/auth gaps are not owned by any wave-6 track — see
   open questions).
7. *Re-enable the lapsed lint rules explicitly as errors* (`suspicious.noExplicitAny`, `useAwait`,
   `noEmptyBlockStatements` → `"error"` in `biome.json`), fix-first/flip-last, and add
   `packages/shared/src/lint-policy.test.ts` (no file-level/range suppressions; every suppression names one rule
   and a justification). Independent of whatever warning policy the CI owner adopts. Alternative:
   `--error-on-warnings` (would also block on the 764 `noNonNullAssertion` warnings — the CI owner's call).
8. *Docblock enforcement is automated.* Port the 138-line wave-5 scanner to `scripts/docblock-scan.ts`
   (`node:fs`, `--check` mode), backfill exports added since July, run it in the `doc-drift` job; ADR-020
   supersedes ADR-013. Alternative: keep "enforced by review" (it already failed).
9. *Single editor per doc file.* t8 owns `AGENTS.md`, `README.md`, all of `docs/` except
   `deployment_coolify.md`, `deployment_compose.md`, `docker.md` and `deployment.md` (t4b), and `plans/`. Other
   tracks' doc changes (t2 cache/rate-limit, t4a uploads, t5 data loading, t7 search, t4b deploy links) are
   folded in by a final t8 consolidation pass. ADR numbers are pre-allocated: ADR-015 cache driver (t2),
   ADR-016 rate-limit store + client identity (t2), ADR-017 pg_trgm search ranking (t7), ADR-018 web data
   loading (t5), ADR-019 server-generated upload keys (t4a), ADR-020 docblocks (t8), ADR-021 generated API
   reference (t8); later ones take ADR-022+.
10. *Historical docs move to `docs/history/` with a banner* (`requirements-audit-report.md` now; t4b decides for
    `deployment.md`); they are allowlisted, not edited.
11. *ROADMAP is the only status table.* The FEATURE_SUGGESTIONS matrix is replaced by a link; ROADMAP gains a
    "Wave 6 — 2026-11-18 audit remediation" debt entry, a "Platform changes" history line (#135, #166, #168,
    wave 6), D44 (tasteNoteId removal, D28 phase 2) and any wave-6 deferrals as D99.20+.

**Risks / Trade-offs**

- [The doc-drift job fails CI until wave 6 is archived, because the deltas only reach `openspec/specs` at
  archive time] → implement and fixture-test the script early, but wire the CI job as one of the last tasks,
  after `openspec archive wave-6-audit-remediation` and the Purpose backfill in the same PR.
- [Every future archive creates a "Purpose: TBD" spec that the guard rejects] → intended: AGENTS.md documents
  "replace the TBD Purpose after archiving"; the guard names the file.
- [Allowlisting `docs/decisions.md` wholesale could hide new drift there] → the reason field states "ADR
  history"; superseded ADRs carry a "Superseded by ADR-0xx" line; reviewers check ADR edits.
- [Flipping the three lint rules to error surfaces an unknown number of violations (not measurable on the host;
  `node_modules` is a Docker volume)] → measure first with a temporary `biome lint --only=…` run in Docker, fix
  in small batches, flip last; if the count is large, flip per rule.
- [Doc edits race with code tracks] → consolidation pass runs after all code tasks; each doc task names the
  source requirement it documents.
- [Generated API reference is incomplete while admin/auth routes lack `describeRoute`] → the generator prints a
  warning listing mounted routes absent from the spec; the README and `docs/api.md` say the Scalar UI and the
  reference cover documented routes only until coverage is complete.
- [`text-sanitization` has no owner but contains `jsr:` imports] → flagged; the doc-drift guard will catch it
  after archive. Recommended: assign the small delta to t8 (draft in `audit/t8-docs-specs.md` §6).

**Migration / Rollout**

- No DB migration, no new env vars. New root scripts `docs:check`; new API script `docs:api`; new Makefile
  target `docs-check`; new files `scripts/doc-drift-check.ts`, `scripts/doc-drift-allowlist.json`,
  `scripts/docblock-scan.ts`, `apps/api/scripts/generate-api-reference.ts`, `docs/api-reference.md`,
  `.github/pull_request_template.md`, `packages/shared/src/doc-drift.test.ts`,
  `packages/shared/src/lint-policy.test.ts`, `plans/D44-remove-taste-note-id-phase-2.md`.
- Order: archive `remove-deno-node24-pnpm` (first task of the whole change) → code-side cleanups and tooling →
  doc consolidation after the code tracks → delete the three retired spec folders → `openspec archive
  wave-6-audit-remediation -y` → Purpose backfill → wire the `doc-drift` CI job → `openspec validate --all
  --strict` and `node scripts/doc-drift-check.ts` green.
- Rollback: everything is docs, specs, a lint config flip and CI wiring; revert the commits. Reverting the
  remove-deno archive is `git mv` back out of `openspec/changes/archive/`.
