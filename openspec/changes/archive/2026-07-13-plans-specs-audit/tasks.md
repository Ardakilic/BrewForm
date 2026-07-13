# Tasks — plans-specs-audit

## 1. Audit debt plans against codebase
- [x] 1.1 Verify D01–D15 plans against current code; record status + evidence (D03 sole open item; status banners applied)
- [x] 1.2 Verify D16–D29 plans against current code; record status + evidence (all done; banners applied)
- [x] 1.3 Verify active openspec changes (d27, d29, d30, d31, d33) for completeness / archivability (all five complete → recommend archiving)
- [x] 1.4 Verify all `openspec/specs/*` capability specs for drift from the code (16 accurate; 5 drifted specs corrected to match shipped code+tests)

## 2. Feature plan validation
- [x] 2.1 Validate F01–F13 against current codebase; classify valid / outdated / invalid / already-implemented
- [x] 2.2 Validate F14–F26 against current codebase; same classification
- [x] 2.3 Apply status headers + corrections to invalid/outdated F files (all 26 annotated)
- [x] 2.4 Update `FEATURE_SUGGESTIONS.md` index (3 factual corrections, status column, §9 added)

## 3. New debt discovery
- [x] 3.1 Sweep codebase for uncovered debt (types, duplication, error handling, security, tests)
- [x] 3.2 Inventory exported symbols missing docblocks
- [x] 3.3 Author new `plans/D34+` debt plan files for confirmed gaps (D34–D43 written)
- [x] 3.4 Update `TECHNICAL_DEBT.md` index (statuses + new items; rewritten as reliable ledger)

## 4. New features
- [x] 4.1 Author new `plans/F27+` feature plan files for high-value uncovered features (F27–F31 written)

## 5. Docblocks & verification
- [x] 5.1 Add missing docblocks to exported functions found in 3.2 (~270 docblocks across api/web/shared/db; comment-only diffs)
- [x] 5.2 Run `deno check` / `deno lint` / test suite to confirm no regressions (`deno task check`, `lint`, `fmt-check` all clean; 63 test files/612 steps pass; the 26 failing DB-integration files fail identically on clean HEAD — pre-existing environmental issue: test Postgres not running, `password authentication failed for user "test"`)
