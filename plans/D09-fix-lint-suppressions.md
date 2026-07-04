# D09: Fix `deno-lint-ignore` Directives in Production Code

> **Status (2026-07-04): ✅ Done (audit-only)** — no enforced-rule suppressions remain; note the baseline table below is now stale (8 → 26 directives, mostly in tests).

## Severity: Medium

---

> **Revision note (validated against `main` branch, June 2026)**
>
> The original plan contained three inaccuracies corrected here:
>
> 1. **Wrong config filename** — the plan referred to `.deno.json` (with a leading dot) throughout; the actual file is `deno.json`.
> 2. **Incorrect directive count** — the plan said "15+"; the real count is **22** (8 file-level + 14 inline).
> 3. **"Scan needed" placeholders** — the affected-file tables were left blank. They are filled in below with the actual results of running the Phase 1 audit commands against `main`.
>
> Additionally, two new observations are recorded:
>
> 4. **AGENTS.md already documents the convention** — `AGENTS.md` §"Code style" explicitly states the lint-exclusion policy and mandates `// deno-lint-ignore-file no-explicit-any require-await` for module files. No further documentation step is needed.
> 5. **`apps/api/src/modules/user/service.ts` is inconsistent** — it carries three inline `no-explicit-any` suppressions instead of the single file-level directive mandated by AGENTS.md. This is a cosmetic fix opportunity, tracked below.

---

## Policy Note

The repository's `deno.json` lint configuration explicitly **excludes** the following rules from enforcement for TypeScript files:

- `no-explicit-any`
- `require-await`
- `no-empty`
- `no-import-prefix`
- `no-unversioned-import`

Because these rules are not enforced, suppressions targeting only those rules have no effect on lint output. **This plan must not recommend fixes for excluded rules** unless the lint policy is changed first. See the "Required Policy Change" section below.

This revision scopes the plan to: (a) file-level `deno-lint-ignore-file` directives that suppress **enforced** rules across entire files, and (b) inline suppressions for rules that are actually active.

`ban-unused-ignore` is part of the `recommended` ruleset and is **not** excluded in `deno.json`. In practice, Deno does not raise `ban-unused-ignore` for directives that reference a rule globally excluded via `rules.exclude` — which is why AGENTS.md can safely recommend these directives as a coding convention. This is confirmed by the fact that `make lint` passes cleanly on `main`.

---

## Issue Description

The codebase contains **22** `deno-lint-ignore` directives (8 file-level, 14 inline) across production and test files. **All of them target excluded rules** (`no-explicit-any` and/or `require-await`), so none are generating lint warnings today.

One production file (`apps/api/src/modules/user/service.ts`) uses three inline `no-explicit-any` suppressions instead of the file-level directive mandated by AGENTS.md, creating a minor inconsistency.

---

## Impact

- **Reduced lint effectiveness**: File-level `deno-lint-ignore-file` directives suppress ALL warnings in the file, including unrelated future issues for **enforced** rules.
- **Onboarding confusion**: New developers see suppressed warnings and may be confused about which rules are actually active.
- **Technical debt accumulation**: Suppressed issues for enforced rules remain unfixed and multiply over time.

---

## Root Cause

1. **Development shortcuts**: Code-quality issues were suppressed instead of fixed during prototyping.
2. **Policy ambiguity**: The repo's lint exclusions (`no-explicit-any`, `require-await`, etc.) were not clearly documented at first, creating confusion about which rules are in effect. *(Now resolved — AGENTS.md §"Code style" is the authoritative reference.)*
3. **File-level suppression**: `deno-lint-ignore-file` was used instead of targeted inline suppressions for enforced rules.
4. **Test files**: Test files suppress warnings, but this is acceptable.

---

## Required Policy Change (Pre-requisite)

Before any `no-explicit-any` or `require-await` suppressions can be addressed, the following must happen:

1. **Remove `no-explicit-any` and `require-await` from the lint exclusion list** in `deno.json`.
2. **Audit all suppressions** for these rules across the codebase.
3. **Fix each instance** (replace `any` with proper types, add/remove `await` as appropriate).
4. **Update `AGENTS.md`** §"Code style" to reflect the changed exclusion list and remove the line prescribing `// deno-lint-ignore-file no-explicit-any require-await`. *(AGENTS.md already exists and already documents the current policy — no new doc file is needed.)*

