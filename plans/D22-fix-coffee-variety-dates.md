# D22 — Fix `CoffeeVariety` Type Date Fields

**Severity:** Low  
**Status:** Open  
**File:** `packages/shared/src/types/coffee-variety.ts:34-36`

---

## Issue Description

The `CoffeeVariety` TypeScript interface types `createdAt`, `updatedAt`, and `deletedAt` as `string` and `string | null` respectively. This is inconsistent with every other entity type in the codebase, which uses `Date` and `Date | null` for timestamp fields.

```typescript
// Current (incorrect):
createdAt: string;
updatedAt: string;
deletedAt: string | null;

// Expected (consistent with other types):
createdAt: Date;
updatedAt: Date;
deletedAt: Date | null;
```

---

## Impact

- **Type safety:** Consumers cannot call Date methods (`.getTime()`, `.toISOString()`) without casting.
- **Inconsistency:** Other entity types (`Recipe`, `RecipeVersion`, `User`, etc.) all use `Date`.
- **Potential bugs:** Code comparing `createdAt` with `new Date()` may behave unexpectedly with string comparison.

---

## Root Cause

The `CoffeeVariety` type was likely generated or written manually before the team established the convention of using `Date` for timestamp fields. It was never corrected.

---

## Affected Files

| File | Lines | Description |
|------|-------|-------------|
| `packages/shared/src/types/coffee-variety.ts` | 34-36 | `createdAt`, `updatedAt`, `deletedAt` type definitions |

---

## Fix Approach

Change the three date fields from `string`/`string | null` to `Date`/`Date | null`.

### Drizzle ORM Context

From Context7 (`/drizzle-team/drizzle-orm-docs`):

Drizzle's `timestamp` columns infer as `Date` by default when using `.$inferInsert` and `.$inferSelect`. The shared type should match this inference.

---

## Implementation Steps

1. **Read** `packages/shared/src/types/coffee-variety.ts` — confirm the current type definition.
2. **Change** the three fields:
   ```typescript
   createdAt: Date;
   updatedAt: Date;
   deletedAt: Date | null;
   ```
3. **Search for consumers** that may rely on string type:
   ```bash
   grep -r "CoffeeVariety" packages/shared/src/ apps/web/src/ apps/api/src/
   ```
4. **Check** if any code calls `.toString()`, template literal interpolation, or string methods on these fields.
5. **Fix** any consumers that break (unlikely — most code already treats them as Date-compatible).
6. **Run** `make check` — type-check all workspaces.
7. **Run** `make test` — all tests pass.

---

## Testing Strategy

| Test | Expected |
|------|----------|
| TypeScript compilation | No type errors |
| `new Date(coffeeVariety.createdAt)` | No double-conversion needed |
| Template literal `${coffeeVariety.createdAt}` | Calls `.toISOString()` implicitly |
| Comparison with `Date` objects | Works correctly |

---

## Risk Assessment

**Risk: Low**

- Type-only change in shared package.
- Drizzle already returns `Date` objects from timestamp columns.
- If any consumer was doing `new Date(stringDate)`, it will now receive a `Date` directly (may cause double-conversion — check for this).
- Fix is straightforward with clear type errors guiding corrections.

---

## Dependencies

- None. Standalone type fix.
