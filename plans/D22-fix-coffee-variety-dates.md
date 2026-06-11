# D22 — Fix `CoffeeVariety` Type Date Fields

**Severity:** Low  
**Status:** Open  
**File:** `packages/shared/src/types/coffee-variety.ts:43-45`

---

## Issue Description

The `CoffeeVariety` TypeScript interface types `createdAt`, `updatedAt`, and `deletedAt` as
`string` and `string | null` respectively. This is inconsistent with every other entity type in the
codebase (13 shared type files audited), all of which use `Date` and `Date | null` for timestamp
fields.

```typescript
// Current (incorrect) — lines 43-45:
createdAt: string;
updatedAt: string;
deletedAt: string | null;

// Expected (consistent with all other entity types):
createdAt: Date;
updatedAt: Date;
deletedAt: Date | null;
```

`coffee-variety.ts` is the **sole outlier** across the entire shared types layer. Every other shared
type that carries timestamp fields (`audit.ts`, `badge.ts`, `bean.ts`, `brew-method-rule.ts`,
`comment.ts`, `equipment.ts`, `follow.ts`, `password-reset.ts`, `photo.ts`, `recipe.ts`,
`setup.ts`, `taste.ts`, `user.ts`) already uses `Date`.

---

## Impact

- **Type safety:** Future consumers of `CoffeeVariety` cannot call Date methods
  (`.getTime()`, `.toISOString()`) on these fields without a cast.
- **Inconsistency:** Breaks the established convention across the shared package.
- **No active runtime impact:** As of validation, no web component or API module imports and
  accesses `.createdAt` / `.updatedAt` / `.deletedAt` on a `CoffeeVariety`-typed value. Web pages
  that render coffee variety data define their own local interfaces that omit date fields entirely.
  The API service layer uses `typeof coffeeVarieties.$inferSelect` (Drizzle's own type) rather than
  the shared `CoffeeVariety` interface. This makes the fix a **forward-consistency correction**
  rather than an active bug fix.

---

## Root Cause

The `CoffeeVariety` type was written before the team established the `Date` convention for
timestamp fields (or was simply overlooked), and was never corrected.

---

## Drizzle ORM Context

The `coffeeVarieties` table in `packages/db/src/schema.ts` uses standard `timestamp()` columns
without specifying `mode: "string"`:

```typescript
createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
deletedAt: timestamp('deleted_at', { withTimezone: true }),
```

Drizzle's `timestamp` without an explicit mode defaults to `mode: "date"`, so `$inferSelect` yields
`Date` (not null) for `createdAt` and `updatedAt`, and `Date | null` for `deletedAt`. The shared
type should match this inference.

---

## Affected Files

| File | Lines | Description |
|------|-------|-------------|
| `packages/shared/src/types/coffee-variety.ts` | 43-45 | `createdAt`, `updatedAt`, `deletedAt` type definitions |

---

## Fix Approach

Change the three date fields from `string`/`string | null` to `Date`/`Date | null`.

### Implementation Steps

1. **Read** `packages/shared/src/types/coffee-variety.ts` — confirm current type at lines 43-45.

2. **Change** the three fields:
   ```typescript
   createdAt: Date;
   updatedAt: Date;
   deletedAt: Date | null;
   ```

3. **Verify no consumer accesses date fields on `CoffeeVariety`-typed values.** Run a targeted
   grep for the three specific field names scoped to typed usages — the broad `CoffeeVariety`
   pattern returns many false positives (schema imports, Zod schema exports, category enum usages):
   ```bash
   grep -rn "\.createdAt\|\.updatedAt\|\.deletedAt" \
     packages/shared/src/ apps/web/src/ apps/api/src/ \
     --include="*.ts" --include="*.tsx"
   ```
   Any result on a `CoffeeVariety`-typed variable would require follow-up. As of validation, none
   exist.

4. **Run** `make check` — type-checks all workspaces (api, web, db, shared).

5. **Run** `make test` — all tests pass.

---

## Testing Strategy

| Test | Expected |
|------|----------|
| TypeScript compilation (`make check`) | No type errors across all workspaces |
| Unit tests (`make test`) | All suites green — no logic is affected by this type-only change |

---

## Risk Assessment

**Risk: Very Low**

- Pure type-only change; no runtime behaviour is modified.
- No current consumer in the codebase accesses `.createdAt`, `.updatedAt`, or `.deletedAt` on a
  value typed as `CoffeeVariety` from the shared package, so there is no breaking change to fix up.
- Drizzle already returns `Date` objects from timestamp columns in `mode: "date"` (the default).
  Any future consumer that receives data directly from the model layer will receive a `Date` and
  the corrected type will match without conversion.
- If a future consumer ever did `new Date(variety.createdAt)`, that would now be a type error
  (double-conversion). The type error is the correct signal — the fix is to remove the redundant
  `new Date(...)` wrapper.

---

## Dependencies

- None. Standalone type fix in the shared package.