This change is explicitly **out of scope** for the current plan unless approved separately.

---

## Affected Files

### Files with File-Level Suppressions — Enforced Rules

> **Phase 1 audit result:** No such files found. Every file-level directive targets only excluded rules.

| File | Directive | Status |
|------|-----------|--------|
| *(none)* | | |

### Files with File-Level Suppressions — Excluded Rules Only (no-ops)

These are informational; no action is required unless the lint policy changes.

| File | Directive | Notes |
|------|-----------|-------|
| `packages/shared/src/schemas/compatibility.ts` | `deno-lint-ignore-file no-explicit-any require-await` | Production — excluded rules only |
| `packages/shared/src/schemas/report.ts` | `deno-lint-ignore-file no-explicit-any require-await` | Production — excluded rules only |
| `packages/shared/src/logger/index.ts` | `deno-lint-ignore-file no-explicit-any require-await` | Production — excluded rules only |
| `packages/shared/src/logger/types.ts` | `deno-lint-ignore-file no-explicit-any require-await` | Production — excluded rules only |
| `apps/api/src/modules/coffee-variety/service.ts` | `deno-lint-ignore-file require-await` | Production — excluded rule only |
| `apps/api/src/modules/coffee-variety/model.ts` | `deno-lint-ignore-file require-await` | Production — excluded rule only |
| `apps/api/src/middleware/crawler.test.ts` | `deno-lint-ignore-file no-explicit-any` | Test file — excluded rule only |
| `apps/api/src/routes/sitemap.test.ts` | `deno-lint-ignore-file no-explicit-any` | Test file — excluded rule only |

### Files with Inline Suppressions — Enforced Rules

> **Phase 1 audit result:** No such files found. Every inline directive targets only excluded rules.

| File | Line(s) | Directive | Status |
|------|---------|-----------|--------|
| *(none)* | | | |

### Files with Inline Suppressions — Excluded Rules Only (no-ops)

These are informational; no action is required unless the lint policy changes.

| File | Lines | Directive | Notes |
|------|-------|-----------|-------|
| `apps/api/src/modules/user/service.ts` | 21, 37, 66 | `no-explicit-any` | **Production** — inline instead of file-level; inconsistent with AGENTS.md convention (see below) |
| `apps/api/src/modules/user/service.exploration.test.ts` | 87, 117 | `no-explicit-any` | Test file |
| `apps/api/src/modules/user/service.preservation.test.ts` | 79, 109 | `no-explicit-any` | Test file |
| `apps/api/src/modules/recipe/service.test.ts` | 393 | `no-explicit-any` | Test file |
| `apps/api/src/modules/recipe/service.preservation.test.ts` | 80, 83, 99, 101, 160, 181 | `no-explicit-any` | Test file; lines 160 and 181 use a non-standard trailing-comment style (`const w = where as any; // deno-lint-ignore no-explicit-any`) — harmless since the rule is excluded |

---

## Fix Approach

### File-level → Inline or remove (for enforced rules only)

- Replace `deno-lint-ignore-file` with targeted `deno-lint-ignore` on specific lines **for enforced rules only**.
- After fixing the underlying issue, remove the inline suppression too.

### Excluded rules (`no-explicit-any`, `require-await`, etc.) → Deferred

- These suppressions have no effect on lint output today.
- Removing them is purely cosmetic and would be undone by the next format pass or re-added the next time the code is touched.
- Fixing the underlying code requires a lint-policy change first (see above).
- **Do not remove or modify** these suppressions unless the lint policy has been updated.

### Cosmetic inconsistency: `user/service.ts` (optional)

`apps/api/src/modules/user/service.ts` carries three inline `// deno-lint-ignore no-explicit-any` comments rather than the file-level directive prescribed by AGENTS.md:

> *"Module files use `// deno-lint-ignore-file no-explicit-any require-await`."*

This is a purely cosmetic fix (the rule is excluded either way) but makes the file consistent with every other production module. If desired, replace all three inline suppressions with a single file-level directive at line 1:

```ts
// deno-lint-ignore-file no-explicit-any
```

