## Context

The `@brewform/shared` package defines TypeScript interfaces for all domain entities. Thirteen of fourteen entity types consistently type their timestamp fields (`createdAt`, `updatedAt`, `deletedAt`) as `Date` / `Date | null`. The sole outlier is `CoffeeVariety`, which uses `string` / `string | null` — likely written before the convention was established.

The Drizzle ORM schema in `packages/db/src/schema.ts` defines the `coffee_variety` table with `timestamp()` columns **without** explicit `mode: "string"`, meaning Drizzle's default `mode: "date"` applies. The database driver therefore returns `Date` objects at runtime. The shared type's `string` annotation is simply wrong, not a reflection of actual behavior.

No consumer in the codebase accesses `.createdAt`, `.updatedAt`, or `.deletedAt` on a `CoffeeVariety`-typed value from the shared package. The API service layer uses `typeof coffeeVarieties.$inferSelect` (Drizzle's own type, which already infers `Date`), and web pages define their own local interfaces (`CoffeeVarietyItem`) that omit date fields entirely. This makes the fix a **forward-consistency correction** with zero runtime impact.

Additionally, the `CoffeeVariety` interface lacks JSDoc docblocks on its fields, while every other type file (e.g., `recipe.ts`, `user.ts`) includes them. This will be corrected as part of the change.

## Goals / Non-Goals

**Goals:**
- Correct `createdAt`, `updatedAt`, `deletedAt` from `string`/`string | null` to `Date`/`Date | null`
- Add JSDoc docblocks to all 33 fields on the `CoffeeVariety` interface, matching convention
- Add a type-consistency test that protects against regression (fields reverting to `string`)
- Create a `pr_description.md` for the pull request

**Non-Goals:**
- No changes to Zod schemas (`CoffeeVarietyCreateSchema`, etc.) — they are input-only and don't include date fields
- No changes to the Drizzle schema or database — already correct
- No changes to frontend components — they don't use the shared `CoffeeVariety` type's date fields
- No data migration — pure type-level change

## Decisions

### Decision 1: Change types directly (no gradual deprecation)
**Choice**: Change `string` → `Date` directly without a deprecation period.
**Rationale**: No consumer in the codebase accesses these fields on a `CoffeeVariety`-typed value. A deprecation cycle would be pure overhead with no benefit.

### Decision 2: Add JSDoc to all fields, not just date fields
**Choice**: Document all 33 fields, not only the 3 being changed.
**Rationale**: The entire interface is undocumented while every other type file has docblocks. Partial documentation would create a new inconsistency. This is the right time to fix it while the file is open.

### Decision 3: Runtime test for compile-time type safety
**Choice**: Write a conventional `@std/testing/bdd` test that constructs a `CoffeeVariety` object with `Date` values and runs `instanceof Date` assertions.
**Rationale**: While TypeScript types are erased at runtime, this pattern achieves two goals:
1. If types are ever changed back to `string`, TypeScript **compilation fails** (the test won't even type-check with `instanceof Date` assertions against a `string` field)
2. When types are `Date`, the runtime assertions pass, confirming the Drizzle layer behaves as expected
**Alternative considered**: Pure type-level tests with `@std/expect-type`. Rejected — the codebase doesn't use that package, and the `instanceof` approach provides both compile-time and runtime verification.

### Decision 4: Test location
**Choice**: Create `packages/shared/src/types/coffee-variety.test.ts` — a new test file adjacent to the type file.
**Rationale**: The types directory currently has no tests. This is the most logical location, mirroring the pattern of `packages/shared/src/schemas/coffee-variety.test.ts` adjacent to its schema file. This keeps tests co-located with their subject.

## Risks / Trade-offs

- **[Low] Future consumer doing `new Date(variety.createdAt)`**: If a future consumer wraps `createdAt` in `new Date()` (treating it as a string), this will become a type error after the fix. **Mitigation**: The type error is the correct signal — the developer should remove the redundant `new Date()` wrapper. This is a feature, not a bug.
- **[None] Breaking existing code**: Verified via targeted grep across all workspaces — zero consumers access date fields on `CoffeeVariety`-typed values.
- **[None] Inconsistent JSON serialization**: The API uses `CoffeeVarietySelect` (Drizzle type, already `Date`) and Hono's JSON serializer correctly converts `Date` to ISO strings. No change in API response shape.

## Migration Plan

1. Apply the type changes in `packages/shared/src/types/coffee-variety.ts`
2. Add JSDoc docblocks to all fields
3. Create `packages/shared/src/types/coffee-variety.test.ts`
4. Run `make check` — verify zero type errors across all workspaces
5. Run `make test` — verify all tests pass including new type-consistency test
6. Create `pr_description.md`

**Rollback**: Revert the 3 type fields from `Date` back to `string`. No migration or data fix needed.

## Open Questions

*None.* All technical decisions are resolved.
