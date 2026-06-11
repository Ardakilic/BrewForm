## Why

The `CoffeeVariety` TypeScript interface is the sole outlier across 14 shared entity types — it types `createdAt`, `updatedAt`, and `deletedAt` as `string`/`string | null` while every other entity type (`recipe.ts`, `user.ts`, `bean.ts`, `equipment.ts`, etc.) correctly uses `Date`/`Date | null`. This inconsistency means any future consumer importing `CoffeeVariety` from `@brewform/shared` cannot call Date methods without a cast, breaking the established convention and creating a type-safety trap. The Drizzle schema already returns `Date` objects (default `mode: "date"` on timestamp columns), so the shared type is simply wrong — not a runtime bug, but a forward-consistency debt that should be corrected now before code accumulates around the wrong type.

## What Changes

- **`packages/shared/src/types/coffee-variety.ts`** — Change `createdAt`, `updatedAt`, `deletedAt` from `string`/`string | null` to `Date`/`Date | null` (lines 43-45)
- Add JSDoc docblocks to all 33 fields on the `CoffeeVariety` interface to match the convention established by other type files (e.g., `recipe.ts`)
- Add a type-consistency test verifying `CoffeeVariety` date fields are `Date` at compile time
- Create `pr_description.md` at project root for the pull request

## Capabilities

### New Capabilities
- `coffee-variety-type-consistency`: Ensure the `CoffeeVariety` shared type has correct date field types (`Date`, not `string`) and is documented with JSDoc, consistent with all other entity types in `@brewform/shared`

### Modified Capabilities
<!-- None — this is a type-level fix with no requirement changes to existing specs -->

## Impact

- **Affected code**: `packages/shared/src/types/coffee-variety.ts` (3 type fields + JSDoc), `packages/shared/src/types/coffee-variety.test.ts` (new test file)
- **TypeScript compilation**: No expected errors — Drizzle already returns `Date`, no consumer accesses date fields on `CoffeeVariety`-typed values
- **No API, database, or frontend changes**: Pure type-layer correction
- **No breaking changes**: No consumer in the codebase accesses `.createdAt`, `.updatedAt`, or `.deletedAt` on a value typed as `CoffeeVariety` from the shared package. API services use `typeof coffeeVarieties.$inferSelect` (Drizzle's type), and web pages define their own local interfaces that omit date fields
