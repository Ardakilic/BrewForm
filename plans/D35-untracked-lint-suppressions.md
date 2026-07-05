# D35 — Untracked Lint Suppressions in Production Code

**Severity:** Low
**Status:** Open (2026-07-04)
**Relationship:** Extends [`D09-fix-lint-suppressions.md`](D09-fix-lint-suppressions.md) (resolved 2026-06-05). D09's audited baseline never covered these files; a July 2026 sweep found file-level and line-level suppressions in production (non-test) code that mask real quality issues.

---

## Problem

Seven production files carry `deno-lint-ignore` directives outside D09's audited baseline:

| File:line | Directive | Masks |
|-----------|-----------|-------|
| `packages/shared/src/schemas/compatibility.ts:1` | `// deno-lint-ignore-file no-explicit-any require-await` | file-wide `any` + sync-async functions |
| `packages/shared/src/schemas/report.ts:1` | `// deno-lint-ignore-file no-explicit-any require-await` | same |
| `packages/shared/src/logger/index.ts:1` | `// deno-lint-ignore-file no-explicit-any require-await` | same |
| `packages/shared/src/logger/types.ts:1` | `// deno-lint-ignore-file no-explicit-any require-await` | same |
| `apps/api/src/utils/openapi/index.ts:1` | `// deno-lint-ignore-file no-explicit-any` (plus `as any` at `:28`) | `z.toJSONSchema` boundary cast |
| `apps/api/src/middleware/cors.ts:5` | `// deno-lint-ignore no-unused-vars` | unused import/param kept deliberately |
| `apps/api/src/middleware/requestId.ts:12` | `// deno-lint-ignore no-unused-vars` | same |

File-level `ignore-file` directives are the worst offenders: they disable the rule for **all future edits** to the file, not just the original offending line.

---

## Proposed Fix

Work through each suppression: fix the underlying issue, narrow the directive to a single line, or document why it must stay.

1. **`packages/shared` schema files** (`compatibility.ts`, `report.ts`): identify the actual offending lines. Replace `any` with proper Zod-inferred types; if a function is `async` without `await`, either drop `async` or (where the async signature is part of a public contract) keep it and narrow the suppression to that one line with a comment.
2. **`packages/shared/src/logger/*`** (`index.ts`, `types.ts`): logger APIs commonly need `unknown`-ish payloads — replace `any` with `unknown` and structured field types (`Record<string, unknown>`). Remove the file-level directive once clean.
3. **`apps/api/src/utils/openapi/index.ts`**: the `as any` at `:28` wraps `z.toJSONSchema(...)`; check whether the current zod-openapi v6 / zod version exposes proper return types (D33 refreshed dependencies). If not, narrow to a single `// deno-lint-ignore no-explicit-any` on that line with a justification comment. (Coordinate with D34 stretch scope — do not double-fix.)
4. **`middleware/cors.ts:5` and `requestId.ts:12`** (`no-unused-vars`): if the unused variable is a required-by-signature middleware parameter, rename it with a leading underscore (`_c`, `_next`) which satisfies the rule, and delete the directive. If it is a genuinely unused import, remove it.
5. Re-run `deno lint` across the workspace; confirm zero new violations and that no file-level `ignore-file` directive remains in production source (test files excluded).
6. Run `make ci`.

---

## Files to Change

| File | Change |
|------|--------|
| `packages/shared/src/schemas/compatibility.ts` | Remove file-level directive; fix/narrow |
| `packages/shared/src/schemas/report.ts` | Remove file-level directive; fix/narrow |
| `packages/shared/src/logger/index.ts` | `any` → `unknown`/typed fields; remove directive |
| `packages/shared/src/logger/types.ts` | Same |
| `apps/api/src/utils/openapi/index.ts` | Narrow file-level directive to line-level (or eliminate) |
| `apps/api/src/middleware/cors.ts` | Underscore-prefix unused var; remove directive |
| `apps/api/src/middleware/requestId.ts` | Same |

---

## Test Plan

- `deno lint` passes with the directives removed — this is the primary gate.
- `deno check` (via `make ci`) passes: replacing `any` with real types must not break inference in downstream consumers (logger is imported broadly; schemas are consumed by both apps).
- Existing shared-package tests (`packages/shared/src/schemas/responses/*.test.ts`, logger tests if present) pass unchanged.
- Grep gate: `grep -rn "deno-lint-ignore" packages/shared/src apps/api/src --include='*.ts' | grep -v test` returns only line-level directives that carry a justification comment.

---

## Acceptance Criteria

- [ ] Zero `deno-lint-ignore-file` directives in production source across `packages/shared` and `apps/api`.
- [ ] Any surviving line-level directive has a one-line justification comment and covers exactly one statement.
- [ ] No new `any` introduced; logger APIs use `unknown` where payloads are intentionally open.
- [ ] `make ci` passes.

---

## Effort Estimate

**Low–Medium** — 2–4 hours. Mostly mechanical; the logger typing is the only part with design surface (its API is consumed by both apps, so signature changes must stay source-compatible).
