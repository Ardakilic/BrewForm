# D20 — Fix `report.status` to Use pgEnum Instead of varchar

**Severity:** Low
**Status:** Open (plan corrected after live-code validation)
**File:** `packages/db/src/schema.ts:670` *(was incorrectly listed as line 749)*

---

## Validation Notes (corrections vs. original plan)

Four issues were found during live-code validation against the current `main` branch:

1. **Wrong line number.** The original plan cited `schema.ts:749`. The `reports` table definition starts at line 662; the `status` column is at line 670.

2. **Critical pattern violation — single source of truth ignored.** The original fix proposed hardcoding the enum values as literals directly in `schema.ts`. The codebase explicitly does not do this. Every other constrained-string enum follows a three-layer SSoT chain: a `THING_VALUES` `as const` tuple in `@brewform/shared/constants/` → exported from `constants/index.ts` → imported by `schema.ts` and spread into `pgEnum(...)`. The identical pattern exists for the closest analogue, `equipmentDeleteRequestStatusEnum` (see `packages/shared/src/constants/equipment-delete-request.ts`). The `reportStatusEnum` must follow the same pattern.

3. **Missing Zod schema alignment.** `packages/shared/src/schemas/report.ts` line 4 defines `ReportStatusEnum` with hardcoded string literals. It must be updated to derive from the new `REPORT_STATUS_VALUES` constant, as all other Zod enum schemas do (e.g. `badge.ts`, `recipe.ts`, `equipment.ts`).

4. **Missing TypeScript type-cast fixes — `make check` will fail without them.** Two model functions use `eq(reports.status, status)` where `status` is typed as `string | undefined` or `string | undefined`. Once `reports.status` becomes a pgEnum column its inferred TypeScript type narrows from `string` to `'pending' | 'reviewed' | 'resolved' | 'dismissed'`, making those calls a type error. The existing fix pattern (used at `admin/model.ts:636` for `equipmentDeleteRequests`) is `status as typeof reports.status._.data`.

---

## Issue Description

The `report.status` column is defined as `varchar('status', { length: 50 })` with a default of `'pending'`. This allows the database to accept any arbitrary string value (`"foo"`, `""`, `"PENDING"`), bypassing the intended business logic that restricts status to `pending | reviewed | resolved | dismissed`.

The Zod validation layer enforces valid values at the API level, but the database itself has no constraint, creating a mismatch between application and database integrity.

---

## Impact

- **Data integrity:** Invalid status values can be inserted via direct DB access, migrations, or bugs in service code.
- **Query correctness:** `WHERE status = 'pending'` could miss `'PENDING'` or `'Pending'` if case varies.
- **No runtime error:** The application silently accepts invalid data at the DB level.

---

## Root Cause

The `reports` table predates the team's pattern of using `pgEnum` for constrained string values. Other status-like enums in the schema (`equipmentDeleteRequestStatusEnum`, `visibilityEnum`, `brewMethodEnum`, etc.) all use `pgEnum` backed by a `@brewform/shared/constants` tuple. `report.status` was left as plain varchar.

---

## Affected Files

| File | Lines | Description |
|------|-------|-------------|
| `packages/shared/src/constants/report-status.ts` | new file | `REPORT_STATUS_VALUES` tuple + `ReportStatus` type |
| `packages/shared/src/constants/index.ts` | ~49 | Export `REPORT_STATUS_VALUES` and `ReportStatus` |
| `packages/shared/src/constants/enums.test.ts` | ~110 | Add coverage test for `ReportStatus` |
| `packages/shared/src/schemas/report.ts` | 2–4 | Import `REPORT_STATUS_VALUES`; derive `ReportStatusEnum` from it |
| `packages/db/src/schema.ts` | 21–35, 55–58, 670 | Add import; add `reportStatusEnum`; update column |
| `apps/api/src/modules/report/model.ts` | 41 | Type-cast `status` in `eq()` call |
| `apps/api/src/modules/admin/model.ts` | 395 | Type-cast `status` in `eq()` call |
| `apps/api/src/modules/admin/index.ts` | 402 | Tighten status validator from `z.string()` to `ReportStatusEnum` |

---

## Existing Pattern (Reference)

All other constrained-string columns follow a three-layer SSoT chain. The closest analogue is `equipmentDeleteRequestStatusEnum`:

**Layer 1 — `packages/shared/src/constants/equipment-delete-request.ts`**
```typescript
export const EQUIPMENT_DELETE_REQUEST_STATUS_VALUES = [
  'pending',
  'approved',
  'rejected',
] as const;

export type EquipmentDeleteRequestStatus =
  typeof EQUIPMENT_DELETE_REQUEST_STATUS_VALUES[number];
```

