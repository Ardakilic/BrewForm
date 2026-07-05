## ADDED Requirements

### Requirement: Shared schemas export inferred payload types

The input Zod schemas in `packages/shared/src/schemas/` SHALL export their inferred TypeScript types via `export type X = z.infer<typeof XSchema>` alongside the schema definitions. The following type exports SHALL be added (none currently exist — only the Zod schema objects are exported):

- `packages/shared/src/schemas/bean.ts` — `export type BeanCreate = z.infer<typeof BeanCreateSchema>;` and `export type BeanUpdate = z.infer<typeof BeanUpdateSchema>;`
- `packages/shared/src/schemas/setup.ts` — `export type SetupCreate = z.infer<typeof SetupCreateSchema>;` and `export type SetupUpdate = z.infer<typeof SetupUpdateSchema>;`
- `packages/shared/src/schemas/vendor.ts` — `export type VendorCreate = z.infer<typeof VendorCreateSchema>;` and `export type VendorUpdate = z.infer<typeof VendorUpdateSchema>;`
- `packages/shared/src/schemas/equipment.ts` — `export type EquipmentCreate = z.infer<typeof EquipmentCreateSchema>;` and `export type EquipmentUpdate = z.infer<typeof EquipmentUpdateSchema>;`

**Note on `UserPreferencesUpdate`:** The preference module's `flatData` uses the flat DB row shape (`typeof userPreferences.$inferInsert`), NOT the nested `z.infer<typeof UserPreferencesSchema>` (which nests `emailNotifications`). Per design Decision 3, the preference service uses the DB row type directly — no new shared type export is required for preferences. The `UserPreferencesSchema` stays as-is (nested for the API response); the service layer imports the DB row type from `@brewform/db/schema`.

**Reason:** D34's root cause is that API services cannot derive types from the shared Zod schemas (only the schema objects are exported). Adding `z.infer<>` exports lets services replace `data: any` with `data: BeanCreate` (etc.) — a pass-through typing change with no runtime behaviour difference, since the route layer already validates with the same schemas.

#### Scenario: BeanCreate type is exported and rejects unknown keys

- **WHEN** `packages/shared/src/schemas/bean.ts` is imported and `BeanCreate` is used in a `// @ts-expect-error` assertion for an unknown key
- **THEN** the type-check fails on the unknown key (proving the type is correctly inferred and restrictive)

#### Scenario: SetupCreate type is exported

- **WHEN** `packages/shared/src/schemas/setup.ts` is imported
- **THEN** `SetupCreate` is available as a TypeScript type matching the Zod schema's inferred shape

#### Scenario: Existing schema exports unchanged

- **WHEN** the shared schema files are modified to add type exports
- **THEN** the existing Zod schema object exports (`BeanCreateSchema`, etc.) are unchanged — the type exports are additive

### Requirement: Preference service and route use typed payload, not `any`

`apps/api/src/modules/preference/service.ts:26` — `updatePreferences(userId, data: any)` SHALL be replaced with `updatePreferences(userId, data: Partial<typeof userPreferences.$inferInsert>)` (the flat DB row insert type, matching the downstream `model.upsert` signature at `preference/model.ts:25`). The `userPreferences` table is imported from `@brewform/db/schema`.

`apps/api/src/modules/preference/index.ts:85` — `const flatData: any = {}` SHALL be replaced with `const flatData: Partial<typeof userPreferences.$inferInsert> = {}`. The `userPreferences` table is imported from `@brewform/db/schema` (add the import if not present).

**Reason:** The `flatData` object is built by flattening the nested `body.emailNotifications.*` into top-level keys matching the flat DB row. The shared nested `UserPreferences` type is the wrong shape (Decision 3). The DB row insert type is correct and already used by the downstream model function.

#### Scenario: updatePreferences accepts the flat partial type

- **WHEN** `apps/api/src/modules/preference/service.ts` is type-checked
- **THEN** `updatePreferences` signature is `(userId: string, data: Partial<typeof userPreferences.$inferInsert>)` with no `any`

#### Scenario: flatData is typed as the flat DB row partial

- **WHEN** `apps/api/src/modules/preference/index.ts` is type-checked
- **THEN** `const flatData: Partial<typeof userPreferences.$inferInsert> = {}` — no `any`, and the subsequent `flatData.unitSystem = body.unitSystem` assignments type-check against the DB row columns

### Requirement: Bean and setup services use typed payloads, not `any`

`apps/api/src/modules/bean/service.ts:34` — `createBean(userId, data: any)` SHALL be `createBean(userId, data: BeanCreate)` (imported from `@brewform/shared/schemas`).

`apps/api/src/modules/bean/service.ts:47` — `updateBean(userId, id, data: any)` SHALL be `updateBean(userId, id, data: BeanUpdate)`.

`apps/api/src/modules/setup/service.ts:38` — `createSetup(userId, data: any)` SHALL be `createSetup(userId, data: SetupCreate)`.

