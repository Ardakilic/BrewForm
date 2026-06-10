## Context

The `reports` table predates the team's established pattern of using `pgEnum` for constrained string values. Every other status-like column (`equipmentDeleteRequests.status`, `recipes.visibility`, `recipes.brewMethod`, `coffeeVarieties.category`, etc.) uses a `pgEnum` backed by a `_VALUES` tuple in `@brewform/shared/constants/`. The `report.status` column was left as plain `varchar(50)`, allowing the database to accept any arbitrary string.

The three-layer single-source-of-truth (SSoT) chain established in this codebase:
```
Layer 1: @brewform/shared/constants/report-status.ts  → REPORT_STATUS_VALUES tuple + ReportStatus type
Layer 2: @brewform/shared/constants/index.ts           → barrel re-export
Layer 3: packages/db/src/schema.ts                     → pgEnum('report_status', [...REPORT_STATUS_VALUES])
         packages/shared/src/schemas/report.ts          → z.enum(REPORT_STATUS_VALUES)
```

The closest analogue is `equipmentDeleteRequestStatusEnum` (defined at `schema.ts:585`, consuming `EQUIPMENT_DELETE_REQUEST_STATUS_VALUES` from `packages/shared/src/constants/equipment-delete-request.ts`). It uses the same three-layer pattern.

The existing type-cast precedent for `string` → pgEnum column is at `admin/model.ts:636`:
```typescript
eq(equipmentDeleteRequests.status, status as typeof equipmentDeleteRequests.status._.data)
```

## Goals / Non-Goals

**Goals:**
- Add database-level enum constraint on `report.status` matching existing valid values (`pending`, `reviewed`, `resolved`, `dismissed`)
- Align the Zod `ReportStatusEnum` to derive from the same `REPORT_STATUS_VALUES` tuple
- Follow the exact same three-layer SSoT pattern every other constrained-string column uses
- Zero data loss during migration
- `make check` must pass with zero type errors across all workspaces

**Non-Goals:**
- Changing the set of valid status values
- Adding/removing any business logic
- Changing the API surface (HTTP routes, response shapes, error messages)
- Adding a `Report` type to `@brewform/shared/types` (not needed; `ReportStatus` type is sufficient)
- Modifying `pr_description.md` referenced in the plan (a new one will be created from scratch)

## Decisions

### Decision 1: Place `reportStatusEnum` in the main enums section of schema.ts

**Choice**: Define `reportStatusEnum` in the main enums section (lines 37–58 of `schema.ts`), after `additionalPreparationTypeEnum` and before the `// Tables` divider.

**Rationale**: All enums except `equipmentDeleteRequestStatusEnum` (an outlier at line 585) are defined in the main enums block. The canonical location for new enums is the main section.

**Alternatives considered**:
- Inline before the `reports` table definition (matching `equipmentDeleteRequestStatusEnum`): Rejected — the outlier should not be replicated.

### Decision 2: Use `status as typeof reports.status._.data` type-cast pattern

**Choice**: For model functions where `status` parameter is typed as `string | undefined`, cast to `typeof reports.status._.data` when passing to `eq()`.

**Affected lines**:
- `apps/api/src/modules/report/model.ts:41` — `findMany(status: string | undefined, ...)` uses `eq(reports.status, status)` → cast `status`
- `apps/api/src/modules/admin/model.ts:394` — `listReports(..., status?: string, ...)` uses `eq(reports.status, status)` → cast `status`

**NOT affected** (string literals are type-safe):
- `admin/model.ts:473` — `eq(reports.status, 'pending')` in `getDashboardStats()` — string literal narrows correctly
- `admin/model.ts:412` — `.set({ status: 'resolved', ... })` in `resolveReport()` — literal in `.set()` works
- `admin/model.ts:421` — `.set({ status: 'dismissed', ... })` in `dismissReport()` — literal in `.set()` works
- `report/model.ts:57` — `.set({ status: 'resolved', ... })` in `resolve()` — literal in `.set()` works

**Rationale**: After `reports.status` changes from `varchar` to `pgEnum`, its TypeScript type narrows from `string` to `'pending' | 'reviewed' | 'resolved' | 'dismissed'`. The `string`-typed function parameter is not assignable to this union. The existing codebase uses this exact cast at `admin/model.ts:636` for `equipmentDeleteRequests.status`.

