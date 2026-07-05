# D05: Eliminate Pervasive `any` Types in API Services

> **Status (2026-07-04): ✅ Done** — `recipe/service.ts` and `recipe/index.ts` have zero `any`; `sitemap.ts` is typed.

## Severity: High

## Issue Description

Multiple API service and route files use `any` types extensively, undermining TypeScript's
compile-time safety. The `any` usage is concentrated in `recipe/service.ts` (18+ occurrences),
`recipe/index.ts` (7+), `vendor/service.ts` (2), `admin/service.ts` (3), `auth/service.ts` (2),
`photo/service.ts` (1), and `routes/sitemap.ts` (1). Two files also carry `deno-lint-ignore-file`
directives that blanket-suppress lint warnings.

## Impact

- **Type safety defeated**: Errors that TypeScript would catch at compile time are hidden until
  runtime.
- **Refactoring risk**: Changing a data shape silently breaks consumers that use `any`.
- **Developer experience**: IDE autocompletion and hover types are lost on `any`-typed values.
- **Lint suppression sprawl**: `deno-lint-ignore-file` masks the underlying issues and reduces code
  quality visibility.

## Root Cause

1. **Drizzle query results not typed**: `db.select().from(...)` returns inferred types, but service
   functions cast results to `any` instead of using `$inferSelect`.
2. **Hono context variables untyped**: `AppEnv` is defined in `apps/api/src/types/hono.ts` but
   some handlers cast `c.get('user') as any` instead of relying on the typed context.
3. **Lazy typing during development**: `any` was used as a placeholder during prototyping and never
   replaced.
4. **Zod schemas validated but not used for input typing**: Service functions accept `data: any`
   instead of `data: z.infer<typeof Schema>`.
5. **pgEnum cast**: `brewMethodEquipmentRules.brewMethod` column is a `pgEnum`; passing a bare
   `string` requires a cast. The current `as any` should be narrowed to the enum value type.

## Affected Files

| File | `any` Count | Primary Issue |
|------|-------------|---------------|
| `apps/api/src/modules/recipe/service.ts` | 18+ | Untyped Drizzle results, `data: any` params, `filters: any`, `conditions: any[]`, `brewMethod as any`, inline `(p: any)` / `(e: any)` callbacks |
| `apps/api/src/modules/recipe/index.ts` | 7+ | `c.get('user') as any`, `(r as any)` casts, `(t: any)` / `(e: any)` in map callbacks |
| `apps/api/src/modules/vendor/service.ts` | 2 | `data: any` on create/update |
| `apps/api/src/modules/admin/service.ts` | 3 | `data: any` on `updateEquipment`, `updateVendor`, `createCompatibilityRule` |
| `apps/api/src/modules/auth/service.ts` | 2 | `preferences: any` in `AuthUser`, `user: any` in `toAuthUser` |
| `apps/api/src/modules/photo/service.ts` | 1 | `} as any)` cast on `model.create` |
| `apps/api/src/routes/sitemap.ts` | 1 | `let _db: any = null` |

## Fix Approach

### 1. Define Drizzle Inferred Types (Modern Syntax)

Use `$inferSelect` and `$inferInsert` directly on table objects — these are the current idiomatic
Drizzle helpers. `InferSelectModel`/`InferInsertModel` still work but are considered legacy:

```typescript
import { recipes, recipeVersions, photos } from '@brewform/db/schema';

// Preferred (current Drizzle idiom)
type RecipeRow         = typeof recipes.$inferSelect;
type RecipeVersionRow  = typeof recipeVersions.$inferSelect;
type PhotoInsert       = typeof photos.$inferInsert;
```

