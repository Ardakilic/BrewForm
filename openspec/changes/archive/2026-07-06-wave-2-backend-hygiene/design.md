## Context

Wave 2 of the debt roadmap bundles three backend-hygiene items (`D03` + `D34` + `D39 Tier 1`) into one shippable change. The `ROADMAP.md` explicitly sequences them together: "Do **D39 Tier 1 first** (equipment/vendor model tests) — the plan frames these as D03's regression net, since `equipment/model.ts` currently has zero tests." This design treats them as three independent sub-changes (D39 Tier 1, D03, D34) that land in one commit, with D39 Tier 1 written FIRST and verified green against the pre-refactor code before D03's refactor is applied.

### Architecture — the three sub-changes at a glance

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  WAVE 2 — three independent sub-changes, one PR                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  D39 Tier 1 — characterisation tests (the regression net — LAND FIRST)       │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  apps/api/src/modules/equipment/model.test.ts (NEW)                    │  │
│  │    findById / findManyWithFilters / search / create / update /         │  │
│  │    softDelete (D19 three-it) / createDeleteRequest /                    │  │
│  │    getRecipesUsingEquipment (list + count branches — D03 net)           │  │
│  │                                                                        │  │
│  │  apps/api/src/modules/vendor/model.test.ts (NEW)                      │  │
│  │    findById / findMany / search / create /                             │  │
│  │    softDelete (three-it) / update (regression baseline)               │  │
│  │                                                                        │  │
│  │  apps/web/src/components/recipe-list/*.test.tsx (NEW, 6 files)        │  │
│  │    RecipeCard / FilterField / ActiveFilterBadge /                     │  │
│  │    PaginationControls / useRecipeFilters (hook) / RecipeListView       │  │
│  │                                                                        │  │
│  │  apps/web/src/components/auth/RequireAuth.test.tsx (NEW)              │  │
│  │    loading / unauthenticated / non-admin+requireAdmin / admin          │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  D03 — raw SQL → Drizzle query builder (the refactor — LAND SECOND)         │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  equipment/model.ts  getRecipesUsingEquipment (L106-142)              │  │
│  │    1. add `exists` to drizzle-orm import (L9)                         │  │
│  │    2. extract shared recipeConditions                                 │  │
│  │       const recipeConditions =                                        │  │
│  │         and(eq(recipes.visibility,'public'), isNull(recipes.deletedAt))│  │
│  │    3. data branch: replace sql`... IN (SELECT ...)` with              │  │
│  │       exists(db.select({recipeVersionId: recipeEquipment.recipeVersionId})│  │
│  │              .from(recipeEquipment)                                    │  │
│  │              .where(and(                                              │  │
│  │                eq(recipeEquipment.equipmentId, equipmentId),          │  │
│  │                eq(recipeEquipment.recipeVersionId, recipes.currentVersionId),│  │
│  │              )))                                                       │  │
│  │    4. count branch: reference recipeConditions (dedupe predicates)   │  │
│  │    5. keep sql<number>`count(distinct ...)` (accepted, Decision 2)    │  │
│  │                                                                        │  │
│  │  Verification: D39 Tier 1 tests pass UNCHANGED against the refactored  │  │
│  │  query — that's the definition of a safe refactor.                    │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  D34 — residual any elimination (the typing pass — LAND THIRD)              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  packages/shared/src/schemas/*.ts  add z.infer<> type exports          │  │
│  │    BeanCreate/Update, SetupCreate/Update, UserPreferencesUpdate,       │  │
│  │    VendorCreate/Update, EquipmentCreate/Update                        │  │
│  │                                                                        │  │
│  │  preference/service.ts:26   data: any → UserPreferencesUpdate        │  │
│  │  preference/index.ts:85     flatData: any → flat DB row partial       │  │
│  │  bean/service.ts:34,47      data: any → BeanCreate / BeanUpdate      │  │
│  │  setup/service.ts:38         data: any → SetupCreate                 │  │
│  │  taste/model.ts:45,50        any[] → TasteNoteNode[] (recursive)      │  │
│  │  recipe/model.ts:466,473     remove :any, let Drizzle inference work  │  │
│  │  badge/model.ts:116,131      string → BadgeRule (already in shared)  │  │
│  │  notify/index.ts:87,199      any → NotifyRecipient (flat prefs)       │  │
│  │  equipment/service.ts:42     (P3 stretch) cache cast via generic      │  │
│  │                                                                        │  │
│  │  Stretch (P3, optional):                                              │  │
│  │    openapi/index.ts:28, jwt.ts:79/97/98, errorHandler.ts:23/53         │  │
│  │    → simplify or document with justification comments                  │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Codebase facts (verified 2026-07-05 on `main`)

**D03:**
- `apps/api/src/modules/equipment/model.ts:9` imports `and, asc, count, desc, eq, isNull, like, or, SQL, sql` from `drizzle-orm` — **`exists` is NOT imported** (must be added).
- The raw SQL is at L120-123, inside the **data branch** (`db.query.recipes.findMany` at L113). The count branch (L129-139) already uses proper Drizzle `innerJoin` chains.
- The duplicated predicates: `eq(recipes.visibility, 'public')` at L118 (data) and L136 (count); `isNull(recipes.deletedAt)` at L119 (data) and L137 (count).
- `db` from `@brewform/db` (`packages/db/src/index.ts:7`) is created with `{ schema }`, so `db.query.recipes.findMany({ with: { author: ... } })` (the relational API used in the data branch) is fully available and typed.
- There is **no direct `recipes ↔ equipment` relation**. Equipment is reachable only via `recipes.currentVersionId → recipeVersions.id → recipeEquipment.recipeVersionId → recipeEquipment.equipmentId`. The `recipesRelations` (`schema.ts:868`) does not include an `equipment` link. This is why the model uses a subquery/join rather than a relational `with`.
- **Table name gotcha:** the `recipes` export maps to physical table `'recipe'` (singular); `recipeVersions` → `'recipe_version'`; `recipeEquipment` → `'recipe_equipment'`. Column names are snake_case in DB (`current_version_id`, `recipe_version_id`, `equipment_id`, `created_at`, `deleted_at`, `visibility`).
- `recipeEquipment` (`schema.ts:263-281`) has **no `deletedAt`** — it's a pure join table with a unique constraint on `(recipeVersionId, equipmentId)` and `ON DELETE CASCADE` from `recipeVersions`.
- Only **one production caller**: `service.getRecipesForEquipment` (`service.ts:158-167`), called by the `GET /:id/recipes` route (`index.ts:149`). The refactor's blast radius is contained to `model.ts`.
- The `GET /:id/recipes` route's response shape (`EquipmentRecipesResponseSchema` at `packages/shared/src/schemas/responses/equipment.ts`) is `{ data: [...], total: number }` — the refactor must NOT change this shape.
- Drizzle's `exists()` (verified via Context7 `/drizzle-team/drizzle-orm-docs`): `exists(query)` where `query = db.select().from(table).where(...)`. Produces `WHERE EXISTS (SELECT ... FROM table WHERE ...)`. For a correlated subquery, the inner `.where()` references the outer table's column (e.g. `eq(recipeEquipment.recipeVersionId, recipes.currentVersionId)`).

**D34:**
- `packages/shared/src/schemas/` exports Zod schema **objects** only — **no `z.infer<>` type exports** for the input schemas. This is the root cause: API services cannot derive types from the schemas, so they used `any`. The fix adds `export type BeanCreate = z.infer<typeof BeanCreateSchema>` (etc.) alongside the schema definitions.
- The shared `UserPreferences` interface (`types/user.ts:41`) is **nested** (has `emailNotifications: { newFollower, recipeLiked, recipeCommented, followedUserPosted }`), but the DB row (`user_preferences` table) is **flat** (`newFollower`, `recipeLiked`, `recipeCommented`, `followedUserPosted` as top-level boolean columns). The `preference/model.ts upsert` accepts `Partial<typeof userPreferences.$inferInsert>` (flat). The `preference/index.ts` route handler builds a **flat** `flatData` object from the nested `body` (spreading `body.emailNotifications.*` into top-level keys). So `flatData`'s type is the flat DB row partial, NOT `UserPreferences`.
- `BadgeRule` is **already exported** from `@brewform/shared/types` (`types/index.ts:51`, defined as `BadgeRule = (typeof BADGE_RULES)[number]['rule']` in `constants/badges.ts:82`). It's the string union `'first_brew' | 'decade_brewer' | ... | 'influencer'`. The `badges.rule` column is `badgeRuleEnum('rule')` (`schema.ts:674`), which shares the same source-of-truth tuple — `BadgeRule` is assignable to it.
- `taste/model.ts:45` has `Map<string, any>` and L50 has `any[]` — **both** are the `TasteNoteNode` type (D34 only listed L50, but L45 is the same type). The shared `TasteHierarchy` (`types/taste.ts`) is a UI projection (id/name/color/definition/children) missing `parentId`/`depth`/`createdAt` — it is NOT the right type for the model's internal tree.
- `recipe/model.ts:466,473` — the `.find()` callbacks are inside `forkRecipe` (L358). The `latestVersion` (L362) comes from `findById` (L237-256), which returns `db.query.recipes.findFirst({ with: { versions: { with: { tasteNotes: { with: { tasteNote: true } }, equipment: { with: { equipment: true } } } } } })`. The array element types are inferred by Drizzle's relational query — removing the `: any` annotations lets TypeScript infer them automatically. No new type definitions needed; just delete the annotations.
- `notify/index.ts:87` — `loadRecipient` returns `{ email, username, prefs: any }` where `prefs = result[0].user_preferences ?? {}` (a left-joined `userPreferences` row or empty object). The `prefs.newFollower` / `prefs.recipeLiked` / `prefs.recipeCommented` / `prefs.followedUserPosted` accesses (L111, L134, L158, L199) are the flat DB row fields. So `NotifyRecipient.prefs` is `typeof userPreferences.$inferSelect | Record<string, never>`.
- `notify/index.ts:199` — `.filter((r: any) => r.prefs.followedUserPosted !== false)` — `r` is the mapped object `{ email, username, prefs }`, same shape as `loadRecipient`'s return.
- Line-number drift from the D34 plan: `notify/index.ts` (75→87, 170→199), `errorHandler.ts` (17→23, 47→53). All other cited lines match.

**D39 Tier 1:**
- `apps/api/src/modules/equipment/model.ts` (150 lines) exports 9 functions, all with docblocks: `findById`, `findMany`, `search`, `create`, `update`, `softDelete`, `findManyWithFilters`, `getRecipesUsingEquipment`, `createDeleteRequest`. **Zero test coverage** — only `service.test.ts` (38-line stub that doesn't exercise real service) and `index.test.ts` (261-line route integration with mocked service) exist.
- `apps/api/src/modules/vendor/model.ts` (62 lines) exports 6 functions: `findById`, `findMany`, `search`, `create`, `update`, `softDelete`. **Zero test coverage** — only `service.test.ts` (154-line DB-backed service test with logger spies) exists. The `update` function lacks the `isNull(deletedAt)` guard (uses bare `eq(vendors.id, id)`), same bug class as the admin `updateVendor` that D41 fixed — but at the model layer, the service layer's `findById`-first check protects callers. The model-layer guard is a separate D19-line follow-up (Decision 4).
- The reference pattern for DB-backed model tests is `apps/api/src/modules/admin/model.test.ts` (495 lines): `// deno-lint-ignore-file no-explicit-any require-await` header, `import '../../test-setup.ts'`, `jsr:@std/testing/bdd` (`describe`/`it`/`beforeEach`/`afterEach`), `jsr:@std/expect`, real `db` from `@brewform/db`, inline `crypto.randomUUID()` fixtures, `db.insert(users).values({ id, email: \`test-${userId}@example.com\`, username: \`testuser-${userId}\`, passwordHash: 'hash' })`, hard-delete `afterEach` (child tables first, then parent), `{ sanitizeOps: false, sanitizeResources: false }` on every `describe`. The D19 `deleteEquipment` block is the three-`it` template (active → already-deleted-returns-null → no-timestamp-overwrite-with-10ms-delay-and-DB-reread).
- The web test pattern is Vitest (`apps/web/vitest.config.ts`, `environment: 'jsdom'`, `globals: true`, setup at `src/test-setup.ts` which loads `@testing-library/jest-dom`). Imports: `{ beforeEach, describe, expect, it, vi }` from `vitest`, `{ render, screen, waitFor }` from `@testing-library/react`, `userEvent` from `@testing-library/user-event`. Logger mock via `vi.hoisted` + `vi.mock('@/utils/logger.ts', ...)`. Components using `useNavigate`/`useSearchParams`/`useNavigation`/`useLocation` → render via `createMemoryRouter` + `RouterProvider` with `initialEntries` (pattern from `LikeButton.test.tsx`). Hook tests via a `TestConsumer` component (pattern from `AuthContext.test.tsx`). The `.exploration.test.*` / `.preservation.test.*` / `__tests__/*.integration.test.*` files are excluded from the default Vitest run (separate `vitest.pbt.config.ts`).
- `apps/web/src/components/recipe-list/` has 8 files: `ActiveFilterBadge.tsx`, `constants.ts`, `FilterField.tsx`, `index.ts`, `PaginationControls.tsx`, `RecipeCard.tsx`, `RecipeListView.tsx`, `useRecipeFilters.ts`. All have docblocks. `RecipeCard` uses `useNavigate` (needs router); `useRecipeFilters` uses `useSearchParams` (needs router with query string); `RecipeListView` uses `useNavigation`/`useLocation`/`useRecipeFilters` (needs router).
- `apps/web/src/components/auth/RequireAuth.tsx` (24 lines) has 3 redirect branches: `isLoading` → `<PageSkeleton />`, `!isAuthenticated` → `<Navigate to='/login' />`, `requireAdmin && !user?.isAdmin` → `<Navigate to='/' />`, else children. Uses `useAuth()` from `AuthContext`.
- No shared test helper/fixture factory exists for API or web. Every test inlines its own fixtures. A Wave 2 spec that proposes shared helpers would introduce a new convention — the existing pattern is "copy-paste the fixture inline per describe block." Wave 2 follows the existing pattern (no new helpers).
- Test commands: `make test-specific filter=apps/api/src/modules/equipment/model.test.ts` (single API test file via Docker); `make test-web` (full web suite); single web file: `deno task --cwd apps/web test src/components/recipe-list/RecipeCard.test.tsx` (appends path as Vitest filter — no Makefile target for single web test).

### Stakeholders

- **API (`apps/api/`)** — equipment module (D03 + D39 Tier 1), vendor module (D39 Tier 1), preference/bean/setup/taste/recipe/badge modules (D34), notify util (D34). All Wave 2 code lives here except the shared schema type exports and the web tests.
- **Shared (`packages/shared/`)** — `schemas/*.ts` get additive `z.infer<>` type exports (D34 prerequisite). No schema object changes, no new schemas.
- **Web (`apps/web/`)** — `recipe-list/` components and `RequireAuth` get new test files (D39 Tier 1). No production web code changes in Wave 2.
- **DB package** — unaffected (no schema, no migration).
- **Deployment** — unaffected.

## Goals / Non-Goals

**Goals:**
- D39 Tier 1: write DB-backed characterisation tests for `equipment/model.ts` and `vendor/model.ts` (covering every exported function, with the D19 three-`it` pattern for `softDelete`, and the `getRecipesUsingEquipment` list+count branches as D03's regression net). Write Vitest component tests for the 6 `recipe-list/` components and `RequireAuth`. All tests pass against the pre-refactor code.
- D03: rewrite `getRecipesUsingEquipment` to use Drizzle's `exists()` correlated subquery (no raw `sql\`\`` subquery), fold the duplicated visibility/`deletedAt` predicates into one shared `recipeConditions`, and verify the D39 Tier 1 tests pass unchanged against the refactored query.
- D34: eliminate the 12 P2 `any` locations by deriving payload types from shared Zod schemas (adding `z.infer<>` exports), introducing `TasteNoteNode` and `NotifyRecipient` types, importing the existing `BadgeRule`, and letting Drizzle's relational inference type the `recipe/model.ts` callbacks. Optionally address the P3 stretch casts.
- All: add JSDoc to every new exported function/type (test helper functions can omit JSDoc per the existing test-file convention). Pass `make check`, `make lint`, `make fmt`, `make test`.

**Non-Goals:**
- Adding the `isNull(deletedAt)` guard to `vendor/model.ts update` or `equipment/model.ts update` (separate D19-line follow-up; Decision 4).
- Replacing `sql<number>\`count(distinct ...)\`` in the count branch (accepted minor usage; Decision 2).
- D39 Tier 2/3 backfill (Wave 4 ongoing work).
- D42, D43, D35 (Wave 4 independent fillers).
- Promoting `TasteNoteNode` to shared types (the existing `TasteHierarchy` is a different shape).
- Refactoring `notify` to use the nested `UserPreferences` shape (behaviour change; out of scope).
- i18n for web test assertions (D40-line follow-up).

## Decisions

### Decision 1 (D03) — Use `exists()` correlated subquery, not `inArray()`

The D03 plan offered two options: `exists()` (recommended) and `inArray()`. Verified against Drizzle docs (Context7 `/drizzle-team/drizzle-orm-docs`):

```ts
// exists() — correlated subquery
const sq = db.select({ id: sql`1` }).from(posts).where(eq(posts.userId, users.id));
await db.select().from(users).where(exists(sq));
// → SELECT * FROM users WHERE EXISTS (SELECT 1 FROM posts WHERE posts.user_id = users.id)

// inArray() — subquery membership
const query = db.select({ data: table2.column }).from(table2);
db.select().from(table).where(inArray(table.column, query));
// → SELECT * FROM table WHERE table.column IN (SELECT table2.column FROM table2)
```

**Decision: `exists()`.** Rationale: (1) semantically correct (checking existence, not membership); (2) PostgreSQL optimizes `EXISTS` better than `IN` for correlated subqueries (the subquery is evaluated per-row and can short-circuit); (3) the correlation is explicit and readable.

The exact rewritten data branch:

```ts
// shared conditions (folded from the duplicated predicates)
const recipeConditions = and(
  eq(recipes.visibility, 'public'),
  isNull(recipes.deletedAt),
);

const [data, countResult] = await Promise.all([
  db.query.recipes.findMany({
    with: {
      author: { columns: { username: true, displayName: true, avatarUrl: true } },
    },
    where: and(
      recipeConditions,
      exists(
        db.select({ recipeVersionId: recipeEquipment.recipeVersionId })
          .from(recipeEquipment)
          .where(
            and(
              eq(recipeEquipment.equipmentId, equipmentId),
              eq(recipeEquipment.recipeVersionId, recipes.currentVersionId),
            ),
          ),
      ),
    ),
    orderBy: desc(recipes.createdAt),
    limit: perPage,
    offset,
  }),
  db.select({ count: sql<number>`count(distinct ${recipes.id})` })
    .from(recipes)
    .innerJoin(recipeVersions, eq(recipes.currentVersionId, recipeVersions.id))
    .innerJoin(recipeEquipment, eq(recipeVersions.id, recipeEquipment.recipeVersionId))
    .where(
      and(
        eq(recipeEquipment.equipmentId, equipmentId),
        recipeConditions,  // folded — was duplicated at L136-137
      ),
    ),
]);
```

The `exists()` subquery correlates against `recipes.currentVersionId` (the outer query's column) AND filters `recipeEquipment.equipmentId = equipmentId`. The count branch keeps the `innerJoin` chain (already correct Drizzle) and references the shared `recipeConditions`.

### Decision 2 (D03) — Keep `sql<number>\`count(distinct ...)\`` in the count branch

The count branch uses `sql<number>\`count(distinct ${recipes.id})\`` — a raw `sql` template tag. Drizzle's `count()` helper does not support `DISTINCT` directly (it produces `count(...)`, not `count(distinct ...)`). The `sql` tag is parameterised and type-annotated (`<number>`), so it's safe. Replacing it with a pure-Drizzle equivalent would require a subquery (`count()` of a distinct subquery) that is more complex and less readable than the current form. **Decision: keep it.** This is an accepted minor `sql`-tag usage, not a violation of the "no raw SQL" rule (the rule targets hand-written SQL strings with column-name interpolation, not Drizzle's typed `sql` helpers).

### Decision 3 (D34) — `UserPreferences` flat DB row vs nested shared interface

The shared `UserPreferences` (`types/user.ts:41`) is nested: `emailNotifications: { newFollower, recipeLiked, recipeCommented, followedUserPosted }`. The `user_preferences` DB table is flat: `newFollower`, `recipeLiked`, `recipeCommented`, `followedUserPosted` are top-level boolean columns.

- `preference/model.ts upsert` accepts `Partial<typeof userPreferences.$inferInsert>` (flat).
- `preference/index.ts` route handler flattens the nested `body.emailNotifications.*` into the flat `flatData` (L85-96).
- `notify/index.ts loadRecipient` reads the flat DB row (`result[0].user_preferences`) and accesses `prefs.newFollower` etc.

**Decision: use the flat DB row type (`typeof userPreferences.$inferInsert` / `$inferSelect`) for `flatData` and `NotifyRecipient.prefs`, NOT the shared nested `UserPreferences`.** The shared `UserPreferences` is the API response shape (nested for client convenience); the DB and internal service layer use the flat row. Adding a `UserPreferencesUpdate` export to `packages/shared/src/schemas/user.ts` as `z.infer<typeof UserPreferencesSchema>` would give the **nested** shape (because `UserPreferencesSchema` nests `emailNotifications`) — that's the wrong shape for `flatData`. The correct type for `flatData` is `Partial<typeof userPreferences.$inferInsert>` (imported from the DB schema) OR a new flat shared type. Since the D34 plan says "Export inferred payload types from shared schemas," and the shared schema is nested, the spec uses the DB row type directly (`typeof userPreferences.$inferInsert`) for `flatData` and `NotifyRecipient.prefs` — this avoids the shape mismatch and requires no new shared type. The `updatePreferences` service signature uses `Partial<typeof userPreferences.$inferInsert>` (matching the downstream `model.upsert`).

### Decision 4 (D39 Tier 1) — Test the unguarded `update` as a regression baseline, do NOT add the guard

`vendor/model.ts update` (L41) and `equipment/model.ts update` (L55) lack the `isNull(deletedAt)` guard — they use bare `eq(<t>.id, id)` and will mutate soft-deleted rows. This is the same bug class as the admin `updateVendor`/`updateEquipment` that D41 fixed, but at the model layer.

**Decision: do NOT add the guard in Wave 2.** Rationale: (1) the service layer (`vendor/service.ts updateVendor`, `equipment/service.ts updateEquipment`) calls `model.findById` first, which DOES guard — so the unguarded `model.update` is only reachable if a caller bypasses the service layer, which no current caller does. (2) Adding the guard is a behaviour change (returns `null` for soft-deleted rows) that belongs in a D19-line follow-up, not bundled into a hygiene change. (3) The D39 Tier 1 tests **document the current behaviour as a regression baseline**: a test asserts `model.update(deletedId, { name })` returns non-null and the row is mutated. If a future change adds the guard, this test fails and forces a conscious update — that's the intended behaviour of a characterisation test.

### Decision 5 (D34) — `TasteNoteNode` is a recursive type defined locally in `taste/model.ts`

The `getHierarchy` function builds a tree: `nodeMap: Map<string, any>` (L45) and `roots: any[]` (L50). Each node is a `tasteNotes` row plus a `children` array of the same shape. The shared `TasteHierarchy` (`types/taste.ts`) is a UI projection (id/name/color/definition/children) missing `parentId`/`depth`/`createdAt`.

**Decision: define `TasteNoteNode` locally in `taste/model.ts`:**

```ts
/** A taste-note row with its nested children, used by getHierarchy. */
interface TasteNoteNode extends typeof tasteNotes.$inferSelect {
  children: TasteNoteNode[];
}
```

This is a recursive type (TypeScript supports it). It's defined locally (not exported to shared) because the web uses `TasteHierarchy` (the projection), and merging them would be a behaviour change. Both `nodeMap` (`Map<string, TasteNoteNode>`) and `roots` (`TasteNoteNode[]`) use it.

### Decision 6 (D34 P3 stretch) — Equipment cache cast: make cache provider generic OR defer

`equipment/service.ts:42` — `eq as unknown as Record<string, unknown>` cast for `cacheProvider.set`. The `CacheProvider` interface's `set` method accepts `Record<string, unknown>`. The double cast is needed because the equipment row type isn't `Record<string, unknown>`.

**Decision: optional stretch.** If the `CacheProvider` interface can be made generic (`CacheProvider<T>` with `set(key, value: T)`) or accept `unknown` cleanly without breaking other callers, do it. Otherwise, add a one-line justification comment and defer. This is P3 and does not block the P2 scope.

### Decision 7 (D34 P3 stretch) — Library-boundary casts: document or simplify

- `openapi/index.ts:28` — `z.toJSONSchema(...) as any` (file has `// deno-lint-ignore-file no-explicit-any`). The `z.toJSONSchema` return type doesn't match the `hono-openapi` expected schema type. **Decision: add a one-line justification comment** (clean typed alternative doesn't exist in `hono-openapi` v1.3.0).
- `auth/jwt.ts:79,97,98` — `as unknown as` casts around JWT payloads from `hono/jwt` (which returns `any`). **Decision: simplify to direct `as JwtPayload`** (source is `any`, so `unknown` intermediate is unnecessary; `as any` is not needed because `any` is assignable to anything).
- `errorHandler.ts:23,53` — `as unknown as` casts narrowing `Error` to access `details`/`issues`. **Decision: replace with inline interfaces + type guards** (`if (err instanceof Error && 'details' in err) { const details = (err as Error & { details: string[] }).details; ... }`) — cleaner than the double cast and lint-friendly.