### Decision 3: Admin route uses ReportFilterSchema instead of inline z.string()

**Choice**: Replace the inline query validator `PaginationSchema.extend({ status: z.string().optional(), entityType: z.string().optional() })` with `ReportFilterSchema.extend({ entityType: z.string().optional() })`.

**Rationale**: `ReportFilterSchema` already includes `page`, `perPage`, and `status: ReportStatusEnum.optional()`. The user-facing `GET /report` route already validates with this schema. The admin route should match for consistency. This means the `PaginationSchema.extend(...)` is replaced entirely — `ReportFilterSchema.extend(...)` handles pagination + status filtering.

### Decision 4: Import ordering follows alphabetical convention

**Choice**: In all import blocks, new entries are placed in alphabetical order relative to existing entries, matching the codebase convention visible in `schema.ts:21-35`.

**Specific positions**:
- `schema.ts` imports: `REPORT_STATUS_VALUES` between `EQUIPMENT_TYPE_VALUES` and `TEMPERATURE_UNIT_VALUES`
- `constants/index.ts`: `export { REPORT_STATUS_VALUES } from './report-status.ts';` after `EQUIPMENT_DELETE_REQUEST_STATUS_VALUES` (last in the pure-value tuples section)
- `admin/index.ts` imports: `ReportFilterSchema` in alphabetical position among existing schema imports

## Risks / Trade-offs

| Risk | Impact | Mitigation |
|------|--------|------------|
| Existing invalid status values in database | Migration fails | Enum values exactly match valid varchar values currently enforced by Zod. Verify with `SELECT DISTINCT status FROM report` before migration |
| Drizzle generates migration without `USING` clause | PostgreSQL fails to alter column type | Drizzle generates `USING "status"::"report_status"` automatically when converting varchar→enum. Verify generated SQL before applying |
| `eq(reports.status, 'pending')` literal at `admin/model.ts:473` causes type error | `make check` fails | Verification step in tasks. Likely fine based on `.set({ status: 'approved' })` patterns working with string literals against pgEnum. If flagged, apply same cast |
| Rollback complexity | Cannot revert pgEnum to varchar without explicit SQL | Acceptable risk — enum values match existing data. Rollback would require another Drizzle migration |
| `PaginationSchema` import becomes unused in `admin/index.ts` after switch to `ReportFilterSchema` | Lint warning | Verified not a risk — `PaginationSchema` is used by 7+ other routes in the file |

## Migration Plan

1. **Generate**: `make db-generate` — Drizzle diffs the schema and creates a migration SQL file
2. **Verify**: Open the generated SQL file and confirm it contains:
   ```sql
   CREATE TYPE "public"."report_status" AS ENUM('pending', 'reviewed', 'resolved', 'dismissed');
   ALTER TABLE "report" ALTER COLUMN "status" TYPE "public"."report_status"
     USING "status"::"public"."report_status";
   ```
3. **Apply**: `make db-migrate` — applies the migration to the database
4. **Verify**: `make check` passes, `make test` passes
5. **Rollback** (if needed): Create a new Drizzle migration to revert (`make db-generate` after reverting schema changes)

## Open Questions

- **Q**: Does `eq(reports.status, 'pending')` at `admin/model.ts:473` in `getDashboardStats()` need a type-cast?
  - **Status**: Resolved during implementation (task 7.2). Based on existing `.set({ status: 'approved' })` patterns working fine with string literals against pgEnum columns, this should not need a cast. If `make check` flags it, apply `'pending' as typeof reports.status._.data`.
- **Q**: Does `PaginationSchema` need to be removed from the `admin/index.ts` import after switching to `ReportFilterSchema`?
  - **Resolved**: No. `PaginationSchema` is used by 7+ other routes in the file (users, recipes, equipment, vendors, audit logs, coffee varieties, taste notes). Keep it in the import.
- **Q**: Should `reportStatusEnum` use `export const` or `const`?
  - **Status**: Use `export const`. All enums in the main enums section use `export const`. The `equipmentDeleteRequestStatusEnum` at line 585 also uses `export const`.
