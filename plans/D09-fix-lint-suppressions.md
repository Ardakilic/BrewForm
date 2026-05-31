# D09: Fix `deno-lint-ignore` Directives in Production Code

## Severity: High

## Issue Description

The codebase contains 26+ `deno-lint-ignore` directives across production and test files. These directives suppress lint warnings rather than fixing the underlying code quality issues. The suppressions are spread across 12+ files in both API and shared packages.

## Impact

- **Masked code quality issues**: `no-explicit-any` suppressions hide type safety gaps. `require-await` suppressions hide unnecessary `async` keywords.
- **Reduced lint effectiveness**: File-level `deno-lint-ignore-file` directives suppress ALL warnings in the file, including unrelated future issues.
- **Onboarding confusion**: New developers see suppressed warnings and may add more `any` types or `async` functions without justification.
- **Technical debt accumulation**: Suppressed issues remain unfixed and multiply over time.

## Root Cause

1. **Development shortcuts**: `any` types were used during prototyping and never replaced.
2. **Linter-first approach**: Instead of fixing code to satisfy the linter, developers suppressed warnings to pass CI.
3. **File-level suppression**: `deno-lint-ignore-file` was used instead of targeted inline suppressions.
4. **Test files**: Test files use `any` freely and suppress warnings, but this leaks into production patterns.

## Affected Files

### Production Code (must fix)

| File | Line(s) | Directive | Root Issue |
|------|---------|-----------|------------|
| `apps/api/src/modules/auth/service.ts` | 33, 37 | `no-explicit-any` | `preferences: any` in AuthUser, `toAuthUser` cast |
| `apps/api/src/modules/admin/service.ts` | 12 | `deno-lint-ignore-file require-await` | Several `async` functions that don't await |
| `apps/api/src/modules/photo/service.ts` | 7 | `deno-lint-ignore-file no-explicit-any` | `} as any)` cast on model.create |
| `apps/api/src/modules/user/service.ts` | 21, 37, 66 | `no-explicit-any` | Untyped parameters |
| `apps/api/src/modules/coffee-variety/service.ts` | 1 | `deno-lint-ignore-file require-await` | Async functions without await |
| `apps/api/src/modules/coffee-variety/model.ts` | 1 | `deno-lint-ignore-file require-await` | Async functions without await |
| `apps/api/src/routes/sitemap.ts` | (indirect) | — | `_db: any` variable |
| `packages/shared/src/logger/index.ts` | 1 | `deno-lint-ignore-file no-explicit-any require-await` | Logger implementation |
| `packages/shared/src/logger/types.ts` | 1 | `deno-lint-ignore-file no-explicit-any require-await` | Logger types |
| `packages/shared/src/schemas/report.ts` | 1 | `deno-lint-ignore-file no-explicit-any require-await` | Schema definitions |
| `packages/shared/src/schemas/compatibility.ts` | 1 | `deno-lint-ignore-file no-explicit-any require-await` | Schema definitions |

### Test Code (lower priority)

| File | Line(s) | Directive |
|------|---------|-----------|
| `apps/api/src/routes/sitemap.test.ts` | 1 | `deno-lint-ignore-file no-explicit-any` |
| `apps/api/src/modules/user/service.exploration.test.ts` | 87, 117 | `no-explicit-any` |
| `apps/api/src/modules/user/service.preservation.test.ts` | 79, 109 | `no-explicit-any` |
| `apps/api/src/modules/recipe/service.preservation.test.ts` | 80, 83, 99, 101, 160, 181 | `no-explicit-any` |
| `apps/api/src/modules/recipe/service.test.ts` | 393 | `no-explicit-any` |
| `apps/api/src/middleware/crawler.test.ts` | 1 | `deno-lint-ignore-file no-explicit-any` |

## Fix Approach

Address each suppression type individually:

### `no-explicit-any` → Replace `any` with proper types

- Import Drizzle inferred types (`$inferSelect`, `$inferInsert`)
- Use Zod schema inferred types for input parameters
- Use the `AppEnv` typed context for Hono handlers
- Define explicit interfaces for complex objects

### `require-await` → Either await or remove async

- If the function truly needs to be async (returns a Promise), add the `await` keyword or ensure it returns a `Promise`.
- If the function doesn't perform any async work, remove the `async` keyword and return the value directly.

### File-level → Inline or remove

- Replace `deno-lint-ignore-file` with targeted `deno-lint-ignore` on specific lines.
- After fixing the underlying issue, remove the inline suppression too.

## Implementation Steps

### Phase 1: Fix production `no-explicit-any` (Priority: High)

#### Step 1: `apps/api/src/modules/auth/service.ts`

1. Import `UserPreferences` from `@brewform/shared/types`.
2. Replace `preferences: any` (line 34) with `preferences: UserPreferences | null`.
3. Replace `toAuthUser` function (lines 38-40) with proper typing:
   ```typescript
   function toAuthUser(user: Awaited<ReturnType<typeof model.findUserByEmail>>): AuthUser {
     return user as AuthUser;
   }
   ```
   Or better: remove `toAuthUser` entirely and type `findUserByEmail` to return `AuthUser`.
