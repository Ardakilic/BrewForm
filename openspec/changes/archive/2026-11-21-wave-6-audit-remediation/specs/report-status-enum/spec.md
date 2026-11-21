## MODIFIED Requirements

### Requirement: ReportStatus enum constant is covered by tests
The test suite in `packages/shared/src/constants/enums.test.ts` SHALL include a test verifying that `ReportStatus` covers every value in `REPORT_STATUS_VALUES` with no duplicates, matching the existing pattern used for `EquipmentDeleteRequestStatus`, `CoffeeVarietyCategory`, and `AdditionalPreparationCategory`.

#### Scenario: Enum coverage test passes
- **WHEN** `pnpm --filter @brewform/shared exec vitest run src/constants/enums.test.ts` (or `make test-shared`) is run
- **THEN** the `ReportStatus covers every REPORT_STATUS_VALUES entry` test passes
