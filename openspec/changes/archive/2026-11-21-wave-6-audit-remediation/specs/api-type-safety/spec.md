## MODIFIED Requirements

### Requirement: API service/model layer derives types from shared Zod schemas, not `any`

D05 established the requirement that API services use `z.infer<typeof XSchema>` for validated payloads instead of `any`. D34 extends this requirement to the modules D05 never covered: preference, bean, setup, taste, recipe/model, badge, notify. All `any` parameters, variables, and casts in these modules SHALL be eliminated and replaced with types derived from shared Zod schemas, Drizzle inferred row types, or local recursive/utility interfaces (`TasteNoteNode`, `NotifyRecipient`).

The 12 P2 locations (per the D34 plan, with line-number drift corrected):
1. `preference/service.ts:26` — `data: any` → `Partial<typeof userPreferences.$inferInsert>`
2. `preference/index.ts:85` — `flatData: any` → `Partial<typeof userPreferences.$inferInsert>`
3. `bean/service.ts:34` — `data: any` → `BeanCreate`
4. `bean/service.ts:47` — `data: any` → `BeanUpdate`
5. `setup/service.ts:38` — `data: any` → `SetupCreate`
6. `taste/model.ts:45` — `Map<string, any>` → `Map<string, TasteNoteNode>`
7. `taste/model.ts:50` — `any[]` → `TasteNoteNode[]`
8. `recipe/model.ts:466` — `(ltn: any)` → inferred (remove annotation)
9. `recipe/model.ts:473` — `(leq: any)` → inferred (remove annotation)
10. `badge/model.ts:131` — `check.rule as any` → `BadgeRule` (type `checks` array, drop cast)
11. `notify/index.ts:87` — `prefs: any` → `NotifyRecipient` type
12. `notify/index.ts:199` — `(r: any)` → `NotifyRecipient` (or inferred)

**Reason:** D05 cleaned the recipe module and a few services; the July 2026 sweep found the same `any` pattern persisting in modules D05 never touched. Validated Zod payloads lose their inferred type at the route → service boundary, so column renames or schema changes fail silently at compile time. D34 completes the D05 requirement across the remaining modules.

#### Scenario: No `any` remains in the 12 P2 locations

- **WHEN** `grep -rn ": any\|as any\|any\[\]" apps/api/src/modules/preference apps/api/src/modules/bean apps/api/src/modules/setup apps/api/src/modules/taste apps/api/src/modules/recipe/model.ts apps/api/src/modules/badge apps/api/src/utils/notify` is executed
- **THEN** zero hits are returned (the 12 P2 locations are clean; stretch files in `utils/openapi`, `auth/jwt`, `middleware/errorHandler` are excluded until the P3 stretch is done)

#### Scenario: make check passes with no new type errors

- **WHEN** `make check-api` is invoked
- **THEN** zero type errors are reported across all modified files

#### Scenario: make lint passes with no new suppressions

- **WHEN** `make lint` is invoked
- **THEN** zero new lint suppressions are introduced and no file-level or range suppression exists; the single line-level `// biome-ignore lint/suspicious/noExplicitAny` on the `utils/openapi/index.ts` stretch cast is unchanged or removed if the cast is cleaned

### Requirement: D34 acceptance criteria are met

The D34 plan lists four explicit acceptance criteria. This change SHALL satisfy all four:

1. **No `any` in the 12 P2 locations:** No `any` (parameter, variable, or cast) remains in the twelve P2 locations listed in the `api-type-safety` MODIFIED requirement above.
2. **Payload types derive from shared Zod schemas:** All payload types (`BeanCreate`, `BeanUpdate`, `SetupCreate`, `SetupUpdate`, `VendorCreate`, `VendorUpdate`, `EquipmentCreate`, `EquipmentUpdate`) derive from the shared Zod schemas via `z.infer<>` — no hand-duplicated interfaces. The `UserPreferencesUpdate`/flatData exception (using `typeof userPreferences.$inferInsert` instead of the nested shared `UserPreferences`) is documented in design Decision 3 and is NOT a hand-duplicated interface — it's the Drizzle inferred DB row type.
3. **`make ci` passes with no new lint suppressions:** `make check`, `make lint`, `make fmt`, and `make test` all pass. No new suppressions are introduced on the P2 files. The existing line-level `// biome-ignore lint/suspicious/noExplicitAny` on `utils/openapi/index.ts` (stretch file) is unchanged or removed if the cast is cleaned.
4. **Stretch casts removed or annotated:** The P3 stretch casts (openapi, jwt, errorHandler, equipment cache) are either removed (clean typed alternative) or annotated with a one-line justification comment. This is optional — the P2 scope is required, the P3 stretch is not.

**Reason:** These are the explicit acceptance gates from `plans/D34-residual-any-elimination.md`. A fresh-context implementer must verify all four before marking the change complete.

#### Scenario: All payload types derive from shared Zod schemas

- **WHEN** the modified service files are inspected
- **THEN** `bean/service.ts` imports `BeanCreate`/`BeanUpdate` from `@brewform/shared/schemas`; `setup/service.ts` imports `SetupCreate`; `preference/service.ts` uses `typeof userPreferences.$inferInsert` (the Drizzle DB row type, not a hand-duplicated interface); `badge/model.ts` imports `BadgeRule` from `@brewform/shared/types`. No hand-duplicated payload interfaces are introduced.

#### Scenario: Grep gate returns zero hits in P2 scope

- **WHEN** `grep -rn ": any\|as any\|any\[\]" apps/api/src/modules/preference apps/api/src/modules/bean apps/api/src/modules/setup apps/api/src/modules/taste apps/api/src/modules/recipe/model.ts apps/api/src/modules/badge apps/api/src/utils/notify` is executed
- **THEN** zero hits are returned (the 12 P2 locations are clean)

#### Scenario: make fmt check passes

- **WHEN** `make fmt` is run followed by `git diff --exit-code`
- **THEN** there is no diff — Biome formatting (`biome check --write`) has been applied to all changed files (CI enforces `pnpm run fmt-check`)
