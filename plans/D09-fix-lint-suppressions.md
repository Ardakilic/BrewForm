# D09: Fix `deno-lint-ignore` Directives in Production Code

## Severity: Medium

## Policy Note

The repository's `.deno.json` lint configuration explicitly **excludes** the following rules from enforcement for TypeScript files:
- `no-explicit-any`
- `require-await`
- `no-empty`
- `no-import-prefix`
- `no-unversioned-import`

Because these rules are not enforced, suppressions targeting only those rules have no effect on lint output. **This plan must not recommend fixes for excluded rules** unless the lint policy is changed first. See the "Required Policy Change" section below.

This revision scopes the plan to: (a) file-level `deno-lint-ignore-file` directives that suppress **enforced** rules across entire files, and (b) inline suppressions for rules that are actually active.

## Issue Description

The codebase contains 15+ `deno-lint-ignore` directives across production and test files. Some target excluded rules (no-op) while others suppress warnings for rules that are actually enforced.

## Impact

- **Reduced lint effectiveness**: File-level `deno-lint-ignore-file` directives suppress ALL warnings in the file, including unrelated future issues for **enforced** rules.
- **Onboarding confusion**: New developers see suppressed warnings and may be confused about which rules are actually active.
- **Technical debt accumulation**: Suppressed issues for enforced rules remain unfixed and multiply over time.

## Root Cause

1. **Development shortcuts**: Code-quality issues were suppressed instead of fixed during prototyping.
2. **Policy ambiguity**: The repo's lint exclusions (`no-explicit-any`, `require-await`, etc.) were not clearly documented, creating confusion about which rules are in effect.
3. **File-level suppression**: `deno-lint-ignore-file` was used instead of targeted inline suppressions for enforced rules.
4. **Test files**: Test files suppress warnings, but this is acceptable.

## Required Policy Change (Pre-requisite)

Before any `no-explicit-any` or `require-await` suppressions can be addressed, the following must happen:

1. **Remove `no-explicit-any` and `require-await` from the lint exclusion list** in `.deno.json`.
2. **Audit all suppressions** for these rules across the codebase.
3. **Fix each instance** (replace `any` with proper types, add/remove `await` as appropriate).
4. **Document the policy change** in the project's `AGENTS.md` or a separate decision record.

This change is explicitly **out of scope** for the current plan unless approved separately.

## Affected Files

### Files with File-Level Suppressions for Enforced Rules

| File | Directive | Issue |
|------|-----------|-------|
| _(Scan needed — no file-level suppression currently blocks enforced rules)_ | | |

**Note:** Most production files use file-level suppressions that target only excluded rules (`no-explicit-any`, `require-await`). These are no-ops for lint output and should be left as-is unless the lint policy is changed first.

### Files with Inline Suppressions for Enforced Rules

| File | Line(s) | Directive |
|------|---------|-----------|
| _(Scan needed — see Implementation Steps)_ | | |

## Fix Approach

### File-level → Inline or remove (for enforced rules only)

- Replace `deno-lint-ignore-file` with targeted `deno-lint-ignore` on specific lines **for enforced rules only**.
- After fixing the underlying issue, remove the inline suppression too.

### Excluded rules (`no-explicit-any`, `require-await`, etc.) → Deferred

- These suppressions have no effect on lint output today.
- Removing them is purely cosmetic and would be undone by the next format pass.
- Fixing the underlying code requires a lint-policy change first (see above).
- **Do not remove or modify** these suppressions unless the lint policy has been updated.

## Implementation Steps

### Phase 1: Audit Only (Priority: High)

#### Step 1: Scan for file-level suppressions that affect enforced rules

1. Run `rg "deno-lint-ignore-file" --include "*.ts" -n` and check each file.
2. If a file-level suppression includes any **enforced** rule (anything outside `no-explicit-any`, `require-await`, `no-empty`, `no-import-prefix`, `no-unversioned-import`), flag it.
3. File-level suppressions that target **only** excluded rules should be left as-is.
4. Run `make lint` to confirm no new warnings appear.

#### Step 2: Scan for inline suppressions that affect enforced rules

1. Run `rg "deno-lint-ignore(?!-file)" --include "*.ts" -n` and check each occurrence.
2. If the inline suppression references an **enforced** rule, consider fixing the issue.
3. Inline suppressions for excluded rules (`no-explicit-any`, `require-await`) should be left as-is.

### Phase 2: Fix Enforced-Rule Suppressions (if any found)

#### Step 3: Fix per file

For each file where an enforced-rule suppression was found:

1. Read the file to understand the suppressed code.
2. Fix the underlying issue (add proper type, add missing `await`, etc.).
3. Remove the suppression if the fix resolves it.
4. Run `make check` and `make lint` to verify.

### Phase 3: Test Code (Priority: Low)

#### Step 4: Test files

Test files are lower priority. No changes needed unless a test file suppresses an enforced rule that generates warnings.

## Verification Checklist

After all phases:

```bash
make check          # Type-check all workspaces
make lint           # Lint all code
make test           # Run all tests
```

Count remaining `deno-lint-ignore` directives:

```bash
rg "deno-lint-ignore" --include "*.ts" -c | sort -t: -k2 -rn
```

Target: No `deno-lint-ignore-file` that suppresses enforced rules. Inline `deno-lint-ignore` only where genuinely justified (e.g., third-party type incompatibility).

## Required Policy Change (Pre-requisite)

Before any `no-explicit-any` or `require-await` suppressions can be addressed, the lint policy in `AGENTS.md` must be updated to remove those rules from the exclusion list. This plan does **not** include that policy change — it is scoped to fixing suppressions for **enforced** rules only.

## Testing Strategy

- **Type-check**: `make check` — zero errors.
- **Lint**: `make lint` — reduced suppression count, no new warnings.
- **Unit tests**: `make test` — all tests pass.
- **Regression**: Start dev server (`make dev`) and exercise key flows (create recipe, login, admin panel).

## Risk Assessment

- **Minimal risk**: This revised plan focuses on audit only unless enforced-rule suppressions are found.
- **No behavior changes**: Removing file-level suppressions for excluded rules has no runtime effect.
- **Rollback**: Each file is an independent change; revert any single file if issues arise.
- **Verification**: `make check` + `make lint` + `make test` provide full safety net.