**Layer 2 — `packages/shared/src/constants/index.ts`**
```typescript
export { EQUIPMENT_DELETE_REQUEST_STATUS_VALUES } from './equipment-delete-request.ts';
```

**Layer 3 — `packages/db/src/schema.ts`**
```typescript
// imports block
import { EQUIPMENT_DELETE_REQUEST_STATUS_VALUES } from '@brewform/shared/constants';

// enums section
export const equipmentDeleteRequestStatusEnum = pgEnum(
  'equipment_delete_request_status',
  [...EQUIPMENT_DELETE_REQUEST_STATUS_VALUES],
);

// table
status: equipmentDeleteRequestStatusEnum('status').notNull().default('pending'),
```

**Type-cast pattern for model functions (when `status` parameter is `string`):**
```typescript
// admin/model.ts:636 — existing pattern for equipmentDeleteRequests
eq(equipmentDeleteRequests.status, status as typeof equipmentDeleteRequests.status._.data)
```

---

## Fix Approach

### Step 1 — Create `packages/shared/src/constants/report-status.ts` (new file)

```typescript
/**
 * Report status enum — single source of truth.
 *
 * Consumed by:
 * - `packages/db/src/schema.ts`      — Drizzle `pgEnum('report_status', …)`
 * - `packages/shared/src/schemas/report.ts` — Zod `z.enum(REPORT_STATUS_VALUES)`
 */
export const REPORT_STATUS_VALUES = [
  'pending',
  'reviewed',
  'resolved',
  'dismissed',
] as const;

/** Lifecycle status of a content report submitted by a user. */
export type ReportStatus = typeof REPORT_STATUS_VALUES[number];
```

### Step 2 — Update `packages/shared/src/constants/index.ts`

Add the export after `EQUIPMENT_DELETE_REQUEST_STATUS_VALUES` (line ~48):

```typescript
export { EQUIPMENT_DELETE_REQUEST_STATUS_VALUES } from './equipment-delete-request.ts';
export { REPORT_STATUS_VALUES } from './report-status.ts';          // ← add
```

To also export the TypeScript type (following the `EquipmentDeleteRequestStatus` precedent), add under the types barrel section at the bottom, or expose it via `@brewform/shared/types` if a `Report` type is added later. For now the constants barrel export is sufficient since only the DB and Zod schemas need it.

### Step 3 — Update `packages/db/src/schema.ts`

**3a. Add `REPORT_STATUS_VALUES` to the shared-constants import (lines 21–35):**

```typescript
import {
  ADDITIONAL_PREPARATION_TYPE_VALUES,
  BADGE_RULE_VALUES,
  BREW_METHOD_VALUES,
  COFFEE_VARIETY_CATEGORY_VALUES,
  DATE_FORMAT_VALUES,
  DRINK_TYPE_VALUES,
  EMOJI_TAG_VALUES,
  EQUIPMENT_DELETE_REQUEST_STATUS_VALUES,
  EQUIPMENT_TYPE_VALUES,
  REPORT_STATUS_VALUES,                    // ← add
  TEMPERATURE_UNIT_VALUES,
  THEME_VALUES,
  UNIT_SYSTEM_VALUES,
  VISIBILITY_VALUES,
} from '@brewform/shared/constants';
```

**3b. Add `reportStatusEnum` to the enums section (after line 58, i.e. after `additionalPreparationTypeEnum`):**

```typescript
export const additionalPreparationTypeEnum = pgEnum(
  'additional_preparation_type',
  [...ADDITIONAL_PREPARATION_TYPE_VALUES],
);
export const reportStatusEnum = pgEnum('report_status', [...REPORT_STATUS_VALUES]); // ← add
```

**3c. Replace the `status` column on the `reports` table (line 670):**

Change from:
```typescript
status: varchar('status', { length: 50 }).notNull().default('pending'),
```

to:
```typescript
status: reportStatusEnum('status').notNull().default('pending'),
```

### Step 4 — Update `packages/shared/src/schemas/report.ts`

Change from:
```typescript
const ReportStatusEnum = z.enum(['pending', 'reviewed', 'resolved', 'dismissed']);
```

to:
```typescript
import { REPORT_STATUS_VALUES } from '../constants/index.ts';

const ReportStatusEnum = z.enum(REPORT_STATUS_VALUES);
```

The rest of `report.ts` is unchanged — `ReportFilterSchema` already references `ReportStatusEnum` and will automatically reflect the new source.

### Step 5 — Fix TypeScript type errors in model functions

**`apps/api/src/modules/report/model.ts` — line 41:**

Change from:
```typescript
where = eq(reports.status, status);
```

to:
```typescript
where = eq(reports.status, status as typeof reports.status._.data);
```

**`apps/api/src/modules/admin/model.ts` — line 395:**

