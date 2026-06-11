## 1. Fix CoffeeVariety type date fields

- [ ] 1.1 Read `packages/shared/src/types/coffee-variety.ts` to confirm current state at lines 43-45
- [ ] 1.2 Change `createdAt: string` → `createdAt: Date` on line 43
- [ ] 1.3 Change `updatedAt: string` → `updatedAt: Date` on line 44
- [ ] 1.4 Change `deletedAt: string | null` → `deletedAt: Date | null` on line 45

## 2. Add JSDoc docblocks to CoffeeVariety interface

- [ ] 2.1 Read `packages/shared/src/types/recipe.ts` for docblock style reference (convention: concise inline JSDoc on every field)
- [ ] 2.2 Add `/** ... */` JSDoc to all 33 fields on the `CoffeeVariety` interface, matching the style in `recipe.ts`
- [ ] 2.3 Ensure the file-level JSDoc on `CoffeeVariety` interface itself is present and accurate

## 3. Verify no consumers break

- [ ] 3.1 Run targeted grep for `.createdAt`, `.updatedAt`, `.deletedAt` on `CoffeeVariety`-typed values across `packages/shared/src/`, `apps/web/src/`, `apps/api/src/` — confirm zero results
- [ ] 3.2 Run `make check` — type-check all workspaces, confirm zero type errors (pre-existing errors from other files are expected but must not increase)

## 4. Create type-consistency test

- [ ] 4.1 Create `packages/shared/src/types/coffee-variety.test.ts`
- [ ] 4.2 Write a test that constructs a `CoffeeVariety` object with `Date` values for `createdAt`, `updatedAt`, `deletedAt` (or `null`)
- [ ] 4.3 Add `instanceof Date` runtime assertions on `createdAt` and `updatedAt` (serves as compile-time regression guard)
- [ ] 4.4 Add assertion that `deletedAt` is either `null` or `instanceof Date`
- [ ] 4.5 Run `make test` — confirm new test passes

## 5. Final verification

- [ ] 5.1 Run `make check` — zero NEW type errors across all workspaces
- [ ] 5.2 Run `make test` — all test suites green, including new type-consistency test
- [ ] 5.3 Run `make lint` — zero lint errors

## 6. Create PR description

- [ ] 6.1 Create `pr_description.md` at project root (overwrite the existing unrelated one)
- [ ] 6.2 Include sections: Summary, Changes, Verification, Risk, Breaking
- [ ] 6.3 Verify the PR description is accurate and complete
