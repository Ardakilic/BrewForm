# Plans & Specs Audit — reconcile `plans/` and `openspec/` with the codebase

## Why

Debt work D01–D33 and feature plans F01–F26 have accumulated over roughly a month of rapid
iteration. Many debt plans are implemented and archived under `openspec/changes/archive/`, but the
plan documents (`plans/D*.md`), the index documents (`plans/TECHNICAL_DEBT.md`,
`plans/FEATURE_SUGGESTIONS.md`), and some capability specs (`openspec/specs/*`) have drifted from
the actual state of the codebase. Several F feature plans were written early against assumptions
(routes, tables, module shapes) that have since changed, so their validity is unknown. Meanwhile
new debt has inevitably been introduced that no plan covers.

## What Changes

1. **Audit** every `plans/D*.md` against the current codebase and record a status
   (`Done` / `Partial` / `Not started` / `Obsolete`) with evidence, correcting the
   `TECHNICAL_DEBT.md` index.
2. **Audit** every `openspec/specs/*/spec.md` capability against the code it describes; flag and
   correct drift. Verify whether active changes (`d27`, `d29`, `d30`, `d31`, `d33`) are complete
   and archivable.
3. **Author new debt plans** (`D34+`) for genuine, currently-uncovered debt discovered during the
   audit.
4. **Validate** every `plans/F*.md` feature plan: mark invalid/outdated/rough ones with a status
   header and concrete corrections; update `FEATURE_SUGGESTIONS.md` accordingly.
5. **Author new feature plans** (`F27+`) for high-value features not yet planned.
6. **Add missing docblocks** to exported functions discovered undocumented during the audit
   (comment-only change; no behaviour change).

## Non-Goals

- Implementing any of the debt fixes or features themselves — this change only reconciles the
  planning artefacts and adds documentation comments.
- Rewriting valid plans for style.
- Archiving openspec changes (recommendations only; archival happens with its own tooling).

## Impact

- Affected: `plans/*.md`, `openspec/specs/*` (corrections only), source-file docblocks.
- No runtime behaviour changes; docblock additions are covered by existing type/lint checks
  (`deno check`, `deno lint`) rather than new tests, since no executable code is added.
