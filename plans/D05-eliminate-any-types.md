# D05: Eliminate Pervasive `any` Types in API Services

## Severity: High

## Issue Description

Multiple API service and route files use `any` types extensively, undermining TypeScript's compile-time safety. The `any` usage is concentrated in recipe/service.ts (13+ occurrences), recipe/index.ts (9+), vendor/service.ts (2), admin/service.ts (3), auth/service.ts (2), photo/service.ts (1), and routes/sitemap.ts (1). Many of these files also carry `deno-lint-ignore-file` directives that blanket-suppress lint warnings.

## Impact

- **Type safety defeated**: Errors that TypeScript would catch at compile time are hidden until runtime.
- **Refactoring risk**: Changing a data shape silently breaks consumers that use `any`.
- **Developer experience**: IDE autocompletion and hover types are lost on `any`-typed values.
- **Lint suppression sprawl**: `deno-lint-ignore-file` masks the underlying issues and reduces code quality visibility.

## Root Cause

1. **Drizzle query results not typed**: `db.select().from(...)` returns inferred types, but service functions cast results to `any` instead of using `$inferSelect`.
2. **Hono context variables untyped**: `AppEnv` is defined in `apps/api/src/types/hono.ts` but some handlers cast `c.get('user') as any` instead of relying on the typed context.
3. **Lazy typing during development**: `any` was used as a placeholder during prototyping and never replaced.
4. **Zod schemas validated but not used for input typing**: Service functions accept `data: any` instead of `data: z.infer<typeof Schema>`.

## Affected Files

| File | `any` Count | Primary Issue |
|------|-------------|---------------|
| `apps/api/src/modules/recipe/service.ts` | 13+ | Untyped Drizzle results, `data: any` params, `conditions: any[]` |
| `apps/api/src/modules/recipe/index.ts` | 9+ | `c.get('user') as any`, `(r as any)` casts |
| `apps/api/src/modules/vendor/service.ts` | 2 | `data: any` on create/update |
| `apps/api/src/modules/admin/service.ts` | 3 | `data: any` on updateEquipment, updateVendor, createCompatibilityRule |
| `apps/api/src/modules/auth/service.ts` | 2 | `preferences: any` in AuthUser, `toAuthUser` cast |
| `apps/api/src/modules/photo/service.ts` | 1 | `} as any)` cast on model.create |
| `apps/api/src/routes/sitemap.ts` | 1 | `let _db: any = null` |

## Fix Approach

### 1. Define Drizzle Inferred Types

Use `$inferSelect` and `$inferInsert` from Drizzle ORM to derive types directly from schema tables:

```typescript
import { recipes, recipeVersions, vendors } from '@brewform/db/schema';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

type RecipeRow = InferSelectModel<typeof recipes>;
type RecipeVersionRow = InferSelectModel<typeof recipeVersions>;
type VendorInsert = InferInsertModel<typeof vendors>;
```

Reference: [Drizzle ORM Type Inference](/drizzle-team/drizzle-orm-docs)

### 2. Type Hono Route Handlers with AppEnv

The `AppEnv` type is already defined in `apps/api/src/types/hono.ts`:

```typescript
export type AppVariables = {
  requestId: string;
  cache: CacheProvider;
  userId: string | null;
  user: ContextUser | null;
};

export type AppEnv = { Variables: AppVariables };
```

All route handlers should use `Hono<AppEnv>` and access typed context via `c.get('userId')` and `c.get('user')` without casts.

Reference: [Hono Context Variables](/websites/hono_dev)

### 3. Replace `data: any` with Zod-Inferred Types

Service functions that accept validated Zod input should use the schema's inferred type:

```typescript
import type { z } from 'zod';
import { RecipeCreateSchema } from '@brewform/shared/schemas';

export async function createRecipe(
  authorId: string,
  data: z.infer<typeof RecipeCreateSchema>,
) { ... }
```

### 4. Remove Blanket `deno-lint-ignore-file` Directives

After fixing the underlying `any` types, remove the file-level lint suppression and replace with targeted inline suppressions only where genuinely necessary.

## Implementation Steps

### Step 1: `apps/api/src/modules/recipe/service.ts`