4. Remove both `// deno-lint-ignore no-explicit-any` directives (lines 33, 37).
5. Run `make check-api`.

#### Step 2: `apps/api/src/modules/photo/service.ts`

1. Remove `// deno-lint-ignore-file no-explicit-any` (line 7).
2. Import the photos table type:
   ```typescript
   import type { InferInsertModel } from 'drizzle-orm';
   import { photos } from '@brewform/db/schema';
   ```
3. Replace `} as any)` (line 56) with a properly typed object:
   ```typescript
   const photo = await model.create({
     recipeId,
     url,
     thumbnailUrl,
     alt: alt || null,
     sortOrder: sortOrder ?? 0,
   } satisfies InferInsertModel<typeof photos>);
   ```
4. Run `make check-api`.

#### Step 3: `apps/api/src/modules/user/service.ts`

1. Read the file to identify the 3 `no-explicit-any` suppressions (lines 21, 37, 66).
2. Replace each `any` with the appropriate type.
3. Remove the `// deno-lint-ignore no-explicit-any` directives.
4. Run `make check-api`.

#### Step 4: `apps/api/src/routes/sitemap.ts`

1. Replace `let _db: any = null` (line 31) with:
   ```typescript
   import type { db as DBType } from '@brewform/db';
   let _db: typeof DBType | null = null;
   ```
   Or use the return type of the dynamic import.
2. Run `make check-api`.

### Phase 2: Fix production `require-await` (Priority: High)

#### Step 5: `apps/api/src/modules/admin/service.ts`

1. Remove `// deno-lint-ignore-file require-await` (line 12).
2. Read the file and identify all `async` functions that don't use `await`.
3. For each such function:
   - If it calls another async function, keep `async` and add `await`.
   - If it doesn't call any async function, remove `async` keyword.
4. Run `make check-api`.

#### Step 6: `apps/api/src/modules/coffee-variety/service.ts`

1. Remove `// deno-lint-ignore-file require-await` (line 1).
2. Identify `async` functions without `await`.
3. Remove `async` keyword from functions that don't await anything, or add `await` if they call async functions.
4. Run `make check-api`.

#### Step 7: `apps/api/src/modules/coffee-variety/model.ts`

1. Remove `// deno-lint-ignore-file require-await` (line 1).
2. Same treatment as Step 6.
3. Run `make check-api`.

### Phase 3: Fix shared package suppressions (Priority: Medium)

#### Step 8: `packages/shared/src/logger/index.ts`

1. Remove `// deno-lint-ignore-file no-explicit-any require-await` (line 1).
2. Fix `any` types in the logger implementation.
3. Fix `async` functions without `await`.
4. Run `make check-shared`.

#### Step 9: `packages/shared/src/logger/types.ts`

1. Remove `// deno-lint-ignore-file no-explicit-any require-await` (line 1).
2. Fix types to be explicit.
3. Run `make check-shared`.

#### Step 10: `packages/shared/src/schemas/report.ts`

1. Remove `// deno-lint-ignore-file no-explicit-any require-await` (line 1).
2. Fix schema definitions.
3. Run `make check-shared`.

#### Step 11: `packages/shared/src/schemas/compatibility.ts`

1. Remove `// deno-lint-ignore-file no-explicit-any require-await` (line 1).
2. Fix schema definitions.
3. Run `make check-shared`.

### Phase 4: Fix test code suppressions (Priority: Low)

#### Step 12: Test files

Test files use `any` more freely, which is acceptable for testing. However, file-level suppressions should be replaced with inline suppressions on specific lines:

1. For each test file with `deno-lint-ignore-file`, replace with targeted `// deno-lint-ignore no-explicit-any` on the specific lines that need it.
2. Run `make test` to verify tests still pass.

## Verification Checklist

After all phases:

```bash
make check          # Type-check all workspaces
make lint           # Lint all code — should have zero suppressions in production code
make test           # Run all tests
```

Count remaining `deno-lint-ignore` directives:

```bash
rg "deno-lint-ignore" --include "*.ts" -c | sort -t: -k2 -rn
```

Target: Zero `deno-lint-ignore-file` in production code. Inline `deno-lint-ignore` only where genuinely justified (e.g., third-party type incompatibility).

## Testing Strategy

- **Type-check**: `make check` — zero errors.
- **Lint**: `make lint` — reduced suppression count, no new warnings.
- **Unit tests**: `make test` — all tests pass.
- **Regression**: Start dev server (`make dev`) and exercise key flows (create recipe, login, admin panel).

## Risk Assessment

- **Low risk**: All changes are type-level or keyword-level — no runtime behavior changes.
- **`require-await` risk**: Removing `async` from a function that returns a `Promise` changes the return type from `Promise<T>` to `T`. Ensure the function actually returns a value, not a Promise. If it calls an async function, it must `await` the result.
- **Test code risk**: Test suppressions are lower priority and carry minimal risk.
- **Rollback**: Each file is an independent change; revert any single file if issues arise.
- **Verification**: `make check` + `make lint` + `make test` provide full safety net.
