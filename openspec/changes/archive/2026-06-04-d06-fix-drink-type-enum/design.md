## Context

The codebase defines drink types in four places:

1. **Database** (`packages/db/src/schema.ts`): `drinkTypeEnum` with 15 values — correct.
2. **Zod schema** (`packages/shared/src/schemas/recipe.ts`): `DrinkTypeEnum` with 15 values — correct.
3. **UI constants** (`packages/shared/src/constants/drink-types.ts`): `DRINK_TYPES` with 15 entries, `DrinkTypeValue` derived type — correct.
4. **TypeScript union** (`packages/shared/src/types/recipe.ts`): `DrinkType` with 11 values — **missing 4**.

Because `DrinkType` is the only publicly exported typed union (via `packages/shared/src/types/index.ts`), consumers must either:
- cast with `as DrinkType` (frontend pages), or
- fall back to `string` + `as any` (API model filters).

This is a pure type-system bug with no runtime impact.

## Goals / Non-Goals

**Goals:**
- Add the four missing literals to `DrinkType` so it matches the canonical 15-value enum.
- Remove `as any` and `string` workarounds in API and shared layers where they were only needed because of the missing type members.
- Remove redundant `as DrinkType` casts in the frontend once the types align.
- Ensure `make check`, `make test`, and `make lint` pass.

**Non-Goals:**
- No database schema changes (enum already has all 15 values).
- No Zod schema changes (already correct).
- No UI constant changes (already correct).
- No new user-facing behavior — this is a compile-time fix.

## Decisions

1. **Scope expansion from original D06 plan**
   - *Rationale*: The original plan only updated the `DrinkType` type. Because the type fix makes `string` workarounds unnecessary, we should clean them up in the same PR to avoid leaving tech debt. The changes are trivial and strictly additive.

2. **Keep `DrinkType` as a hand-written union instead of deriving it from `DrinkTypeValue`**
   - *Rationale*: Deriving from `DrinkTypeValue` would couple the shared types barrel to the constants barrel. The hand-written union is explicit, grep-able, and matches the existing pattern for `BrewMethod` and `Visibility`.

3. **Do NOT re-export `DrinkTypeValue` from `constants/index.ts` in this change**
   - *Rationale*: That is a separate capability (follow-up). Keeping the PR minimal avoids scope creep.

## Risks / Trade-offs

- [Risk] Tightening `drinkType?: string` to `drinkType?: DrinkType` in `model.ts` and `validation.ts` could surface latent type errors in callers.
  - *Mitigation*: Run `make check` after each edit; the fix is strictly narrowing, so any new errors are genuine bugs worth fixing now.

- [Risk] Removing `as DrinkType` in the frontend could break if a future refactor makes `compatibleDrinks[0]?.value` not guaranteed to be a `DrinkType`.
  - *Mitigation*: `compatibleDrinks` is built from `DRINK_TYPES_LIST`, whose values are exactly the 15 `DrinkType` literals. Once the union matches, the cast is provably redundant.

## Migration Plan

No migration needed. Deploy is safe at any point — all changes are compile-time only.

## Open Questions

(none)
