# api-type-safety

Type-safety discipline across the API service and model layer (preference, bean, setup, taste, recipe/model, badge, notify).

## MODIFIED Requirements

### Requirement: Preference service and route use typed payload, not `any`

`apps/api/src/modules/preference/service.ts:26` — `updatePreferences(userId, data: any)` SHALL be replaced with `updatePreferences(userId, data: Partial<typeof userPreferences.$inferInsert>)` (the flat DB row insert type, matching the downstream `model.upsert` signature at `preference/model.ts:25`). The `userPreferences` table is imported from `@brewform/db/schema`.

`apps/api/src/modules/preference/index.ts:85` — `const flatData: any = {}` SHALL be replaced with `const flatData: Partial<typeof userPreferences.$inferInsert> = {}`. The `userPreferences` table is imported from `@brewform/db/schema` (add the import if not present).

**Reason:** Decision 3 — F05 (Option C) flattens the request body to top-level `notify*` fields, so the API step maps each `body.notifyX` one-to-one to `flatData.notifyX`. There is no nested namespace object anymore. The flatten is closer to a per-field identity copy. The shared nested `UserPreferences` type is the wrong shape (Decision 3); the DB row insert type is correct and already used by the downstream model function. The original `body.emailNotifications.*` reference in Decision 3's rationale is updated to flat `body.notify*` field accesses to reflect the F05 rename + flatten; the per-field copy pattern replaces the nested-flatten pattern.

#### Scenario: updatePreferences accepts the flat partial type

- **WHEN** `apps/api/src/modules/preference/service.ts` is type-checked
- **THEN** `updatePreferences` signature is `(userId: string, data: Partial<typeof userPreferences.$inferInsert>)` with no `any`

#### Scenario: flatData is typed as the flat DB row partial

- **WHEN** `apps/api/src/modules/preference/index.ts` is type-checked
- **THEN** `const flatData: Partial<typeof userPreferences.$inferInsert> = {}` — no `any`, and the subsequent `flatData.notifyNewFollower = body.notifyNewFollower` (and 4 siblings) assignments type-check against the renamed flat DB row columns, with body source keys being flat top-level `body.notify*` fields (no nested `body.emailNotifications.*` access)