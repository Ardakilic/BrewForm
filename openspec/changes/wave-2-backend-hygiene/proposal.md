## Why

Wave 2 of the debt roadmap bundles three backend-hygiene items that the `ROADMAP.md` explicitly sequences together because **D39 Tier 1 is the regression net for D03** (the plan frames D39 Tier 1 as "D03's regression net, since `equipment/model.ts` currently has zero tests"):

- **D03 — Raw SQL in `equipment/model.ts getRecipesUsingEquipment`.** The data branch of `getRecipesUsingEquipment` (`apps/api/src/modules/equipment/model.ts:120-123`) uses a raw `sql\`\`` template-tag subquery: `sql\`${recipes.currentVersionId} IN (SELECT re.recipe_version_id FROM recipe_equipment re WHERE re.equipment_id = ${equipmentId})\``. This is the **sole raw-SQL violation** in the codebase (every other query uses the Drizzle query builder). It bypasses type safety, is opaque to IDE tooling, and column renames would silently break. The count branch (lines 129-139) already uses proper Drizzle `innerJoin` chains — the inconsistency is the smell. The fix folds the **duplicated visibility/`deletedAt` predicates** (`eq(recipes.visibility, 'public')` + `isNull(recipes.deletedAt)` appear in BOTH branches at lines 118-119 and 136-137) into one shared condition set, and replaces the raw `IN (...)` subquery with Drizzle's `exists()` correlated subquery (verified against Drizzle docs — `exists()` takes a subquery `db.select().from(...).where(...)` and produces `WHERE EXISTS (SELECT ...)`).

- **D34 — Residual `any` elimination.** D05 cleaned the recipe module, vendor/admin/auth/photo services, and sitemap. A July 2026 sweep found **12 P2 `any` locations** in modules D05 never covered: preference, bean, setup, taste, recipe/model (relation callbacks), badge, notify. Plus a P3 stretch set (library-boundary casts in openapi/jwt/errorHandler) and the equipment cache cast. These are validated Zod payloads that lose their inferred type the moment they cross the route → service boundary — column renames or schema changes fail silently at compile time. The fix derives payload types from the existing shared Zod schemas (some require new `z.infer<>` type exports added to `packages/shared/src/schemas/`), introduces a `TasteNoteNode` recursive type, types the Drizzle relation `.find()` callbacks, and imports the existing `BadgeRule` union for the badge model.

- **D39 Tier 1 — Test coverage backfill.** `apps/api/src/modules/equipment/model.ts` has **zero tests** and currently holds D03's raw-SQL bug. `apps/api/src/modules/vendor/model.ts` has **zero tests** and held the D01 ownership bug (its `update` function still lacks the `isNull(deletedAt)` guard — see design Decision 4). The `apps/web/src/components/recipe-list/` directory (8 files shipped by D11) and `apps/web/src/components/auth/RequireAuth.tsx` are also untested. D39 Tier 1 writes characterisation tests for all of these, becoming the regression net that makes D03's refactor safe to land in the same change.

