## 1. Shared Constants — SSoT Tuple

- [x] 1.1 Create `packages/shared/src/constants/report-status.ts` with the following content:
  ```typescript
  /**
   * Report status enum — single source of truth.
   *
   * Consumed by:
   * - packages/db/src/schema.ts            — Drizzle pgEnum('report_status', …)
   * - packages/shared/src/schemas/report.ts — Zod z.enum(REPORT_STATUS_VALUES)
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

- [x] 1.2 In `packages/shared/src/constants/index.ts`, add the export after the `EQUIPMENT_DELETE_REQUEST_STATUS_VALUES` line (currently line 49):
  **Before** (end of pure-value tuples section):
  ```typescript
  export { EQUIPMENT_DELETE_REQUEST_STATUS_VALUES } from './equipment-delete-request.ts';
  ```
  **After**:
  ```typescript
  export { EQUIPMENT_DELETE_REQUEST_STATUS_VALUES } from './equipment-delete-request.ts';
  export { REPORT_STATUS_VALUES } from './report-status.ts';
  ```

## 2. Shared Schemas — Zod Alignment

- [x] 2.1 In `packages/shared/src/schemas/report.ts`, update the `ReportStatusEnum` definition to derive from `REPORT_STATUS_VALUES`:
  **Before** (lines 1–3):
  ```typescript
  import { z } from 'zod';

  const ReportStatusEnum = z.enum(['pending', 'reviewed', 'resolved', 'dismissed']);
  ```
  **After** (lines 1–5):
  ```typescript
  import { z } from 'zod';
  import { REPORT_STATUS_VALUES } from '../constants/index.ts';

  const ReportStatusEnum = z.enum(REPORT_STATUS_VALUES);
  ```

  > `ReportFilterSchema` on line ~41 already references `ReportStatusEnum` and requires no changes.

## 3. Tests — Enum Coverage

- [x] 3.1 In `packages/shared/src/constants/enums.test.ts`, add imports (alongside the existing `EquipmentDeleteRequestStatus` imports at line ~25):
  ```typescript
  import {
    REPORT_STATUS_VALUES,
    type ReportStatus,
  } from './report-status.ts';
  ```

- [x] 3.2 In the `'Standalone enum constants'` describe block (after the `EquipmentDeleteRequestStatus` test ~line 109), add:
  ```typescript
  it('ReportStatus covers every REPORT_STATUS_VALUES entry', () => {
    const set: Set<ReportStatus> = new Set(REPORT_STATUS_VALUES);
    expect(set.size).toBe(REPORT_STATUS_VALUES.length);
    for (const value of REPORT_STATUS_VALUES) {
      expect(set.has(value)).toBe(true);
    }
  });
  ```

## 4. Database Schema — pgEnum Migration

- [x] 4.1 In `packages/db/src/schema.ts`, add `REPORT_STATUS_VALUES` to the `@brewform/shared/constants` import block (lines 21–35). Insert between `EQUIPMENT_TYPE_VALUES` and `TEMPERATURE_UNIT_VALUES` (alphabetical order):
  **Before**:
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
    TEMPERATURE_UNIT_VALUES,
    THEME_VALUES,
    UNIT_SYSTEM_VALUES,
    VISIBILITY_VALUES,
  } from '@brewform/shared/constants';
  ```
  **After**:
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
    REPORT_STATUS_VALUES,
    TEMPERATURE_UNIT_VALUES,
    THEME_VALUES,
    UNIT_SYSTEM_VALUES,
    VISIBILITY_VALUES,
  } from '@brewform/shared/constants';
  ```

- [x] 4.2 Add `reportStatusEnum` to the main enums section (after `additionalPreparationTypeEnum`, before the `// Tables` divider comment). Insert after line 58:
  ```typescript
  export const reportStatusEnum = pgEnum('report_status', [...REPORT_STATUS_VALUES]);
  ```

- [x] 4.3 In the `reports` table definition (currently line 670), change the `status` column:
  **Before**:
  ```typescript
  status: varchar('status', { length: 50 }).notNull().default('pending'),
  ```
  **After**:
  ```typescript
  status: reportStatusEnum('status').notNull().default('pending'),
  ```

- [x] 4.4 Run `make db-generate` to generate the migration SQL