Change from:
```typescript
if (status) where = eq(reports.status, status);
```

to:
```typescript
if (status) where = eq(reports.status, status as typeof reports.status._.data);
```

### Step 6 — Tighten admin route status validator

`apps/api/src/modules/admin/index.ts` line 402 uses `z.string().optional()` for `status`. The user-facing `GET /report` route correctly uses `ReportFilterSchema` (which constrains status to the enum). The admin route should match.

Add `ReportFilterSchema` to the import from `@brewform/shared/schemas` (it is already exported there), then replace the inline query validator:

```typescript
// At the top of the file, add to the existing @brewform/shared/schemas import:
import {
  // ... existing imports ...
  ReportFilterSchema,           // ← add
} from '@brewform/shared/schemas';

// Route validator (lines 400–403) — change from:
zValidator(
  'query',
  PaginationSchema.extend({ status: z.string().optional(), entityType: z.string().optional() }),
),

// to:
zValidator(
  'query',
  ReportFilterSchema.extend({ entityType: z.string().optional() }),
),
```

> **Note:** `ReportFilterSchema` already includes `page`, `perPage`, and `status: ReportStatusEnum.optional()`, so the only addition is `entityType`. Remove the now-redundant `PaginationSchema.extend(...)` for this route.

### Step 7 — Add enum coverage test

In `packages/shared/src/constants/enums.test.ts`, add to the `'Standalone enum constants'` describe block (after the `EquipmentDeleteRequestStatus` test ~line 109):

```typescript
import {
  REPORT_STATUS_VALUES,
  type ReportStatus,
} from './report-status.ts';

// inside 'Standalone enum constants' describe block:
it('ReportStatus covers every REPORT_STATUS_VALUES entry', () => {
  const set: Set<ReportStatus> = new Set(REPORT_STATUS_VALUES);
  expect(set.size).toBe(REPORT_STATUS_VALUES.length);
  for (const value of REPORT_STATUS_VALUES) {
    expect(set.has(value)).toBe(true);
  }
});
```

### Step 8 — Generate and apply migration

Use Drizzle's migration tooling (NO manual SQL):

```bash
make db-generate   # Drizzle diffs schema → creates migration SQL
make db-migrate    # Applies migration to the database
```

The generated SQL will resemble:

```sql
CREATE TYPE "public"."report_status" AS ENUM('pending', 'reviewed', 'resolved', 'dismissed');
ALTER TABLE "report" ALTER COLUMN "status" TYPE "public"."report_status"
  USING "status"::"public"."report_status";
```

Verify the generated migration file contains a `USING` clause to cast existing `varchar` data into the new enum type. Drizzle generates this automatically.

---

## Implementation Steps

1. **Create** `packages/shared/src/constants/report-status.ts` with `REPORT_STATUS_VALUES` tuple and `ReportStatus` type (Step 1).
2. **Update** `packages/shared/src/constants/index.ts` — add `REPORT_STATUS_VALUES` export (Step 2).
3. **Update** `packages/shared/src/schemas/report.ts` — import `REPORT_STATUS_VALUES`; derive `ReportStatusEnum` from it (Step 4).
4. **Add** enum test to `packages/shared/src/constants/enums.test.ts` (Step 7).
5. **Update** `packages/db/src/schema.ts` — add import, add `reportStatusEnum` to enums section, update column definition (Step 3).
6. **Fix** type errors in `apps/api/src/modules/report/model.ts` and `apps/api/src/modules/admin/model.ts` (Step 5).
7. **Tighten** admin route validator in `apps/api/src/modules/admin/index.ts` (Step 6).
8. **Run** `make db-generate` — verify generated SQL includes `USING` cast clause.
9. **Run** `make db-migrate` — applies the migration.
10. **Run** `make check` — must pass with zero type errors.
11. **Run** `make test` — all tests pass.

---

## Testing Strategy

| Test | Expected |
|------|----------|
| Insert report with `status: 'pending'` | Success |
| Insert report with `status: 'invalid'` | DB-level error (enum constraint violation) |
| Existing data with `status = 'pending'` | Unchanged after migration |
| `make check` | Zero TypeScript errors across all workspaces |
| `REPORT_STATUS_VALUES` enum test | Passes immediately |
| `ReportFilterSchema.safeParse({ status: 'invalid' })` | `success: false` (already true; alignment confirmed) |

---

## Risk Assessment

**Risk: Low**

- Enum values exactly match the existing valid `varchar` values; no data loss.
- Drizzle generates the `USING` cast clause automatically.
- Application code already validates these values via Zod schemas.
- The only application-layer change is two `as` type-casts in model functions and an import in the schemas file — no logic changes.

---

## Dependencies

- None. Standalone schema improvement.