| Concern | Current state | Wave 2 fix |
|---|---|---|
| `getRecipesUsingEquipment` data branch | raw `sql\`${recipes.currentVersionId} IN (SELECT re.recipe_version_id FROM recipe_equipment re WHERE re.equipment_id = ${equipmentId})\`` | Drizzle `exists()` correlated subquery via `db.select().from(recipeEquipment).where(eq(recipeEquipment.equipmentId, equipmentId))` wrapped in `exists(...)`; correlated against `recipes.currentVersionId` |
| Duplicated visibility/`deletedAt` predicates | `eq(recipes.visibility, 'public')` + `isNull(recipes.deletedAt)` appear in BOTH the data branch (L118-119) and the count branch (L136-137) | One shared `const recipeConditions = and(eq(recipes.visibility, 'public'), isNull(recipes.deletedAt))` referenced by both |
| 12 P2 `any` locations across 8 modules | `data: any` on service functions, `any[]` in taste hierarchy, `as any` on badge rule, `prefs: any` in notify | Typed via shared Zod `z.infer<>` exports + `TasteNoteNode` + `BadgeRule` + `NotifyRecipient` types |
| `equipment/model.ts` tests | none | new `equipment/model.test.ts` covering `findById`, `findManyWithFilters`, `search`, `create`, `update`, `softDelete` (D19 three-`it` pattern), `createDeleteRequest`, and `getRecipesUsingEquipment` (both branches — the D03 regression net) |
| `vendor/model.ts` tests | none | new `vendor/model.test.ts` covering `findById`, `findMany`, `search`, `create`, `softDelete` (three-`it` pattern), and a regression test documenting the `update` function's missing `isNull(deletedAt)` guard (design Decision 4) |
| `recipe-list/*` web components tests | none (8 files shipped by D11) | new `*.test.tsx` for `RecipeCard`, `FilterField`, `ActiveFilterBadge`, `PaginationControls`, `useRecipeFilters` (hook via TestConsumer), `RecipeListView` |
| `RequireAuth.tsx` tests | none | new `RequireAuth.test.tsx` covering the 4 branches: loading → skeleton, unauthenticated → redirect `/login`, authenticated non-admin + `requireAdmin` → redirect `/`, authenticated admin → renders children |

## What Changes

**D39 Tier 1 (land first — the regression net):**

- `apps/api/src/modules/equipment/model.test.ts` — **new**. DB-backed test following the `admin/model.test.ts` pattern (`// deno-lint-ignore-file no-explicit-any require-await` header, `import '../../test-setup.ts'`, `jsr:@std/testing/bdd`, real `db`, inline `crypto.randomUUID()` fixtures, hard-delete `afterEach`, `{ sanitizeOps: false, sanitizeResources: false }` on every `describe`). Covers every exported function in `equipment/model.ts`: `findById` (active + soft-deleted-returns-null), `findManyWithFilters` (filters + pagination + excludes deleted), `search` (LIKE match + excludes deleted + limit 10), `create`, `update` (active + soft-deleted regression — `update` lacks the `isNull(deletedAt)` guard, same bug class as `vendor/model.ts update`; design Decision 4 documents the decision to test current behaviour as a regression baseline, NOT to add the guard in this change), `softDelete` (D19 three-`it` pattern: active → already-deleted-returns-null → no-timestamp-overwrite), `createDeleteRequest` (insert + status default), and `getRecipesUsingEquipment` (both list + count branches: visibility filter excludes non-public, `deletedAt` filter excludes soft-deleted recipes, equipment filter matches only linked recipes, pagination, total count, author relation joined).
- `apps/api/src/modules/vendor/model.test.ts` — **new**. Same pattern. Covers `findById`, `findMany`, `search`, `create`, `softDelete` (three-`it`), and a regression `it` documenting that `update` mutates soft-deleted rows (the unguarded path — design Decision 4).
- `apps/web/src/components/recipe-list/RecipeCard.test.tsx`, `FilterField.test.tsx`, `ActiveFilterBadge.test.tsx`, `PaginationControls.test.tsx`, `useRecipeFilters.test.tsx`, `RecipeListView.test.tsx` — **new**. Vitest + Testing Library + `createMemoryRouter`/`MemoryRouter` (pattern from `LikeButton.test.tsx` / `AuthContext.test.tsx`). Logger mock via `vi.hoisted`. `useRecipeFilters` tested via a `TestConsumer` component that renders hook return fields to `data-testid` spans.
- `apps/web/src/components/auth/RequireAuth.test.tsx` — **new**. Mock `useAuth` via a test `AuthContext.Provider` with controlled value, render under `MemoryRouter`, assert the 4 branches.

**D03 (the refactor — landed after the regression net is green):**