- [x] 4.5 Open the generated migration file in `packages/db/drizzle/` and verify it contains:
  ```sql
  CREATE TYPE "public"."report_status" AS ENUM('pending', 'reviewed', 'resolved', 'dismissed');
  ```
  and
  ```sql
  ALTER TABLE "report" ALTER COLUMN "status" TYPE "public"."report_status"
    USING "status"::"public"."report_status";
  ```

- [x] 4.6 Run `make db-migrate` to apply the migration

## 5. API Model Layer — Type-Cast Fixes

- [x] 5.1 In `apps/api/src/modules/report/model.ts` line 41, in the `findMany` function, add the type-cast:
  **Before**:
  ```typescript
  if (status) {
    where = eq(reports.status, status);
  }
  ```
  **After**:
  ```typescript
  if (status) {
    where = eq(reports.status, status as typeof reports.status._.data);
  }
  ```

- [x] 5.2 In `apps/api/src/modules/admin/model.ts` line 394, in the `listReports` function, add the type-cast:
  **Before**:
  ```typescript
  if (status) where = eq(reports.status, status);
  ```
  **After**:
  ```typescript
  if (status) where = eq(reports.status, status as typeof reports.status._.data);
  ```

## 6. API Routes — Validation Tightening

- [x] 6.1 In `apps/api/src/modules/admin/index.ts`, add `ReportFilterSchema` to the existing `@brewform/shared/schemas` import block (alphabetical order, between `PaginationSchema` and `TasteNoteCreateSchema`):
  ```typescript
  import {
    AdminBanUserSchema,
    AdminCreateUserSchema,
    AdminFlushCacheSchema,
    AdminModifyRecipeVisibilitySchema,
    AdminUpdateUserSchema,
    BrewMethodCompatibilityCreateSchema,
    BrewMethodCompatibilityUpdateSchema,
    CoffeeVarietyCategoryEnum,
    CoffeeVarietyCreateSchema,
    CoffeeVarietyUpdateSchema,
    EquipmentCreateSchema,
    EquipmentUpdateSchema,
    PaginationSchema,
    ReportFilterSchema,
    TasteNoteCreateSchema,
    TasteNoteUpdateSchema,
    VendorCreateSchema,
    VendorUpdateSchema,
  } from '@brewform/shared/schemas';
  ```

- [x] 6.2 Replace the `GET /reports` validator (currently ~line 402):
  **Before**:
  ```typescript
  zValidator(
    'query',
    PaginationSchema.extend({ status: z.string().optional(), entityType: z.string().optional() }),
  ),
  ```
  **After**:
  ```typescript
  zValidator(
    'query',
    ReportFilterSchema.extend({ entityType: z.string().optional() }),
  ),
  ```

- [x] 6.3 Verify `PaginationSchema` remains in the import — it is used by 7+ other routes in the file (users, recipes, equipment, vendors, audit logs, etc.). Do NOT remove it.

## 7. Verification

- [x] 7.1 Run `make check` — verify zero TypeScript errors across all workspaces

- [x] 7.2 If `admin/model.ts:473` (`eq(reports.status, 'pending')` in `getDashboardStats()`) causes a type error, apply the same cast pattern:
  ```typescript
  // Change from:
  db.select({ count: count() }).from(reports).where(eq(reports.status, 'pending')),
  // Change to:
  db.select({ count: count() }).from(reports).where(eq(reports.status, 'pending' as typeof reports.status._.data)),
  ```

- [x] 7.3 Run `make test` — all tests pass, including the new `ReportStatus` enum test

- [x] 7.4 Run `make lint` — zero lint errors

## 8. Pull Request

- [x] 8.1 Create `pr_description.md` in the project root (`/Users/arda.kilicdagi/projects/personal/BrewForm/pr_description.md`) with the following sections:
  - **Summary**: 2–3 sentences explaining the change
  - **Changes**: Bullet list of every file changed with a one-line description
  - **Migration**: Steps to apply the migration (`make db-generate && make db-migrate`)
  - **Verification**: Commands to run (`make check`, `make test`, `make lint`)
  - **Risk**: Low risk assessment with justification
  - **Breaking**: None

  > The old `pr_description.md` is left for reference but is unrelated to this task. Create the new file from scratch.