The `BeanCreate`, `BeanUpdate`, `SetupCreate` types are the newly-exported inferred types from the shared schemas (see the requirement above). The route layer already validates with `zValidator('json', BeanCreateSchema)` / `BeanUpdateSchema` / `SetupCreateSchema`, so this is a pass-through typing change — no runtime behaviour difference.

#### Scenario: bean service signatures are typed

- **WHEN** `apps/api/src/modules/bean/service.ts` is type-checked
- **THEN** `createBean` accepts `BeanCreate` and `updateBean` accepts `BeanUpdate` — no `any`

#### Scenario: setup service signature is typed

- **WHEN** `apps/api/src/modules/setup/service.ts` is type-checked
- **THEN** `createSetup` accepts `SetupCreate` — no `any`

### Requirement: Taste model defines and uses TasteNoteNode recursive type

`apps/api/src/modules/taste/model.ts` SHALL define a local recursive interface:

```typescript
/** A taste-note row with its nested children, used by getHierarchy. */
interface TasteNoteNode extends typeof tasteNotes.$inferSelect {
  children: TasteNoteNode[];
}
```

The `getHierarchy` function SHALL use `Map<string, TasteNoteNode>` (replacing `Map<string, any>` at L45) and `TasteNoteNode[]` (replacing `any[]` at L50). The `tasteNotes` table is already imported at the top of the file.

**Reason:** The shared `TasteHierarchy` (`@brewform/shared/types`) is a UI projection (id/name/color/definition/children) missing `parentId`/`depth`/`createdAt` — it is NOT the right type for the model's internal tree. Defining `TasteNoteNode` locally (not exported to shared) avoids merging two different shapes. If the web later needs the full row + children, a follow-up can promote it — but today the web uses `TasteHierarchy`.

#### Scenario: getHierarchy returns typed TasteNoteNode[]

- **WHEN** `apps/api/src/modules/taste/model.ts` is type-checked
- **THEN** `getHierarchy` returns `Promise<TasteNoteNode[]>` (or the inferred type), `nodeMap` is `Map<string, TasteNoteNode>`, `roots` is `TasteNoteNode[]` — no `any`

### Requirement: Recipe model relation callbacks use inferred types, not `any`

`apps/api/src/modules/recipe/model.ts:466` — `.find((ltn: any) => ltn.tasteNoteId === tn.tasteNoteId)` SHALL have the `: any` annotation removed so TypeScript infers the parameter type from `latestVersion.tasteNotes` (the Drizzle relational query result type).

`apps/api/src/modules/recipe/model.ts:473` — `.find((leq: any) => leq.equipmentId === eq.equipmentId)` SHALL have the `: any` annotation removed so TypeScript infers the parameter type from `latestVersion.equipment`.

**Reason:** The `latestVersion` (L362) is typed by Drizzle's relational inference from `findById` (L237-256). The array element types are already inferred — the `: any` annotations actively widen the type, defeating the inference. Removing them lets TypeScript catch field-access errors at compile time (e.g. a renamed `tasteNoteId` column would fail). No new type definitions needed (Decision 8).

#### Scenario: recipe model .find() callbacks are inferred

- **WHEN** `apps/api/src/modules/recipe/model.ts` is type-checked
- **THEN** the `.find()` callbacks at L466 and L473 have no `: any` annotation, and TypeScript infers the parameter types from the array

### Requirement: Badge model uses BadgeRule union, not `as any`

`apps/api/src/modules/badge/model.ts` SHALL import `BadgeRule` from `@brewform/shared/types` (already exported at `types/index.ts:51`, defined as `BadgeRule = (typeof BADGE_RULES)[number]['rule']` in `constants/badges.ts:82`).

The `checks` array (L116) SHALL be typed `Array<{ rule: BadgeRule; met: boolean }>` (currently `Array<{ rule: string; met: boolean }>` — the literal strings widen to `string`).

The `eq(badges.rule, check.rule as any)` cast at L131 SHALL be removed — `BadgeRule` is assignable to the `badges.rule` column type (`badgeRuleEnum('rule')`) because they share the same source-of-truth tuple (`BADGE_RULE_VALUES`).

#### Scenario: badge model has no `as any`

- **WHEN** `apps/api/src/modules/badge/model.ts` is type-checked
- **THEN** `checks` is typed `Array<{ rule: BadgeRule; met: boolean }>` and the `eq(badges.rule, check.rule)` call has no cast

### Requirement: Notify module defines and uses NotifyRecipient type

`apps/api/src/utils/notify/index.ts` SHALL define a local interface:

```typescript
/** A resolved notification recipient with their flat preference row. */
interface NotifyRecipient {
  email: string;
  username: string;
  prefs: typeof userPreferences.$inferSelect | Record<string, never>;
}
```

The `loadRecipient` function (L86-99) SHALL return `Promise<NotifyRecipient | null>` (replacing `Promise<{ email: string; username: string; prefs: any } | null>`).