### Decision 8 (D34) — `recipe/model.ts` callbacks: remove `: any`, let Drizzle inference work

The `.find((ltn: any) => ...)` and `.find((leq: any) => ...)` callbacks at L466, L473 operate on elements of `latestVersion.tasteNotes` / `latestVersion.equipment`. The `latestVersion` (L362) is typed by Drizzle's relational inference from `findById` (L237-256). The array element types are already inferred — the `: any` annotations are not just unnecessary, they actively widen the type (defeating the inference).

**Decision: remove the `: any` annotations entirely.** TypeScript will infer the parameter types from the array. No new type definitions needed. If inference produces a complex Drizzle relation type that's hard to read, leave it — the inference is correct and any field-access error will be caught at compile time. Do NOT manually annotate with `typeof recipeTasteNotes.$inferSelect` (that's the base table row, missing the joined `tasteNote` relation — the inference is more precise).

### Decision 9 (D34) — `BadgeRule` import: use the existing shared export, do not redefine

`badge/model.ts:116` types `checks` as `Array<{ rule: string; met: boolean }>` — the `rule` literal strings are widened to `string`, requiring `check.rule as any` at L131. The `BadgeRule` union (`'first_brew' | ... | 'influencer'`) is **already exported** from `@brewform/shared/types` (`types/index.ts:51`).

