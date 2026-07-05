# D34 — Residual `any` Elimination in Service/Model Layer

**Severity:** Medium
**Status:** Open (2026-07-04)
**Relationship:** Extends [`D05-eliminate-any-types.md`](D05-eliminate-any-types.md) (resolved). D05 cleaned the recipe module, `vendor/service.ts`, `admin/service.ts`, `auth/service.ts`, `photo/service.ts`, and `routes/sitemap.ts` — but a July 2026 sweep found `any` usages in modules D05 never covered.

---

## Problem

`any` parameters and casts persist in API modules outside D05's original scope, undermining type safety exactly where the request payload meets the database layer:

| File:line | Occurrence | Correct type |
|-----------|------------|--------------|
| `apps/api/src/modules/preference/service.ts:26` | `updatePreferences(userId, data: any)` | `UserPreferencesUpdate` (shared schema inference) |
| `apps/api/src/modules/preference/index.ts:85` | `const flatData: any = {}` | explicit record type for the flattened preference payload |
| `apps/api/src/modules/bean/service.ts:34` | `createBean(userId, data: any)` | `BeanCreate` |
| `apps/api/src/modules/bean/service.ts:47` | `updateBean(userId, id, data: any)` | `BeanUpdate` |
| `apps/api/src/modules/setup/service.ts:38` | `createSetup(userId, data: any)` | `SetupCreate` |
| `apps/api/src/modules/taste/model.ts:50` | `const roots: any[] = []` | `TasteNoteNode[]` (hierarchy node type) |
| `apps/api/src/modules/recipe/model.ts:466` | `.find((ltn: any) => ...)` | typed version taste-note relation row |
| `apps/api/src/modules/recipe/model.ts:473` | `.find((leq: any) => leq.equipmentId === ...)` | typed version equipment relation row |
| `apps/api/src/modules/badge/model.ts:131` | `eq(badges.rule, check.rule as any)` | badge-rule union type shared between check definitions and the column |
| `apps/api/src/utils/notify/index.ts:75` | `prefs: any` in resolved recipient shape | `UserPreferences` |
| `apps/api/src/utils/notify/index.ts:170` | `.filter((r: any) => r.prefs.followedUserPosted !== false)` | typed recipient row |
| `apps/api/src/modules/equipment/service.ts:42` | `eq as unknown as Record<string, unknown>` cache cast | make the cache provider generic or accept `unknown` (P3) |

Impact: validated Zod payloads lose their inferred type the moment they cross the route → service boundary, so column renames or schema changes in these modules fail silently at compile time.

### Stretch scope (P3 — library-boundary casts)

These are casts around third-party type gaps rather than laziness; fix only if a clean typed alternative exists, otherwise document with a comment:

- `apps/api/src/utils/openapi/index.ts:28` — `z.toJSONSchema(...) as any` (also covered by D35's suppression cleanup for this file)
- `apps/api/src/modules/auth/jwt.ts:79,95,96` — `as unknown as` casts around JWT payloads
- `apps/api/src/middleware/errorHandler.ts:17,47` — `as unknown as` casts

---

## Proposed Fix

1. **Preference module**: type `updatePreferences` with the update type inferred from the shared preference Zod schema (`z.infer<typeof ...>` re-exported from `@brewform/shared/schemas`). Replace `flatData: any` in `preference/index.ts:85` with an explicit `Record<string, string | number | boolean | null>` (or a mapped partial of the preference row type).
2. **Bean / setup services**: replace `data: any` with `BeanCreate` / `BeanUpdate` / `SetupCreate` types inferred from the existing shared schemas — the route layer already validates with these schemas, so this is a pass-through typing change, not a behaviour change.
3. **Taste hierarchy**: define (or reuse) a `TasteNoteNode` type — taste-note row plus `children: TasteNoteNode[]` — and type `roots` in `taste/model.ts:50`.
4. **Recipe model relation callbacks**: type the `.find()` callbacks at `recipe/model.ts:466,473` using the Drizzle relation row types (`typeof recipeTasteNotes.$inferSelect`, `typeof recipeEquipment.$inferSelect`) instead of `any`.
5. **Badge rule union**: introduce a shared badge-rule string-union (or reuse the existing constant list if present) so `badge/model.ts:131` compares without `as any`.
6. **Notify recipients**: define a `NotifyRecipient` type (`{ email: string; username: string; prefs: UserPreferences }`) and use it at `notify/index.ts:75` and in the `.filter()` at `:170`.
7. **Equipment cache cast (P3)**: change the cache provider signature to accept `unknown` values (or add a generic type parameter) so `equipment/service.ts:42` needs no double cast.
8. **Stretch (P3)**: revisit the library-boundary casts in `utils/openapi/index.ts`, `auth/jwt.ts`, and `middleware/errorHandler.ts`; replace where the library exposes proper types, otherwise add a one-line justification comment.
9. Run `make ci` (fmt, lint, type-check, tests) — no behaviour change expected.

---

## Files to Change

| File | Change |
|------|--------|
| `apps/api/src/modules/preference/service.ts` | Type `updatePreferences` payload |
| `apps/api/src/modules/preference/index.ts` | Type `flatData` |
| `apps/api/src/modules/bean/service.ts` | Type `createBean`/`updateBean` payloads |
| `apps/api/src/modules/setup/service.ts` | Type `createSetup` payload |
| `apps/api/src/modules/taste/model.ts` | `TasteNoteNode[]` for `roots` |
| `apps/api/src/modules/recipe/model.ts` | Type relation `.find()` callbacks |
| `apps/api/src/modules/badge/model.ts` | Badge-rule union, drop `as any` |
| `apps/api/src/utils/notify/index.ts` | `NotifyRecipient` type |
| `apps/api/src/modules/equipment/service.ts` | (P3) remove double cast via cache provider signature |
| `packages/shared/src/schemas/*` or `types/*` | Export inferred payload types where not already exported |
| Stretch: `apps/api/src/utils/openapi/index.ts`, `apps/api/src/modules/auth/jwt.ts`, `apps/api/src/middleware/errorHandler.ts` | Replace or document library-boundary casts |

---

## Test Plan

- This is a compile-time-only change; the primary gate is `deno check` across the workspace (`make ci`).
- Existing module tests must pass unchanged (bean, setup, preference, taste, recipe, badge suites where present).
- Add a negative type test only if a shared payload type is newly exported (e.g. assert `BeanCreate` rejects an unknown key via `// @ts-expect-error` in an existing test file).
- Grep gate: `grep -rn ": any\|as any\|any\[\]" apps/api/src/modules apps/api/src/utils/notify` returns zero hits after the P2 scope (stretch files excluded until done).

---

## Acceptance Criteria

- [ ] No `any` (parameter, variable, or cast) remains in the twelve P2 locations listed above.
- [ ] All payload types derive from the shared Zod schemas — no hand-duplicated interfaces.
- [ ] `make ci` passes with no new lint suppressions introduced.
- [ ] Stretch casts either removed or annotated with a justification comment.

---

## Effort Estimate

**Medium** — ~half a day. Mechanical typing changes across 9 files; the only design decision is the badge-rule union and the `TasteNoteNode` shape.