1. Add Drizzle inferred types at the top of the file:
   ```typescript
   import type { InferSelectModel } from 'drizzle-orm';
   type RecipeRow = InferSelectModel<typeof recipes>;
   type RecipeVersionRow = InferSelectModel<typeof recipeVersions>;
   ```
2. Replace `let recipe: any` with `let recipe: RecipeRow | null` in `getRecipe`, `updateRecipe`, `deleteRecipe`, `forkRecipe`, `getRecipeMeta`.
3. Replace `data: any` in `createRecipe` and `updateRecipe` with `data: z.infer<typeof RecipeCreateSchema>` and `data: z.infer<typeof RecipeUpdateSchema>`.
4. Replace `const recipe: any = await db.transaction(...)` with the inferred return type.
5. Replace `conditions: any[]` with `conditions: SQL[]` (import `SQL` from `drizzle-orm`).
6. Type `allRules as CompatibilityRule[]` — remove cast by typing the Drizzle select result.
7. Replace `(e: any)` callbacks with typed parameters.
8. Run `make check-api` to verify.

### Step 2: `apps/api/src/modules/recipe/index.ts`

1. Replace all `(c.get('user') as any)` with `c.get('user')` — the `AppEnv` typing handles this.
2. Replace `(r as any)` casts with proper type assertions to the recipe response type.
3. Replace `(t: any)` and `(e: any)` in map callbacks with inferred types from the Drizzle join results.
4. Remove the `as any` cast on line 41 (`c.get('user') as any`).
5. Run `make check-api` to verify.

### Step 3: `apps/api/src/modules/vendor/service.ts`

1. Import `VendorCreateSchema` from `@brewform/shared/schemas`.
2. Replace `data: any` in `createVendor` with `data: z.infer<typeof VendorCreateSchema>`.
3. Replace `data: any` in `updateVendor` with `data: z.infer<typeof VendorUpdateSchema>`.
4. Run `make check-api` to verify.

### Step 4: `apps/api/src/modules/admin/service.ts`

1. Type `data: any` parameters in `updateEquipment`, `updateVendor`, `createCompatibilityRule`.
2. For equipment: use `{ name?: string; type?: string; brand?: string; model?: string; description?: string }`.
3. For vendor: use `z.infer<typeof VendorUpdateSchema>`.
4. For compatibility rules: define a `CompatibilityRuleInput` interface.
5. Remove `// deno-lint-ignore-file require-await` — ensure each `async` function actually awaits.
6. Run `make check-api` to verify.

### Step 5: `apps/api/src/modules/auth/service.ts`

1. Import `UserPreferences` from `@brewform/shared/types`.
2. Replace `preferences: any` in the local `AuthUser` interface with `preferences: UserPreferences | null`.
3. Type `toAuthUser` properly instead of casting `user as AuthUser`.
4. Remove both `// deno-lint-ignore no-explicit-any` directives.
5. Run `make check-api` to verify.

### Step 6: `apps/api/src/modules/photo/service.ts`

1. Remove `// deno-lint-ignore-file no-explicit-any`.
2. Replace `} as any)` on model.create with a properly typed object using `InferInsertModel<typeof photos>`.
3. Run `make check-api` to verify.

### Step 7: `apps/api/src/routes/sitemap.ts`

1. Replace `let _db: any = null` with `let _db: ReturnType<typeof import('@brewform/db').db> | null = null` or use the proper `db` type from `@brewform/db`.
2. Run `make check-api` to verify.

## Testing Strategy

- **Type-check**: Run `make check` after each file edit — zero errors required.
- **Lint**: Run `make lint` — no new warnings, and reduced suppression count.
- **Unit tests**: Run `make test-api` to verify no behavioral regressions.
- **Manual smoke test**: Start dev server (`make dev`), create/update/delete recipes, verify API responses are unchanged.

## Risk Assessment

- **Low risk**: All changes are type-level only — no runtime behavior changes.
- **Migration risk**: None. No database or API contract changes.
- **Rollback**: Each file is an independent commit; revert any single file if issues arise.
- **Verification**: `make check` and `make test` provide full safety net.
