## Why

The `report.status` column uses `varchar(50)` with no database-level constraint, allowing arbitrary string values to bypass the business logic that restricts status to `pending | reviewed | resolved | dismissed`. Every other constrained-string column in the schema uses `pgEnum` backed by a shared `_VALUES` constant tuple as the single source of truth. This mismatch creates data integrity risk and makes the codebase inconsistent.

## What Changes

- Add a new `REPORT_STATUS_VALUES` constant tuple in `@brewform/shared/constants/report-status.ts` following the established three-layer single-source-of-truth pattern
- Export `REPORT_STATUS_VALUES` from the shared constants barrel
- Add `reportStatusEnum` (`pgEnum`) to the Drizzle schema, backed by `REPORT_STATUS_VALUES`
- Update `reports.status` column from `varchar` to `reportStatusEnum`
- Align `ReportStatusEnum` Zod schema in `@brewform/shared/schemas/report.ts` to derive from `REPORT_STATUS_VALUES`
- Apply `as typeof reports.status._.data` type-casts in two model functions where the `status` parameter is typed as `string`
- Tighten the admin `GET /reports` route validator to use `ReportStatusEnum` instead of bare `z.string()`
- Add enum coverage test for the new `REPORT_STATUS_VALUES` constant

## Capabilities

### New Capabilities
- `report-status-enum`: Database-level enum constraint on `report.status` column with a shared constant tuple as the single source of truth across DB schema, Zod validation, and TypeScript types

### Modified Capabilities
<!-- None. No existing spec-level behavior changes. -->

## Impact

- **Database schema**: `packages/db/src/schema.ts` — new `reportStatusEnum` pgEnum, column type change on `reports.status`
- **Migration**: New Drizzle migration to convert `varchar` → `report_status` enum (auto-generated SQL with `USING` cast)
- **Shared constants**: New file `packages/shared/src/constants/report-status.ts` + barrel export update
- **Shared schemas**: `packages/shared/src/schemas/report.ts` — import change only
- **API model layer**: Two type-casts in `apps/api/src/modules/report/model.ts:41` and `apps/api/src/modules/admin/model.ts:394`
- **API routes**: `apps/api/src/modules/admin/index.ts` — stricter query validation, import addition
- **Tests**: `packages/shared/src/constants/enums.test.ts` — new coverage test
- **Risk**: Low. Enum values match existing valid values exactly; no data loss. No logic changes.
