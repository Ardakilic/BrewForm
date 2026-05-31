# D20 — Fix `report.status` to Use pgEnum Instead of varchar

**Severity:** Low  
**Status:** Open  
**File:** `packages/db/src/schema.ts:749`

---

## Issue Description

The `report.status` column is defined as `varchar('status', { length: 50 })` with a default of `'pending'`. This allows the database to accept any arbitrary string value (e.g., `"foo"`, `""`, `"PENDING"`), bypassing the intended business logic that restricts status to `pending | reviewed | resolved | dismissed`.

The Zod validation layer may enforce valid values at the API level, but the database itself has no constraint, creating a mismatch between application and database integrity.

---

## Impact

- **Data integrity:** Invalid status values can be inserted via direct DB access, migrations, or bugs in service code.
- **Query correctness:** `WHERE status = 'pending'` could miss `'PENDING'` or `'Pending'` if case varies.
- **No runtime error:** The application silently accepts invalid data at the DB level.

---

## Root Cause

The report table was created before the team established the pattern of using `pgEnum` for constrained string values. Other enums in the schema (`visibilityEnum`, `brewMethodEnum`, `drinkTypeEnum`, `emojiTagEnum`, etc.) all use `pgEnum`, but `status` was left as plain varchar.

---

## Affected Files

| File | Lines | Description |
|------|-------|-------------|
| `packages/db/src/schema.ts` | ~749 | `reports` table — `status` column definition |
| `packages/db/src/schema.ts` | ~1-50 | Enums section — new `reportStatusEnum` to add |

---

## Existing Pattern (Reference)

All other constrained string columns use `pgEnum`:

```typescript
// packages/db/src/schema.ts — existing enums
export const visibilityEnum = pgEnum('visibility', ['draft', 'private', 'unlisted', 'public']);
export const brewMethodEnum = pgEnum('brew_method', ['espresso_machine', 'v60', ...]);
export const drinkTypeEnum = pgEnum('drink_type', ['espresso', 'americano', ...]);
export const emojiTagEnum = pgEnum('emoji_tag', ['fire', 'rocket', ...]);
```

---

## Fix Approach

### 1. Create pgEnum

Add a new enum in the enums section of `schema.ts`:

```typescript
export const reportStatusEnum = pgEnum('report_status', [
  'pending',
  'reviewed',
  'resolved',
  'dismissed',
]);
```

### 2. Update Column Definition

Change the `status` column from:

```typescript
status: varchar('status', { length: 50 }).notNull().default('pending'),
```

to:

```typescript
status: reportStatusEnum('status').notNull().default('pending'),
```

### 3. Generate & Apply Migration

Use Drizzle's migration tooling (NO manual SQL):

```bash
make db-generate   # Creates migration SQL from schema diff
make db-migrate    # Applies the migration to the database
```

### Drizzle ORM Reference

From Context7 (`/drizzle-team/drizzle-orm-docs`):

```typescript
import { pgEnum } from 'drizzle-orm/pg-core';

const statusEnum = pgEnum('status', ['active', 'inactive', 'archived']);

const table = pgTable('posts', {
  status: statusEnum('status').notNull().default('active'),
});
```

---

## Implementation Steps

1. **Read** `packages/db/src/schema.ts` — locate the enums section (~lines 1-50) and the reports table (~line 749).
2. **Add** `reportStatusEnum` in the enums section, after the existing enums.
3. **Update** the `status` column to use `reportStatusEnum('status')` instead of `varchar('status', { length: 50 })`.
4. **Run** `make db-generate` — Drizzle generates the migration SQL (ALTER TYPE + data conversion).
5. **Run** `make db-migrate` — applies the migration.
6. **Verify** the migration SQL is correct (should be an `ALTER TABLE ... ALTER COLUMN ... TYPE ...` with a `USING` clause to cast existing data).
7. **Run** `make check` — type-check all workspaces.
8. **Run** `make test` — all tests pass.

---

## Testing Strategy

| Test | Expected |
|------|----------|
| Insert report with `status: 'pending'` | Success |
| Insert report with `status: 'invalid'` | DB-level error (enum constraint violation) |
| Existing data with `status = 'pending'` | Unchanged after migration |
| Application code using string literals | No changes needed (TypeScript type narrows automatically) |

---

## Risk Assessment

**Risk: Low**

- Enum values match existing valid values exactly.
- Drizzle handles the migration SQL including data casting.
- Application code already validates these values via Zod schemas.
- No API changes required — the TypeScript type will narrow from `string` to the enum union automatically.

---

## Dependencies

- None. Standalone schema improvement.