The `.filter((r: any) => r.prefs.followedUserPosted !== false)` at L199 SHALL be `.filter((r: NotifyRecipient) => r.prefs.followedUserPosted !== false)` (or the parameter type inferred from the preceding `.map()`).

The `userPreferences` table is imported from `@brewform/db/schema` (already imported at the top of the file).

**Reason:** The `prefs` field is the flat DB row (`result[0].user_preferences`) or an empty object (`?? {}`) — NOT the shared nested `UserPreferences` (Decision 3). The `prefs.newFollower` / `recipeLiked` / `recipeCommented` / `followedUserPosted` accesses (L111, L134, L158, L199) are flat DB columns. Using the flat row type is correct and matches the runtime.

#### Scenario: loadRecipient returns typed NotifyRecipient

- **WHEN** `apps/api/src/utils/notify/index.ts` is type-checked
- **THEN** `loadRecipient` returns `Promise<NotifyRecipient | null>` with no `any`, and the `.filter()` callback at L199 has no `any`

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
- **THEN** zero new lint suppressions are introduced; the existing `// deno-lint-ignore-file` directives on stretch files (`utils/openapi/index.ts`) are unchanged or removed if the cast is cleaned

### Requirement: P3 stretch casts are documented or simplified (optional)

The following P3 (stretch) casts SHALL be either removed (if a clean typed alternative exists) or annotated with a one-line justification comment explaining why the cast is necessary:

- `apps/api/src/utils/openapi/index.ts:28` — `z.toJSONSchema(schema, { unrepresentable: 'any' }) as any`. The `z.toJSONSchema` return type doesn't match `hono-openapi`'s expected request-body schema type. **Justification comment** (clean typed alternative doesn't exist in `hono-openapi` v1.3.0).
- `apps/api/src/modules/auth/jwt.ts:79` — `payload as unknown as JwtPayload`. `verify` from `hono/jwt` returns `any`; simplify to `payload as JwtPayload` (the `unknown` intermediate is unnecessary when the source is `any`).
- `apps/api/src/modules/auth/jwt.ts:97-98` — `decoded.header as unknown as Record<string, unknown>` and `decoded.payload as unknown as Record<string, unknown>`. Simplify to direct `as` casts if the `decode` return type is compatible.
- `apps/api/src/middleware/errorHandler.ts:23` — `err as unknown as Error & { details: string[] }`. Replace with a type guard: `if (err instanceof Error && 'details' in err) { const details = (err as Error & { details: string[] }).details; ... }`.
- `apps/api/src/middleware/errorHandler.ts:53` — `err as unknown as { issues?: Array<...> }`. Replace with a type guard or inline interface.
- `apps/api/src/modules/equipment/service.ts:42` — `eq as unknown as Record<string, unknown>` cache cast. If `CacheProvider.set` can be made generic or accept `unknown` without breaking other callers, do it; otherwise add a justification comment.

**Reason:** These are library-boundary casts around third-party type gaps, not laziness. Fixing them is P3 (polish) and optional — the P2 scope (12 locations) is the required delivery.

#### Scenario: Stretch casts are documented or simplified

- **WHEN** the stretch files are inspected
- **THEN** each cast is either removed (replaced with a clean typed alternative) or has a one-line `// ...` comment explaining the library type gap

#### Scenario: Stretch scope is optional and does not block P2

- **WHEN** the P3 stretch is deferred (time-constrained implementer)
- **THEN** the P2 acceptance criteria (12 locations clean, `make check` + `make lint` + `make test` pass) are still met — the stretch is not required for the change to merge

### Requirement: D34 acceptance criteria are met

The D34 plan lists four explicit acceptance criteria. This change SHALL satisfy all four:

1. **No `any` in the 12 P2 locations:** No `any` (parameter, variable, or cast) remains in the twelve P2 locations listed in the `api-type-safety` MODIFIED requirement above.
2. **Payload types derive from shared Zod schemas:** All payload types (`BeanCreate`, `BeanUpdate`, `SetupCreate`, `SetupUpdate`, `VendorCreate`, `VendorUpdate`, `EquipmentCreate`, `EquipmentUpdate`) derive from the shared Zod schemas via `z.infer<>` — no hand-duplicated interfaces. The `UserPreferencesUpdate`/flatData exception (using `typeof userPreferences.$inferInsert` instead of the nested shared `UserPreferences`) is documented in design Decision 3 and is NOT a hand-duplicated interface — it's the Drizzle inferred DB row type.
3. **`make ci` passes with no new lint suppressions:** `make check`, `make lint`, `make fmt`, and `make test` all pass. No new `// deno-lint-ignore-file` directives are introduced on the P2 files. The existing `// deno-lint-ignore-file no-explicit-any` on `utils/openapi/index.ts` (stretch file) is unchanged or removed if the cast is cleaned.
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
- **THEN** there is no diff — `deno fmt` has been applied to all changed files (CI enforces `deno fmt --check`)