- `apps/api/src/modules/equipment/model.ts` — rewrite `getRecipesUsingEquipment` (L106-142):
  1. Add `exists` to the `drizzle-orm` import on L9 (currently imports `and, asc, count, desc, eq, isNull, like, or, SQL, sql` — add `exists`).
  2. Extract the shared recipe conditions: `const recipeConditions = and(eq(recipes.visibility, 'public'), isNull(recipes.deletedAt));` (referenced by both branches).
  3. Data branch: replace the raw `sql\`${recipes.currentVersionId} IN (SELECT ...)\`` with `exists(db.select({ recipeVersionId: recipeEquipment.recipeVersionId }).from(recipeEquipment).where(eq(recipeEquipment.recipeVersionId, recipes.currentVersionId)))` — wait, that's the correlation; the equipment filter is a separate clause. See the exact form in design Decision 1 — the `exists()` subquery correlates against `recipes.currentVersionId` and filters `recipeEquipment.equipmentId = equipmentId`.
  4. Count branch: keep the existing `innerJoin` chain (already correct Drizzle) but reference the shared `recipeConditions` instead of duplicating the two predicates.
  5. Keep the `sql<number>\`count(distinct ${recipes.id})\`` raw template in the count branch — this is an accepted minor usage (Drizzle's `count()` helper could replace it, but the `distinct` requires the `sql` tag; design Decision 2 documents keeping it).

**D34 (the typing pass):**

- `packages/shared/src/schemas/bean.ts`, `schemas/setup.ts`, `schemas/user.ts` (preference), `schemas/vendor.ts`, `schemas/equipment.ts` — add `export type BeanCreate = z.infer<typeof BeanCreateSchema>` (and `BeanUpdate`, `SetupCreate`, `SetupUpdate`, `UserPreferencesUpdate` flat partial, `VendorCreate`, `VendorUpdate`, `EquipmentCreate`, `EquipmentUpdate`) alongside the schema definitions. These are the inferred payload types the API services will import. **None of these are currently exported** — the schemas are exported as Zod objects only, so the API services cannot derive types from them today (this is why `data: any` was used).
- `apps/api/src/modules/preference/service.ts:26` — `updatePreferences(userId, data: any)` → `updatePreferences(userId, data: UserPreferencesUpdate)` (flat partial type derived from the `userPreferences` DB row or a new shared `UserPreferencesUpdate`).
- `apps/api/src/modules/preference/index.ts:85` — `const flatData: any = {}` → `const flatData: Partial<typeof userPreferences.$inferInsert> = {}` (the flat DB row insert type — NOT the shared nested `UserPreferences` interface; design Decision 3 explains the shape mismatch).
- `apps/api/src/modules/bean/service.ts:34,47` — `data: any` → `data: BeanCreate` / `data: BeanUpdate` (newly exported from shared schemas).
- `apps/api/src/modules/setup/service.ts:38` — `data: any` → `data: SetupCreate` (newly exported).
- `apps/api/src/modules/taste/model.ts:45,50` — `Map<string, any>` + `any[]` → `TasteNoteNode` (new type = `typeof tasteNotes.$inferSelect & { children: TasteNoteNode[] }`, recursive; design Decision 5). Define the type locally in `taste/model.ts` (or export from shared types if the web needs it — the existing shared `TasteHierarchy` is a UI projection missing `parentId`/`depth`/`createdAt`, so a new `TasteNoteNode` is warranted).
- `apps/api/src/modules/recipe/model.ts:466,473` — `.find((ltn: any) => ...)` and `.find((leq: any) => ...)` → type the callbacks with the Drizzle relation-inferred element types. The enclosing `latestVersion` comes from `findById` (L237-256) which returns `db.query.recipes.findFirst({ with: { versions: { with: { tasteNotes: { with: { tasteNote: true } }, equipment: { with: { equipment: true } } } } } })`. The `.find()` callbacks operate on elements of `latestVersion.tasteNotes` / `latestVersion.equipment` — typed via the Drizzle relational inference. The cleanest fix: let TypeScript infer the callback parameter types by removing the `: any` annotations entirely (the array element type is already inferred from `latestVersion`).
- `apps/api/src/modules/badge/model.ts:131` — `eq(badges.rule, check.rule as any)` → import `BadgeRule` from `@brewform/shared/types` (already exported at `types/index.ts:51`, defined as `BadgeRule = (typeof BADGE_RULES)[number]['rule']` in `constants/badges.ts:82`), type `checks` as `Array<{ rule: BadgeRule; met: boolean }>` (currently `Array<{ rule: string; met: boolean }>` at L116), drop the `as any`.
- `apps/api/src/utils/notify/index.ts:87,199` — `prefs: any` → `NotifyRecipient` type `{ email: string; username: string; prefs: typeof userPreferences.$inferSelect | Record<string, never> }` (the `?? {}` fallback makes `prefs` the row type or empty object; design Decision 3 documents why this is NOT the shared nested `UserPreferences`). Define `NotifyRecipient` locally in `notify/index.ts`.
- `apps/api/src/modules/equipment/service.ts:42` — `eq as unknown as Record<string, unknown>` cache cast → P3 stretch; make the `CacheProvider.set` signature accept `unknown` (or add a generic) so the double cast is unnecessary. Design Decision 6 documents this as optional stretch.

**Stretch (P3 — optional, document with comments if not cleanly fixable):**

- `apps/api/src/utils/openapi/index.ts:28` — `z.toJSONSchema(...) as any` (file has `// deno-lint-ignore-file no-explicit-any`). Add a one-line justification comment if a clean typed alternative doesn't exist; this is a library-boundary type gap.
- `apps/api/src/modules/auth/jwt.ts:79,97,98` — `as unknown as` casts around JWT payloads. Simplify to direct `as JwtPayload` where possible (source is `any` from `hono/jwt`, so `unknown` intermediate is unnecessary).
- `apps/api/src/middleware/errorHandler.ts:23,53` — `as unknown as` casts narrowing `Error` to access `details`/`issues`. Replace with type guards or inline interfaces if clean; otherwise document.

**Shared schema tests (D34 prerequisite verification):**

- `packages/shared/src/schemas/bean.test.ts`, `setup.test.ts` — **new or extended** if not already present (D39 Tier 3 lists these as backfill, but since D34 adds `z.infer<>` type exports to these files, a co-located type-rejection `// @ts-expect-error` test in the existing schema test file confirms the export rejects unknown keys). The D34 plan says "Add a negative type test only if a shared payload type is newly exported."

No schema changes. No migrations. No DB package changes (the `TasteNoteNode` and `NotifyRecipient` types are local to the API modules; the `z.infer<>` exports are additive type-only exports in the shared schemas).

## Capabilities

### Modified Capabilities

- **equipment-recipe-query**: The `getRecipesUsingEquipment` function SHALL use the Drizzle query builder exclusively (no raw `sql\`\`` template-tag subqueries) and SHALL fold the duplicated visibility/`deletedAt` predicates into one shared condition set referenced by both the data and count branches. Extends the existing equipment module's query behaviour with a type-safe, refactorable query.
- **api-type-safety**: The API service/model layer SHALL derive payload types from the shared Zod schemas via `z.infer<>` exports (newly added) rather than `any`, and SHALL use Drizzle's inferred relation row types for callback parameters. Extends D05's `any`-elimination requirement to the modules D05 never covered.

### New Capabilities

- **model-test-coverage**: The API model layer functions that currently have zero test coverage (`equipment/model.ts`, `vendor/model.ts`) and the web components shipped by D11 without tests (`recipe-list/*`, `RequireAuth.tsx`) SHALL have dedicated characterisation test files covering the happy path, soft-delete idempotency (D19 three-`it` pattern), and the known unguarded-`update` regression baseline (design Decision 4). These tests are the regression net for D03's refactor and the foundation for D39 Tier 2/3 backfill.

## Impact

**Files changed (production code — 12):**

| File | Change type |
|---|---|
| `apps/api/src/modules/equipment/model.ts` | edit — rewrite `getRecipesUsingEquipment` data branch with `exists()`, extract shared `recipeConditions`, add `exists` to imports |
| `apps/api/src/modules/preference/service.ts` | edit — type `updatePreferences` payload |
| `apps/api/src/modules/preference/index.ts` | edit — type `flatData` |
| `apps/api/src/modules/bean/service.ts` | edit — type `createBean`/`updateBean` payloads |
| `apps/api/src/modules/setup/service.ts` | edit — type `createSetup` payload |
| `apps/api/src/modules/taste/model.ts` | edit — `TasteNoteNode` type for `nodeMap` + `roots` |
| `apps/api/src/modules/recipe/model.ts` | edit — remove `: any` from `.find()` callbacks (let inference work) |
| `apps/api/src/modules/badge/model.ts` | edit — import `BadgeRule`, type `checks`, drop `as any` |
| `apps/api/src/utils/notify/index.ts` | edit — `NotifyRecipient` type |
| `apps/api/src/modules/equipment/service.ts` | edit (P3 stretch) — remove cache double cast if cache provider generic is added |
| `packages/shared/src/schemas/bean.ts` | edit — add `BeanCreate`/`BeanUpdate` type exports |
| `packages/shared/src/schemas/setup.ts` | edit — add `SetupCreate`/`SetupUpdate` type exports |
| `packages/shared/src/schemas/user.ts` | edit — add `UserPreferencesUpdate` flat partial type export (or document using `typeof userPreferences.$inferInsert`) |
| `packages/shared/src/schemas/vendor.ts` | edit — add `VendorCreate`/`VendorUpdate` type exports (if not already present) |
| `packages/shared/src/schemas/equipment.ts` | edit — add `EquipmentCreate`/`EquipmentUpdate` type exports (used by admin service, not strictly D34 but completes the set) |

**Files changed (stretch — 3, optional):**

| File | Change type |
|---|---|
| `apps/api/src/utils/openapi/index.ts` | edit — document the `as any` with a justification comment (or remove if a clean typed alternative exists) |
| `apps/api/src/modules/auth/jwt.ts` | edit — simplify `as unknown as` casts to direct `as` where the source is `any` |
| `apps/api/src/middleware/errorHandler.ts` | edit — replace casts with type guards or inline interfaces, or document |

**Files changed (tests — 9 new, 0 edited):**

| File | Change type |
|---|---|
| `apps/api/src/modules/equipment/model.test.ts` | new — DB-backed model tests (D39 Tier 1 + D03 regression net) |
| `apps/api/src/modules/vendor/model.test.ts` | new — DB-backed model tests (D39 Tier 1) |
| `apps/web/src/components/recipe-list/RecipeCard.test.tsx` | new — Vitest component test |
| `apps/web/src/components/recipe-list/FilterField.test.tsx` | new — Vitest component test |
| `apps/web/src/components/recipe-list/ActiveFilterBadge.test.tsx` | new — Vitest component test |
| `apps/web/src/components/recipe-list/PaginationControls.test.tsx` | new — Vitest component test |
| `apps/web/src/components/recipe-list/useRecipeFilters.test.tsx` | new — Vitest hook test (TestConsumer pattern) |
| `apps/web/src/components/recipe-list/RecipeListView.test.tsx` | new — Vitest component test |
| `apps/web/src/components/auth/RequireAuth.test.tsx` | new — Vitest component test |
| `packages/shared/src/schemas/bean.test.ts` | edit/new — `// @ts-expect-error` type-rejection test for `BeanCreate` (if not already present) |
| `packages/shared/src/schemas/setup.test.ts` | edit/new — `// @ts-expect-error` type-rejection test for `SetupCreate` |

**No schema/migration changes.** The Drizzle schema (`packages/db/src/schema.ts`) is untouched. The `exists()` function is already available in the installed Drizzle version (verified via Context7 docs). `BadgeRule` is already exported from `@brewform/shared/types`. The shared `UserPreferences` interface (nested) is NOT used for the flat DB-row typing — a new `UserPreferencesUpdate` flat partial type or the Drizzle `typeof userPreferences.$inferInsert` is used instead (design Decision 3).

**Stakeholders:** API (equipment, preference, bean, setup, taste, recipe, badge, notify modules), shared (schemas — additive type exports), web (recipe-list components, RequireAuth). DB package, deployment unaffected.

**Risk:** Low-to-medium. D39 Tier 1 is pure new test files (no production change) — zero regression risk, just effort. D03 is a single-function rewrite with a full characterisation test net already in place from D39 Tier 1 (the tests are written FIRST and must pass against the raw-SQL version BEFORE the refactor, then must pass unchanged AFTER — that's the definition of a safe refactor). D34 is compile-time-only typing changes (no runtime behaviour change) — the only design decisions are the `TasteNoteNode` shape and the `UserPreferences` flat-vs-nested distinction. The P3 stretch casts are optional and can be deferred.

**Verification:** `make fmt` (mandatory before commit — CI enforces `deno fmt --check`), `make check` (type-check all workspaces — catches D34's type errors), `make lint` (catches new `any` and lint regressions), `make test` (runs the new equipment/vendor model tests, the new web component tests, and the full existing suite via Docker with `--allow-all`). The OpenAPI coverage test (`apps/api/src/routes/openapi.coverage.test.ts`) is unaffected — no routes are added or changed in Wave 2 (D03 is an internal model refactor; the `GET /:id/recipes` route's response shape is unchanged). Run the D39 Tier 1 tests against the pre-refactor `getRecipesUsingEquipment` first (must pass), then apply D03, then re-run (must still pass) — this is the query-equivalence verification.

## Out of Scope

- **D39 Tier 2/3 test backfill** (badge/bean/comment/follow/photo/preference/qrcode/report/setup model tests, route-layer tests, util tests, admin/auth web page tests, remaining hooks/contexts). Tracked as ongoing background work in `ROADMAP.md` Wave 4. Wave 2 ships Tier 1 only (the unblock for D03) plus the recipe-list/RequireAuth web tests.
- **Adding the `isNull(deletedAt)` guard to `vendor/model.ts update` and `equipment/model.ts update`.** These functions lack the guard (the `update` returns non-null for soft-deleted rows), but adding the guard is a behaviour change that belongs in a separate D19-line follow-up, NOT in Wave 2. Wave 2's `vendor/model.test.ts` and `equipment/model.test.ts` document the **current** behaviour as a regression baseline (the test asserts `update` mutates the soft-deleted row — if a future change adds the guard, this test fails and forces a conscious update). See design Decision 4.
- **Replacing `sql<number>\`count(distinct ...)\`` in the count branch.** The `sql` template tag is still used for the `count(distinct)` expression because Drizzle's `count()` helper doesn't support `DISTINCT` directly. This is an accepted minor usage (the `sql` tag is parameterised and type-annotated); design Decision 2 documents keeping it.
- **D42 (typed web API boundary), D43 (join-table timestamps), D35 (lint suppressions in shared).** These are Wave 4 "independent fillers" per `ROADMAP.md` and are not part of Wave 2.
- **Full `TasteNoteNode` export to shared types.** The type is defined locally in `taste/model.ts` for now. If the web needs it, a follow-up can promote it to `@brewform/shared/types` — but the existing shared `TasteHierarchy` (UI projection) is a different shape, so they should not be merged.
- **Refactoring `notify/index.ts` to use the shared nested `UserPreferences` shape.** The DB row is flat; the shared `UserPreferences` is nested. Changing `notify` to use the nested shape would require a mapping layer and is a behaviour change. Out of scope — `NotifyRecipient.prefs` uses the flat DB row type.
- **i18n for any web test assertions.** Tests assert on rendered text/labels as they exist today; if D40's i18n wave changes the strings, the tests will need updating — but that's a D40-line follow-up, not Wave 2.