Reference: [Drizzle ORM Type Inference](https://orm.drizzle.team/docs/goodies)

### 2. Type Hono Route Handlers with AppEnv

`AppEnv` is already defined in `apps/api/src/types/hono.ts`:

```typescript
export type ContextUser = Omit<User, 'preferences'> & {
  preferences?: User['preferences'];
};

export type AppVariables = {
  requestId: string;
  cache: CacheProvider;
  userId: string | null;
  user: ContextUser | null;
};

export type AppEnv = { Variables: AppVariables };
```

`ContextUser` is derived from the shared `User` type which already includes `isAdmin: boolean`.
All route handlers use `Hono<AppEnv>` and access `c.get('user')` without any cast.

Reference: [Hono Context Variables](https://hono.dev/docs/api/context)

### 3. Replace `data: any` with Zod-Inferred Types

Service functions that accept validated Zod input should use the schema's inferred type:

```typescript
import type { z } from 'zod';
import { RecipeCreateSchema, RecipeUpdateSchema } from '@brewform/shared/schemas';

export async function createRecipe(
  authorId: string,
  data: z.infer<typeof RecipeCreateSchema>,
) { ... }
```

### 4. Use `SQL[]` for Dynamic Condition Arrays

Import `SQL` from `drizzle-orm` for typed dynamic filter arrays:

```typescript
import { SQL, and } from 'drizzle-orm';

const conditions: SQL[] = [visibilityCondition];
// ...
const where = conditions.length > 1 ? and(...conditions) : conditions[0];
```

### 5. Narrow pgEnum Casts

When filtering on a `pgEnum` column, narrow to the enum's value union instead of using `any`:

```typescript
import { brewMethodEnum } from '@brewform/db/schema';
// typeof brewMethodEnum.enumValues[number] = the union of all enum string literals

.where(eq(brewMethodEquipmentRules.brewMethod,
  brewMethod as (typeof brewMethodEnum.enumValues)[number]))
```

### 6. Remove Blanket `deno-lint-ignore-file` Directives

After fixing the underlying `any` types, remove file-level lint suppression from the two files
that carry it (`admin/service.ts` and `photo/service.ts`). Replace with targeted inline
suppressions only where genuinely necessary.

---

## Implementation Steps

### Step 1: `apps/api/src/modules/recipe/service.ts`

This file has the most `any` occurrences. Work through them in order:

#### 1a. Import types at the top of the file

```typescript
import type { z } from 'zod';
import { SQL } from 'drizzle-orm';
import { RecipeCreateSchema, RecipeFilterSchema, RecipeUpdateSchema } from '@brewform/shared/schemas';
import { brewMethodEnum } from '@brewform/db/schema';
// Already imported: recipes, recipeVersions, brewMethodEquipmentRules, ...

// Drizzle inferred row types (preferred over deprecated InferSelectModel)
type RecipeRow        = typeof recipes.$inferSelect;
type RecipeVersionRow = typeof recipeVersions.$inferSelect;
```

#### 1b. `getRecipe` — replace `let recipe: any`

```typescript
export async function getRecipe(slugOrId: string) {
  let recipe: RecipeRow | Awaited<ReturnType<typeof model.findBySlug>> | null;
  // ...
}
```

> **Note**: `model.findBySlug` and `model.findById` return rich nested objects via Drizzle
> relational queries (not bare `RecipeRow`). Annotate the local variable with the actual return
> type of the model function instead, e.g.:
>
> ```typescript
> let recipe: Awaited<ReturnType<typeof model.findById>>;
> ```
>
> This propagates the correct shape to all callers and removes the need for `(r as any)` casts in
> the route handler.

#### 1c. `createRecipe` — `data: any` and inline `any` casts

```typescript
export async function createRecipe(
  authorId: string,
  data: z.infer<typeof RecipeCreateSchema>,
) {
  // ...
  // Replace (p: any, i: number) in additionalPreparations.map:
  data.additionalPreparations?.map(
    (p: z.infer<typeof RecipeCreateSchema>['additionalPreparations'][number], i: number) => ({ ... })
  );

  // Replace `const recipe: any = await db.transaction(...)` with inferred type
  const recipe = await db.transaction(async (tx) => { ... });

  // Replace `const finalRecipe: any = await model.findById(recipe.id)`
  const finalRecipe = await model.findById(recipe.id);
}
```

#### 1d. `updateRecipe` — `data: any`, `recipe: any`, `latestVersion: any`, `(e: any)` callback

```typescript
export async function updateRecipe(
  recipeId: string,
  authorId: string,
  data: z.infer<typeof RecipeUpdateSchema>,
) {
  const recipe = await model.findById(recipeId);   // inferred, not `any`
  // ...
  const latestVersion = recipe?.versions?.[0];     // inferred from model return type

  // Replace e: any with inferred equipment shape
  const existingEquipmentIds = latestVersion?.equipment?.map((e) => e.equipmentId) ?? [];
}
```

#### 1e. `deleteRecipe`, `forkRecipe`, `toggleLike`, `getRecipeMeta` — replace `let x: any`

```typescript
const recipe = await model.findById(recipeId);   // inferred
const source = await model.findById(sourceId);   // inferred
```

#### 1f. `listRecipes` — `filters: any` and `conditions: any[]`

```typescript
export async function listRecipes(
  filters: z.infer<typeof RecipeFilterSchema>,
  page: number,
  perPage: number,
  _requestingUserId: string | null = null,
  isAdmin: boolean = false,
) {
  const conditions: SQL[] = [visibilityCondition];
  // ...
}
```

#### 1g. `listStarredRecipes` — `filters: any`

```typescript
export async function listStarredRecipes(
  filters: z.infer<typeof RecipeFilterSchema>,
  page: number,
  perPage: number,
  userId: string,
) { ... }
```

#### 1h. `validateEquipmentCompatibility` — `brewMethod as any`

```typescript
const allRules = await db
  .select()
  .from(brewMethodEquipmentRules)
  .where(
    eq(
      brewMethodEquipmentRules.brewMethod,
      brewMethod as (typeof brewMethodEnum.enumValues)[number],
    ),
  );
// The existing `allRules as CompatibilityRule[]` cast can now be removed
// since Drizzle infers the result shape directly — CompatibilityRule is
// already defined in this file and the inferred type satisfies it.
```

> **Note**: `CompatibilityRule` and `CompatibilityCheckItem` interfaces are **already defined**
> in this file. Do not re-add them.

#### 1i. Verify and run

```bash
make check-api   # zero errors required
```

---

### Step 2: `apps/api/src/modules/recipe/index.ts`

> **Note**: This file does **not** have a `deno-lint-ignore-file` directive — do not add a
> removal step.

#### 2a. Replace `c.get('user') as any`

`ContextUser` already includes `isAdmin: boolean` (inherited via `Omit<User, 'preferences'>`).
Remove the cast:

```typescript
// Before
const isAdmin = (c.get('user') as any)?.isAdmin ?? false;

// After
const isAdmin = c.get('user')?.isAdmin ?? false;
```

#### 2b. Replace `const recipe: any = await service.getRecipe(slug)`

Once Step 1b is done, `service.getRecipe` has a proper inferred return type. Remove all `any`
annotations on its call sites:

```typescript
// Before
const recipe: any = await service.getRecipe(slug);

// After
const recipe = await service.getRecipe(slug);
```

#### 2c. Replace `(r as any)` casts in `/:slugOrId` GET handler

Once `getRecipe` returns a typed value, `r.versions`, `r.id`, `r.forkedFrom`, etc. resolve
without casts. Replace all `(r as any).xxx` with `r.xxx`.

#### 2d. Replace `(t: any)` and `(e: any)` in map callbacks

These callbacks operate on elements of `currentVersion.tasteNotes` and
`currentVersion.equipment`. Once `currentVersion` is typed (via the model's inferred return), the
element types will be inferred automatically:

```typescript
// Before
tasteNotes: currentVersion?.tasteNotes?.map((t: any) => ({ ... })) ?? [],
equipment:  currentVersion?.equipment?.map((e: any) => ({ ... })) ?? [],

// After (types inferred from the Drizzle relational query result)
tasteNotes: currentVersion?.tasteNotes?.map((t) => ({ ... })) ?? [],
equipment:  currentVersion?.equipment?.map((e) => ({ ... })) ?? [],
```

#### 2e. Verify

```bash
make check-api
```

---

### Step 3: `apps/api/src/modules/vendor/service.ts`

#### 3a. Import Zod schemas

```typescript
import type { z } from 'zod';
import { VendorCreateSchema, VendorUpdateSchema } from '@brewform/shared/schemas';
```

#### 3b. Replace `data: any` in both functions

```typescript
export async function createVendor(
  userId: string,
  data: z.infer<typeof VendorCreateSchema>,
) { ... }

export async function updateVendor(
  userId: string,
  id: string,
  data: z.infer<typeof VendorUpdateSchema>,
  isAdmin: boolean = false,
) { ... }
```

#### 3c. Verify

```bash
make check-api
```

---

### Step 4: `apps/api/src/modules/admin/service.ts`

#### 4a. Import Zod schemas (prefer shared schemas over inline type literals)

```typescript
import type { z } from 'zod';
import {
  EquipmentUpdateSchema,
  VendorUpdateSchema,
  BrewMethodCompatibilityCreateSchema,
} from '@brewform/shared/schemas';
```

> `EquipmentUpdateSchema`, `VendorUpdateSchema`, and `BrewMethodCompatibilityCreateSchema` are all
> exported from `@brewform/shared/schemas` — use them directly rather than duplicating type
> definitions inline.

#### 4b. Replace `data: any` in `updateEquipment`

```typescript
export async function updateEquipment(
  adminId: string,
  id: string,
  data: z.infer<typeof EquipmentUpdateSchema>,
) { ... }
```

#### 4c. Replace `data: any` in `updateVendor`

```typescript
export async function updateVendor(
  adminId: string,
  id: string,
  data: z.infer<typeof VendorUpdateSchema>,
) { ... }
```

#### 4d. Replace `data: any` in `createCompatibilityRule`

```typescript
export async function createCompatibilityRule(
  adminId: string,
  data: z.infer<typeof BrewMethodCompatibilityCreateSchema>,
  cache: CacheProvider,
) { ... }
```

> **Do not** define a custom `CompatibilityRuleInput` interface — the shared schema already
> captures the exact shape.

#### 4e. Fix `// deno-lint-ignore-file require-await` and remove the file-level directive

The `require-await` directive exists because several pass-through async functions return a
promise without `await`-ing it (e.g. `listUsers`, `getUserDetail`). Fix by adding `await`:

```typescript
// Before
export async function listUsers(page: number, perPage: number, query?: string) {
  return model.listUsers(page, perPage, query);
}

// After — add await so deno-lint is satisfied
export async function listUsers(page: number, perPage: number, query?: string) {
  return await model.listUsers(page, perPage, query);
}
```

Apply `return await` to every pass-through async function that delegates directly to a model
method without any other `await` expressions in the body. After that, remove the file-level
`// deno-lint-ignore-file require-await` directive.

#### 4f. Verify

```bash
make check-api
```

---

### Step 5: `apps/api/src/modules/auth/service.ts`

#### 5a. Import `UserPreferences` and `User` from shared types

```typescript
import type { User, UserPreferences } from '@brewform/shared/types';
```

#### 5b. Fix the local `AuthUser` interface

Option A — minimal fix (keep the local interface, fix the `preferences` field):

```typescript
interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  passwordHash: string;
  isAdmin: boolean;
  isBanned: boolean;
  onboardingCompleted: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  preferences: UserPreferences | null;   // was: any
}
```

Option B — eliminate duplication by extending the shared `User` type:

```typescript
// User from @brewform/shared/types already has all fields except passwordHash
interface AuthUser extends Omit<User, 'preferences'> {
  passwordHash: string;
  preferences: UserPreferences | null;
}
```

Option B is preferred — it keeps `AuthUser` in sync with the shared `User` type automatically.

#### 5c. Fix `toAuthUser`

The parameter type `any` can be narrowed to `Record<string, unknown>` which is safe and prevents
widening the cast semantics:

```typescript
// Before
// deno-lint-ignore no-explicit-any
function toAuthUser(user: any): AuthUser {
  return user as AuthUser;
}

// After — remove both deno-lint-ignore comments
function toAuthUser(user: Record<string, unknown>): AuthUser {
  return user as unknown as AuthUser;
}
```

#### 5d. Remove both `// deno-lint-ignore no-explicit-any` comments

#### 5e. Verify

```bash
make check-api
```

---

### Step 6: `apps/api/src/modules/photo/service.ts`

#### 6a. Import the photos table type

```typescript
import { photos } from '@brewform/db/schema';
type PhotoInsert = typeof photos.$inferInsert;
```

> Use `$inferInsert` (current idiom) rather than the legacy `InferInsertModel<typeof photos>`.

#### 6b. Replace `} as any)` on `model.create`

```typescript
// Before
const photo = await model.create({
  recipeId,
  url,
  thumbnailUrl,
  alt: alt || null,
  sortOrder: sortOrder ?? 0,
} as any);

// After
const photo = await model.create({
  recipeId,
  url,
  thumbnailUrl,
  alt: alt || null,
  sortOrder: sortOrder ?? 0,
} satisfies Partial<PhotoInsert>);
```

> Use `satisfies` rather than a type assertion — it validates the object shape at the call site
> without widening the inferred type. If the model's `create` signature is already typed, you may
> be able to remove the annotation entirely; try without it first.

#### 6c. Remove `// deno-lint-ignore-file no-explicit-any` at the top of the file

#### 6d. Verify

```bash
make check-api
```

---

### Step 7: `apps/api/src/routes/sitemap.ts`

#### 7a. Type `_db` correctly

> ⚠️ **Critical correction from the original plan**: `db` from `@brewform/db` is a **value**, not
> a function. `ReturnType<typeof db>` is a type error because `db` is not callable.
>
> The correct fix is to import the type of `db` using `import type` (which does not affect the
> lazy-import pattern in `getDb()`):

```typescript
import type { db as DbType } from '@brewform/db';

// Before
let _db: any = null;

// After
let _db: typeof DbType | null = null;
```

The `import type` statement is erased at runtime, so the dynamic `await import('@brewform/db')`
inside `getDb()` is unaffected.

#### 7b. Verify

```bash
make check-api
```

---

## Testing Strategy

- **Type-check**: Run `make check-api` after each file edit — zero errors required.
- **Lint**: Run `make lint` — no new warnings, and reduced suppression count.
- **Unit tests**: Run `make test-api` to verify no behavioral regressions.
- **Manual smoke test**: Start dev server (`make dev`), create/update/delete recipes, verify API
  responses are unchanged.

---

## Risk Assessment

- **Low risk**: All changes are type-level only — no runtime behavior changes.
- **Migration risk**: None. No database or API contract changes.
- **Rollback**: Each file is an independent commit; revert any single file if issues arise.
- **Verification**: `make check-api` and `make test-api` provide full safety net.

---

## Summary of Changes vs. Original Plan

The following corrections were made based on live analysis of the `main` branch:

| Area | Original Plan | Correction |
|------|---------------|------------|
| `recipe/service.ts` `any` count | 13+ | 18+ (additional: `filters: any` ×2, `updateRecipe` params, `latestVersion: any`, `finalRecipe: any`, `(p: any)` callback) |
| `recipe/service.ts` `CompatibilityRule` | Suggested adding the interface | Already exists in the file — do not re-add |
| `recipe/service.ts` `brewMethod as any` | Not mentioned | New fix required: narrow to `(typeof brewMethodEnum.enumValues)[number]` |
| `recipe/service.ts` `$inferSelect` syntax | `InferSelectModel<typeof T>` (legacy) | `typeof T.$inferSelect` (current idiom) |
| `recipe/index.ts` lint directive | Suggested removing `deno-lint-ignore-file` | **No such directive exists** — nothing to remove |
| `admin/service.ts` `updateEquipment` type | Inline `{ name?: string; type?: string; ... }` literal | Use `z.infer<typeof EquipmentUpdateSchema>` (schema already exists) |
| `admin/service.ts` `createCompatibilityRule` | Suggested new `CompatibilityRuleInput` interface | Use `z.infer<typeof BrewMethodCompatibilityCreateSchema>` (schema already exists) |
| `photo/service.ts` insert type | `InferInsertModel<typeof photos>` (legacy) | `typeof photos.$inferInsert` (current idiom) |
| `sitemap.ts` `_db` type | `ReturnType<typeof import('@brewform/db').db>` | **Wrong** — `db` is a value not a function; correct: `import type { db as DbType } from '@brewform/db'; typeof DbType \| null` |
| `auth/service.ts` `AuthUser` | Minimal field fix | Prefer `interface AuthUser extends Omit<User, 'preferences'> { ... }` to avoid duplication |