---

## Implementation Steps

### Phase 1: Audit (COMPLETED)

#### Step 1: Scan for file-level suppressions that affect enforced rules

```bash
grep -rn "deno-lint-ignore-file" --include="*.ts" apps/ packages/
```

**Result:** 8 file-level directives found. All target only excluded rules (`no-explicit-any`, `require-await`). **No enforced-rule suppressions found.**

#### Step 2: Scan for inline suppressions that affect enforced rules

```bash
grep -rn "deno-lint-ignore" --include="*.ts" apps/ packages/ | grep -v "deno-lint-ignore-file"
```

**Result:** 14 inline directives found. All target only `no-explicit-any` (excluded rule). **No enforced-rule suppressions found.**

Run `make lint` to confirm no warnings appear:

```bash
make lint
```

---

### Phase 2: Fix Enforced-Rule Suppressions

> **N/A — Phase 1 found no enforced-rule suppressions in the codebase. No files require changes under this phase.**

If any such suppressions appear in future, the procedure is:

1. Read the file to understand the suppressed code.
2. Fix the underlying issue (add proper type, add missing `await`, etc.).
3. Remove the suppression if the fix resolves it.
4. Run `make check && make lint` to verify.

---

### Phase 3: Cosmetic Consistency Fix for `user/service.ts` (Optional, Low Priority)

This is optional and can be deferred until the next time the file is touched.

1. Open `apps/api/src/modules/user/service.ts`.
2. Remove the three inline `// deno-lint-ignore no-explicit-any` comments at lines 21, 37, and 66.
3. Add `// deno-lint-ignore-file no-explicit-any` as the first line of the file.
4. Run `make check && make lint` to verify no regressions.

---

### Phase 4: Test Code (Priority: Low)

Test files are lower priority. No changes needed unless a test file suppresses an enforced rule that generates warnings.

---

## Verification Checklist

After any changes:

```bash
make check          # Type-check all workspaces (api, web, db, shared)
make lint           # Lint all code
make test           # Run all tests
```

Count remaining `deno-lint-ignore` directives (use `grep` if `ripgrep` is not installed):

```bash
# With ripgrep
rg "deno-lint-ignore" --include "*.ts" -c | sort -t: -k2 -rn

# With grep (fallback)
grep -rn "deno-lint-ignore" --include="*.ts" apps/ packages/ | wc -l
```

**Target:** No `deno-lint-ignore-file` that suppresses enforced rules. Inline `deno-lint-ignore` only where genuinely justified (e.g., third-party type incompatibility).

**Baseline counts (as of audit on `main`):**

| Type | Count | Rules suppressed |
|------|-------|-----------------|
| File-level (`deno-lint-ignore-file`) | 8 | `no-explicit-any`, `require-await` (excluded) |
| Inline (`deno-lint-ignore`) | 14 | `no-explicit-any` (excluded) |
| **Total** | **22** | All excluded — zero enforced-rule suppressions |

---

## Required Policy Change (Pre-requisite, repeated for clarity)

Before any `no-explicit-any` or `require-await` suppressions can be addressed, the lint policy in `deno.json` must be updated to remove those rules from the `rules.exclude` list, and AGENTS.md §"Code style" must be updated to reflect the change. This plan does **not** include that policy change — it is scoped to fixing suppressions for **enforced** rules only.

---

## Testing Strategy

- **Type-check**: `make check` — zero errors.
- **Lint**: `make lint` — no new warnings; suppression count unchanged (or reduced if the cosmetic fix in Phase 3 is applied, but lint output is identical either way).
- **Unit tests**: `make test` — all tests pass.
- **Full CI**: `make ci` — runs `fmt-check`, `lint`, `check`, `build-web`, `check-tests`, `test-coverage`, `test-web` in sequence.

---

## Risk Assessment

- **Minimal risk**: This revised plan focuses on audit only (already completed); Phase 2 is vacuous since no enforced-rule suppressions were found.
- **No behaviour changes**: Removing file-level suppressions for excluded rules has no runtime effect.
- **Rollback**: Each file is an independent change; revert any single file if issues arise.
- **Verification**: `make check` + `make lint` + `make test` provide full safety net.