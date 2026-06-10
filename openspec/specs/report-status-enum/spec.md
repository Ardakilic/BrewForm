# report-status-enum Specification

## Purpose
Promote the `report.status` column from an unrestricted `varchar(50)` to a database-level `pgEnum` backed by the `REPORT_STATUS_VALUES` const tuple in `packages/shared/src/constants/report-status.ts`, so the database schema (Drizzle `pgEnum`), the Zod validator (`z.enum(REPORT_STATUS_VALUES)`), and the TypeScript union (`ReportStatus`) all share a single source of truth — matching the three-layer pattern already established by every other constrained status column (`equipmentDeleteRequests.status`, `recipes.visibility`, `recipes.brewMethod`, etc.). The migration at `packages/db/drizzle/0004_sour_peter_quill.sql` converts existing data in place using a `USING "status"::"report_status"` cast, and the admin `GET /api/v1/admin/reports` route now validates `?status=…` against `ReportStatusEnum` instead of accepting any string.
## Requirements
### Requirement: Report status values are defined as a single-source-of-truth constant tuple
The system SHALL define `REPORT_STATUS_VALUES` as a const tuple of `['pending', 'reviewed', 'resolved', 'dismissed']` in `packages/shared/src/constants/report-status.ts`. The tuple SHALL be the single source of truth consumed by the database schema (Drizzle `pgEnum`), Zod validation (`z.enum`), and TypeScript type derivations. The file SHALL also export a derived `ReportStatus` type.

The file content SHALL be:
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

#### Scenario: Constant tuple contains all valid status values
- **WHEN** the `REPORT_STATUS_VALUES` tuple is inspected
- **THEN** it contains exactly `['pending', 'reviewed', 'resolved', 'dismissed']` as const

#### Scenario: ReportStatus type covers all tuple entries
- **WHEN** the `ReportStatus` type is derived from `typeof REPORT_STATUS_VALUES[number]`
- **THEN** `Set<ReportStatus>` has the same size as `REPORT_STATUS_VALUES.length`

### Requirement: REPORT_STATUS_VALUES is exported from the constants barrel
The `packages/shared/src/constants/index.ts` barrel file SHALL re-export `REPORT_STATUS_VALUES` from `./report-status.ts`, placed after the `EQUIPMENT_DELETE_REQUEST_STATUS_VALUES` export as the last entry in the pure-value tuples section.

#### Scenario: REPORT_STATUS_VALUES is importable from the barrel
- **WHEN** code imports `{ REPORT_STATUS_VALUES } from '@brewform/shared/constants'`
- **THEN** the import resolves to the tuple defined in `report-status.ts`

### Requirement: Zod ReportStatusEnum derives from the SSoT constant
The Zod schema `ReportStatusEnum` in `packages/shared/src/schemas/report.ts` at line 3 SHALL be changed from hardcoded string literals to `z.enum(REPORT_STATUS_VALUES)`. An import for `REPORT_STATUS_VALUES` from `../constants/index.ts` SHALL be added.

#### Scenario: Zod enum rejects invalid status value
- **WHEN** `ReportStatusEnum.safeParse('invalid')` is called
- **THEN** the result is `success: false`

#### Scenario: Zod enum accepts all valid status values
- **WHEN** `ReportStatusEnum.safeParse(value)` is called for each value in `REPORT_STATUS_VALUES`
- **THEN** each result is `success: true`

### Requirement: Database has a report_status pgEnum backed by the SSoT tuple
`packages/db/src/schema.ts` SHALL define `reportStatusEnum` as `pgEnum('report_status', [...REPORT_STATUS_VALUES])` in the main enums section (after `additionalPreparationTypeEnum`, before the `// Tables` divider comment). `REPORT_STATUS_VALUES` SHALL be added to the `@brewform/shared/constants` import block between `EQUIPMENT_TYPE_VALUES` and `TEMPERATURE_UNIT_VALUES` (alphabetical order).

#### Scenario: reportStatusEnum is defined in the enums section
- **WHEN** `packages/db/src/schema.ts` is inspected
- **THEN** `reportStatusEnum` is defined in the main enums block (lines ~37–58) with the spread pattern `[...REPORT_STATUS_VALUES]`

### Requirement: Database report.status column uses pgEnum with enum constraint
The `reports.status` column in the `reports` table definition SHALL be defined as `reportStatusEnum('status').notNull().default('pending')`. The previous `varchar('status', { length: 50 }).notNull().default('pending')` definition SHALL be replaced.

#### Scenario: Inserting a report with a valid status succeeds
- **WHEN** a report is inserted with `status: 'pending'`, `'reviewed'`, `'resolved'`, or `'dismissed'`
- **THEN** the insert succeeds without error

#### Scenario: Inserting a report with an invalid status fails at the database level
- **WHEN** a report is inserted with `status: 'invalid'` via direct SQL
- **THEN** PostgreSQL rejects the insert with an enum constraint violation error

#### Scenario: Migration preserves existing data
- **WHEN** the generated migration is applied
- **THEN** existing report rows with valid status values are preserved without modification
- **AND** the migration SQL contains a `USING "status"::"report_status"` cast clause

### Requirement: Model functions with string-typed status parameters use type-casts
Model functions in `apps/api/src/modules/report/model.ts` (`findMany`) and `apps/api/src/modules/admin/model.ts` (`listReports`) that pass a `status` parameter typed as `string | undefined` to `eq(reports.status, status)` SHALL cast the parameter as `status as typeof reports.status._.data` to satisfy TypeScript after the column type narrows to the pgEnum union.

#### Scenario: findMany function type-checks with string status parameter
- **WHEN** `make check` is run
- **THEN** `apps/api/src/modules/report/model.ts` has zero type errors

#### Scenario: listReports function type-checks with optional string status parameter
- **WHEN** `make check` is run
- **THEN** `apps/api/src/modules/admin/model.ts` has zero type errors

### Requirement: Admin report listing route validates status against the enum
The admin `GET /reports` route in `apps/api/src/modules/admin/index.ts` SHALL validate the `status` query parameter using `ReportFilterSchema` (which constrains status to `ReportStatusEnum`) instead of a bare `z.string()`. `ReportFilterSchema` SHALL be added to the existing `@brewform/shared/schemas` import. The validator SHALL be `ReportFilterSchema.extend({ entityType: z.string().optional() })` which preserves the existing `entityType` filter while replacing `PaginationSchema.extend({ status: z.string().optional(), ... })`.

#### Scenario: Admin route rejects invalid status query parameter
- **WHEN** `GET /api/v1/admin/reports?status=invalid` is called
- **THEN** the request is rejected with a Zod validation error (HTTP 400)

#### Scenario: Admin route accepts valid status query parameter
- **WHEN** `GET /api/v1/admin/reports?status=pending` is called
- **THEN** the request is accepted and filtered results are returned

### Requirement: ReportStatus enum constant is covered by tests
The test suite in `packages/shared/src/constants/enums.test.ts` SHALL include a test verifying that `ReportStatus` covers every value in `REPORT_STATUS_VALUES` with no duplicates, matching the existing pattern used for `EquipmentDeleteRequestStatus`, `CoffeeVarietyCategory`, and `AdditionalPreparationCategory`.

#### Scenario: Enum coverage test passes
- **WHEN** `deno test packages/shared/src/constants/enums.test.ts` is run
- **THEN** the `ReportStatus covers every REPORT_STATUS_VALUES entry` test passes