**Decision: `import type { BadgeRule } from '@brewform/shared/types'` and type `checks` as `Array<{ rule: BadgeRule; met: boolean }>`.** The `badges.rule` column is `badgeRuleEnum('rule')` which shares the same source tuple — `BadgeRule` is assignable to it, so the `as any` cast is removed. No new type definitions needed.

### Decision 10 (D39 Tier 1 web) — Test the hook via a TestConsumer, not `renderHook`

`useRecipeFilters` is a hook. Vitest's `@testing-library/react` doesn't export `renderHook` by default (it's in `@testing-library/react-hooks`, which is not installed). The existing pattern (`AuthContext.test.tsx`) uses a `TestConsumer` component that reads the context and renders fields to `data-testid` spans.

**Decision: use the TestConsumer pattern.** Create a tiny component inside the test file that calls `useRecipeFilters()` and renders `page`, `brewMethod`, `drinkType`, `visibility`, `sortBy`, `search`, `equipmentId`, `mainBrewer`, `tasteNoteIds.join(',')` to `data-testid` spans. Render it via `createMemoryRouter` with `initialEntries` carrying the query string to test parsing. Assert on the spans.

## Risks / Trade-offs

- **D03 query-equivalence:** The `exists()` rewrite must return identical results to the raw `IN (...)` subquery. The D39 Tier 1 `getRecipesUsingEquipment` tests (written against the pre-refactor code) are the equivalence verification — they must pass unchanged after the refactor. Risk is low: `EXISTS` and `IN` are semantically equivalent for this query shape, and PostgreSQL's planner optimizes both similarly. The one edge: `EXISTS` correlates per-row (the subquery references `recipes.currentVersionId`), while the raw `IN` was a one-shot subquery — but since the `IN` subquery also filtered by `equipmentId`, the result set is identical.
- **D34 `UserPreferences` shape:** Using the flat DB row type for `flatData` and `NotifyRecipient.prefs` is correct but diverges from the D34 plan's suggestion of a shared `UserPreferencesUpdate`. The divergence is intentional (Decision 3) — the shared nested shape doesn't match the flat DB row. The implementer must NOT use `z.infer<typeof UserPreferencesSchema>` for `flatData` (that's nested) — use `Partial<typeof userPreferences.$inferInsert>` from the DB schema.
- **D39 Tier 1 `update` regression baseline:** The tests assert `model.update(deletedId, ...)` mutates the soft-deleted row (current behaviour). This locks the bug as a baseline. If a future change adds the guard, the test fails — which is the intended behaviour. The test docblock should explain why it asserts the "wrong" behaviour.
- **D34 P3 stretch may be deferred:** The library-boundary casts (`openapi`, `jwt`, `errorHandler`) are optional. If the implementer is time-constrained, document them with justification comments and defer the cleanup. The P2 scope (12 locations) is the required delivery.
- **Web tests don't run in `make test-api`:** The web tests run via `make test-web` (Vitest). The API tests run via `make test-api` (Deno test). `make test` runs both. The implementer must run `make test-web` separately when iterating on web tests (the `make test-specific filter=...` target uses the Deno runner and does NOT work for web tests).
- **`exists()` import:** The Drizzle version installed must support `exists()`. Verified via Context7 docs — `exists` is in `drizzle-orm`'s core operators. The `import { exists } from 'drizzle-orm'` should resolve; if not, check `deno.json` / `deno.lock` for the Drizzle version.

## Migration Plan

No data migration, feature flag, or deploy sequencing needed. All changes are code-only. D03 is an internal query refactor (response shape unchanged). D34 is compile-time-only typing. D39 Tier 1 is pure new tests.

**Order of implementation (tasks doc follows this):**
1. D39 Tier 1 — `equipment/model.test.ts` (write, run against pre-refactor code, must pass).
2. D39 Tier 1 — `vendor/model.test.ts` (write, run, must pass).
3. D39 Tier 1 — web component tests (`recipe-list/*`, `RequireAuth`) — write, run via `make test-web`, must pass.
4. D03 — rewrite `getRecipesUsingEquipment` with `exists()` + shared `recipeConditions`.
5. D03 — re-run `equipment/model.test.ts` unchanged — must still pass (query equivalence).
6. D34 — add `z.infer<>` type exports to shared schemas.
7. D34 — eliminate the 12 P2 `any` locations (preference, bean, setup, taste, recipe/model, badge, notify).
8. D34 P3 stretch — library-boundary casts (optional).
9. `make fmt` after each batch of edits, `make check` + `make lint` + `make test` after each sub-change is complete.

Rollback: `git revert` the merge commit. No DB state to undo.

## Open Questions

None blocking. All decisions are resolved above. The P3 stretch (Decision 6, 7) is a time-budget call for the implementer, not an open question.

## Appendix A — Exact DB fixture insert shapes (verified against `schema.ts` 2026-07-05)

A fresh-context implementer needs these to avoid the two trap columns (`recipeVersions.preparationNotes` is NOT NULL with **no default**; `recipeVersions.brewMethod`/`drinkType` are NOT NULL enums with no default) and the circular FK between `recipes.currentVersionId` and `recipeVersions.recipeId`.

### `users` — minimal insert (required: `email`, `username`, `passwordHash`)
```typescript
const userId = crypto.randomUUID();
await db.insert(users).values({
  id: userId,
  email: `test-${userId}@example.com`,
  username: `testuser-${userId}`,
  passwordHash: 'hash',
});
// Auto-defaulted: id (if omitted), onboardingCompleted=false, isAdmin=false, isBanned=false, createdAt, updatedAt
// Nullable (omit): emailVerifiedAt, displayName, avatarUrl, bio, deletedAt
```

### `equipment` — minimal insert (required: `name`, `type`)
```typescript
await db.insert(equipment).values({
  id: equipmentId,
  name: 'Test Grinder',
  type: 'grinder', // must be a valid EquipmentType enum value
  isSystem: false, // redundant (default) but matches admin/model.test.ts convention
  createdBy: userId,
});
// type enum values: 'espresso_machine' | 'grinder' | 'pour_over_brewer' | 'immersion_brewer' |
//   'kettle' | 'milk_tool' | 'scale_accessory' | 'roaster' | 'portafilter' | 'basket' |
//   'puck_screen' | 'paper_filter' | 'tamper' | 'mesh_filter' | 'cezve' | 'thermometer' | 'other'
```

### `vendors` — minimal insert (required: `name` only)
```typescript
await db.insert(vendors).values({
  id: vendorId,
  name: 'Test Roaster',
  createdBy: userId,
});
// Auto-defaulted: id (if omitted), createdAt, updatedAt
// Nullable (omit): website, description, deletedAt
```

### `recipes` — minimal insert (required: `slug`, `title`, `authorId`; `visibility` defaults to `'draft'`)
```typescript
await db.insert(recipes).values({
  id: recipeId,
  slug: `test-recipe-${recipeId}`,
  title: 'Test Recipe',
  authorId: userId,
  visibility: 'public', // override the 'draft' default for the getRecipesUsingEquipment tests
});
// currentVersionId is nullable — set in a SECOND step after the version row exists (circular FK)
// Auto-defaulted: likeCount=0, commentCount=0, forkCount=0, featured=false, createdAt, updatedAt
```

### `recipeVersions` — minimal insert (5 TRAP columns: `recipeId`, `versionNumber`, `brewMethod`, `drinkType`, `preparationNotes`)
```typescript
await db.insert(recipeVersions).values({
  id: versionId, // optional
  recipeId: recipeId, // FK → recipes.id
  versionNumber: 1, // first version
  brewMethod: 'v60', // enum, NOT NULL, no default — MUST be a valid value
  drinkType: 'pour_over', // enum, NOT NULL, no default — MUST be a valid value
  preparationNotes: '', // TRAP: text, NOT NULL, NO default — DO NOT OMIT, pass '' if empty
});
// brewMethod enum values: 'espresso_machine' | 'v60' | 'french_press' | 'aeropress' |
//   'turkish_coffee' | 'drip_coffee' | 'chemex' | 'kalita_wave' | 'moka_pot' | 'cold_brew' | 'siphon'
// drinkType enum values: 'espresso' | 'americano' | 'flat_white' | 'latte' | 'cappuccino' |
//   'cortado' | 'macchiato' | 'turkish_coffee' | 'pour_over' | 'cold_brew' | 'french_press' |
//   'aeropress' | 'drip_coffee' | 'moka_pot' | 'siphon'
// Auto-defaulted: id, brewDate=now(), isFavourite=false, createdAt
// All other columns (productName, coffeeBrand, vendorId, beanId, etc.) are nullable — omit freely
// CHECK constraint: rating BETWEEN 1 AND 10 (only if you set rating; NULL is allowed)
// UNIQUE constraint: (recipeId, versionNumber) — increment versionNumber per recipe
```

### `recipeEquipment` — minimal insert (required: `recipeVersionId`, `equipmentId`)
```typescript
await db.insert(recipeEquipment).values({
  recipeVersionId: versionId,
  equipmentId: equipmentId,
});
// UNIQUE constraint: (recipeVersionId, equipmentId) — can't link same equipment twice to one version
// No deletedAt column — pure join table, hard-deleted via cascade from recipeVersions
```

### `equipmentDeleteRequests` — minimal insert (required: `equipmentId`, `requestedById`)
```typescript
await db.insert(equipmentDeleteRequests).values({
  equipmentId: equipmentId,
  requestedById: userId,
});
// status defaults to 'pending'; reason is nullable (omit or pass a string)
```

### The circular-FK dance for `getRecipesUsingEquipment` fixtures (MANDATORY)

`recipes.currentVersionId` references `recipeVersions.id`, and `recipeVersions.recipeId` references `recipes.id`. You cannot insert both in one shot. The 3-step pattern:

```typescript
// Step 1: Insert recipe WITHOUT currentVersionId
const [recipe] = await db.insert(recipes).values({
  id: recipeId,
  slug: `test-recipe-${recipeId}`,
  title: 'Test Recipe',
  authorId: userId,
  visibility: 'public',
}).returning();

// Step 2: Insert version (recipeId FK can now be satisfied)
const [version] = await db.insert(recipeVersions).values({
  id: versionId,
  recipeId: recipe.id,
  versionNumber: 1,
  brewMethod: 'v60',
  drinkType: 'pour_over',
  preparationNotes: '', // TRAP — do not omit
}).returning();

// Step 3: Link recipe.currentVersionId → version.id
await db.update(recipes).set({ currentVersionId: version.id }).where(eq(recipes.id, recipe.id));

// Step 4 (for getRecipesUsingEquipment): link the equipment to the version
await db.insert(recipeEquipment).values({
  recipeVersionId: version.id,
  equipmentId: equipmentId,
});
```

### Cleanup order (child-first, MANDATORY for afterEach)

```typescript
await db.delete(recipeEquipment).where(eq(recipeEquipment.equipmentId, equipmentId));
await db.delete(recipeVersions).where(eq(recipeVersions.recipeId, recipeId));
await db.delete(recipes).where(eq(recipes.id, recipeId));
await db.delete(equipment).where(eq(equipment.id, equipmentId));
await db.delete(users).where(eq(users.id, userId));
```

For `equipmentDeleteRequests`:
```typescript
await db.delete(equipmentDeleteRequests).where(eq(equipmentDeleteRequests.equipmentId, equipmentId));
await db.delete(equipment).where(eq(equipment.id, equipmentId));
await db.delete(users).where(eq(users.id, userId));
```

## Appendix B — Exact model function signatures (verified against source 2026-07-05)

These are the EXACT signatures the tests must call. Note that `findMany` and `findManyWithFilters` are DIFFERENT functions on the equipment model (the D39 plan lists both), and `vendor.findMany` returns `{ vendors, total }` (not `{ items, total }`).

### `equipment/model.ts` exports (9 functions)
```typescript
findById(id: string): Promise<typeof equipment.$inferSelect | null>
findMany(where: SQL | undefined, page: number, perPage: number): Promise<{ items: ...[]; total: number }>
search(query: string): Promise<...[]>  // matches name/brand/model, limit 10
create(data: typeof equipment.$inferInsert): Promise<typeof equipment.$inferSelect>
update(id: string, data: Partial<typeof equipment.$inferInsert>): Promise<typeof equipment.$inferSelect | null>  // NO isNull(deletedAt) guard
softDelete(id: string): Promise<typeof equipment.$inferSelect | null>  // HAS isNull(deletedAt) guard
findManyWithFilters(params: { type?: string; search?: string; page: number; perPage: number }): Promise<...>
getRecipesUsingEquipment(equipmentId: string, page: number, perPage: number): Promise<{ data: ...[]; total: number }>
createDeleteRequest(data: typeof equipmentDeleteRequests.$inferInsert): Promise<...>
```

### `vendor/model.ts` exports (6 functions)
```typescript
findById(id: string): Promise<typeof vendors.$inferSelect | null>
findMany(page: number, perPage: number): Promise<{ vendors: ...[]; total: number }>  // NOTE: 'vendors' key, not 'items'
search(query: string): Promise<...[]>  // matches NAME only (not brand/model — vendors have no brand/model)
create(data: typeof vendors.$inferInsert): Promise<typeof vendors.$inferSelect>
update(id: string, data: Partial<typeof vendors.$inferInsert>): Promise<typeof vendors.$inferSelect | null>  // NO isNull(deletedAt) guard
softDelete(id: string): Promise<typeof vendors.$inferSelect | null>  // HAS isNull(deletedAt) guard
```

**The `vendor.search` query matches `vendors.name` only** (confirmed at `vendor/model.ts:38`: `like(vendors.name, \`%${query}%\`)`). Vendors have no `brand`/`model` columns. The `equipment.search` query matches `name`/`brand`/`model` (three LIKE clauses). Tests must reflect this difference.