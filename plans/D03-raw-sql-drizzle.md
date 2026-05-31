# D03: Raw SQL in Equipment Model

**Severity:** Critical — Security & Maintainability  
**Date:** 2026-05-29  
**Status:** Proposed  
**Module:** `apps/api/src/modules/equipment/model.ts`

---

## Issue Description

The `getRecipesUsingEquipment()` function at `apps/api/src/modules/equipment/model.ts:103` uses raw SQL via the `sql` template tag to perform a subquery:

```ts
sql`${recipes.currentVersionId} IN (
  SELECT re.recipe_version_id FROM recipe_equipment re
  WHERE re.equipment_id = ${equipmentId}
)`,
```

This violates the project's **"No raw SQL" rule** (AGENTS.md: "No raw SQL — Drizzle ORM only. No JSONB/UUID columns. No Postgres-specific operators."). It bypasses Drizzle's type safety, escape protection, and query builder guarantees.

## Impact

- **Security:** Raw SQL interpolation, even with Drizzle's `sql` tag, is a potential SQL injection vector if parameters are mishandled.
- **Type safety:** The raw SQL string has no compile-time type checking — column renames or schema changes will silently break.
- **Maintainability:** Raw SQL is opaque to developers unfamiliar with the schema; Drizzle queries are self-documenting.
- **Consistency:** All other queries in the codebase use Drizzle query builder; this is the sole exception.

## Root Cause

The query requires checking if a recipe's `currentVersionId` exists in a set of `recipe_version_id` values from the `recipe_equipment` table. The developer chose raw SQL for the subquery instead of using Drizzle's `exists()` or `inArray()` utilities.

The count query on line 112-122 uses proper Drizzle joins, making the raw SQL on line 103 even more inconsistent.

## Affected Files

| File | Change |
|------|--------|
| `apps/api/src/modules/equipment/model.ts:89-125` | Rewrite `getRecipesUsingEquipment` using Drizzle query builder |

## Fix Approach

### Option A: Use `exists()` with a correlated subquery (Recommended)

Drizzle's `exists()` function wraps a subquery and returns a boolean SQL expression:

```ts
import { exists } from 'drizzle-orm';

export async function getRecipesUsingEquipment(
  equipmentId: string,
  page: number,
  perPage: number,
) {
  const offset = (page - 1) * perPage;

  const equipmentSubquery = db
    .select({ recipeVersionId: recipeEquipment.recipeVersionId })
    .from(recipeEquipment)
    .where(eq(recipeEquipment.equipmentId, equipmentId))
    .as('equipment_subquery');

  const [data, countResult] = await Promise.all([
    db.query.recipes.findMany({
      with: {
        author: { columns: { username: true, displayName: true, avatarUrl: true } },
      },
      where: and(
        eq(recipes.visibility, 'public'),
        isNull(recipes.deletedAt),
        exists(
          db.select()
            .from(equipmentSubquery)
            .where(eq(equipmentSubquery.recipeVersionId, recipes.currentVersionId)),
        ),
      ),
      orderBy: desc(recipes.createdAt),
      limit: perPage,
      offset,
    }),
    db.select({ count: sql<number>`count(distinct ${recipes.id})` })
      .from(recipes)
      .innerJoin(recipeVersions, eq(recipes.currentVersionId, recipeVersions.id))
      .innerJoin(recipeEquipment, eq(recipeVersions.id, recipeEquipment.recipeVersionId))
      .where(
        and(
          eq(recipeEquipment.equipmentId, equipmentId),
          eq(recipes.visibility, 'public'),
          isNull(recipes.deletedAt),
        ),
      ),
  ]);
  return { data, total: Number(countResult[0]?.count ?? 0) };
}
```

### Option B: Use `inArray()` with a subquery

```ts
import { inArray } from 'drizzle-orm';

// Build the subquery as an array of version IDs
const versionIds = db
  .select({ recipeVersionId: recipeEquipment.recipeVersionId })
  .from(recipeEquipment)
  .where(eq(recipeEquipment.equipmentId, equipmentId));

// Use inArray in the where clause
where: and(
  eq(recipes.visibility, 'public'),
  isNull(recipes.deletedAt),
  inArray(recipes.currentVersionId, versionIds),
),
```

**Recommendation:** Option A (`exists()`) is preferred because:
1. `EXISTS` is semantically correct (checking existence, not membership)
2. PostgreSQL optimizes `EXISTS` better than `IN` for correlated subqueries
3. The subquery is evaluated per-row, which matches the logical intent

### Import Updates

Ensure the import line includes `exists` (or `inArray`):
```ts
import { and, asc, count, desc, eq, exists, isNull, like, or, SQL, sql } from 'drizzle-orm';
```

## Testing Strategy

### Query Equivalence Test

Verify the rewritten query returns identical results to the raw SQL version:

```ts
it('should return same results as raw SQL version', async () => {
  // Seed: create equipment, recipes with versions, recipe_equipment links
  // Run the new Drizzle query
  // Compare results against expected set
});
```

### Existing Tests

Run the existing equipment model tests to verify no regression:
```bash
make test-specific filter=apps/api/src/modules/equipment
```

### Verification

```bash
make check    # Type-check passes — Drizzle query is fully typed
make lint     # Lint passes
make test     # All tests pass
```

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `exists()` subquery syntax differs from raw SQL | Low | Medium | Test with actual DB; Drizzle's `exists()` is well-documented |
| Performance regression | Very Low | Low | `EXISTS` is equivalent or better than `IN` for correlated subqueries |
| Drizzle version incompatibility | Very Low | Low | Check `jsr:@drizzle-team/drizzle-orm` version supports `exists()` |

## Dependencies

- Drizzle ORM `exists()` function (available in current version)
- No new packages required
- Reference: [Context7 — Drizzle ORM exists subquery](/drizzle-team/drizzle-orm-docs)
