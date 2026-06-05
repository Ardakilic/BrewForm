## 1. Update shared User type

- [x] 1.1 Add `emailVerifiedAt: Date | null` to the `User` interface in `packages/shared/src/types/user.ts:60-77`

## 2. Create shared AuthUser type

- [x] 2.1 Add `AuthUser` interface to `packages/shared/src/types/user.ts` (after the `User` interface), using `Pick<User, 'id' | 'email' | 'username' | 'displayName' | 'avatarUrl' | 'isAdmin' | 'onboardingCompleted'>` with `emailVerifiedAt: string | null` override and JSDoc comment

## 3. Update shared package exports

- [x] 3.1 Add `AuthUser` to the export block in `packages/shared/src/types/index.ts`

## 4. Consolidate api/index.ts

- [x] 4.1 Add `import type { AuthUser } from '@brewform/shared/types';` to `apps/web/src/api/index.ts`
- [x] 4.2 Remove local `interface AuthUser { ... }` block (lines 136-145)

## 5. Consolidate AuthContext.tsx

- [x] 5.1 Add `import type { AuthUser } from '@brewform/shared/types';` to `apps/web/src/contexts/AuthContext.tsx`
- [x] 5.2 Remove local `interface AuthUser { ... }` block (lines 4-13)

## 6. Update test mock user objects

- [x] 6.1 Add `emailVerifiedAt: null` to `makeUser()` helper in `apps/web/src/components/recipe/CommentSection.test.tsx`
- [x] 6.2 Add `emailVerifiedAt: null` to inline mock user object in `apps/web/src/pages/recipes/RecipeListPage.test.tsx` (~line 268)
- [x] 6.3 Add `emailVerifiedAt: null` to `defaultAuth.user` in `apps/web/src/pages/recipes/StarredRecipesPage.test.tsx` (~line 94)
- [x] 6.4 Add `emailVerifiedAt: null` to `nonOwnerAuth.user`, `ownerAuth.user`, and `authenticatedAuth.user` in `apps/web/src/pages/recipes/RecipeDetailPage.test.tsx`
- [x] 6.5 Add `emailVerifiedAt: null` to `authenticatedUser` and inline mock object in `apps/web/src/components/layout/Navbar.test.tsx`
- [x] 6.6 Add `emailVerifiedAt: null` to `authenticatedUser` in `apps/web/src/components/layout/Navbar.pbt.test.tsx`
- [x] 6.7 Add `emailVerifiedAt: null` to inline mock user objects in `apps/web/src/pages/users/UserProfilePage.test.tsx`

## 7. Verify

- [x] 7.1 Run `make fmt` — no formatting issues
- [x] 7.2 Run `make check-shared` — zero type errors
- [x] 7.3 Run `make check-api` — pre-existing JSR network issue (unrelated to change)
- [x] 7.4 Run `make check-web` — zero lint errors (162 files)
- [x] 7.5 Run `make lint` — zero warnings (790 files)
- [x] 7.6 Run web full type-check — 71 pre-existing errors, zero related to AuthUser consolidation
- [x] 7.7 Run `make test` — 731 web tests passed (49 files). API tests blocked by pre-existing JSR network issue.
