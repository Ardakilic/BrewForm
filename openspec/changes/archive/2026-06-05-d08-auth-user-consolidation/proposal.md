## Why

The `AuthUser` interface is defined identically in two frontend files (`api/index.ts` and `AuthContext.tsx`) and must be kept in sync manually. Meanwhile, the canonical `User` type in `@brewform/shared` is missing the `emailVerifiedAt` field that exists in the database and is already returned by the API. This creates drift risk: adding or renaming a field in one place won't surface errors elsewhere.

## What Changes

- Add `emailVerifiedAt: Date | null` to the shared `User` interface in `@brewform/shared/types/user.ts`
- Create a frontend `AuthUser` type in the shared package using `Pick<User, ...>` + `emailVerifiedAt: string | null` override, establishing a structural link to the canonical `User` type
- Remove the two duplicate `AuthUser` definitions from `apps/web/src/api/index.ts` and `apps/web/src/contexts/AuthContext.tsx`
- Import the shared `AuthUser` type in both frontend files
- Export `AuthUser` from the shared package barrel
- Update test mock user objects across all web test files to include `emailVerifiedAt: null`

## Capabilities

### New Capabilities

None. This is a pure type consolidation — no new user-visible behavior.

### Modified Capabilities

None. No requirement changes. All existing API responses, component rendering, and database queries remain identical.

## Impact

- **Files modified**: `packages/shared/src/types/user.ts`, `packages/shared/src/types/index.ts`, `apps/web/src/api/index.ts`, `apps/web/src/contexts/AuthContext.tsx`
- **Test files modified**: `CommentSection.test.tsx`, `RecipeListPage.test.tsx`, `StarredRecipesPage.test.tsx`, `RecipeDetailPage.test.tsx`, `Navbar.test.tsx`, `Navbar.pbt.test.tsx`, `UserProfilePage.test.tsx`
- **Cascading type change**: Server-side `AuthUser extends Omit<User, 'preferences'>` in `apps/api/src/modules/auth/service.ts` automatically picks up `emailVerifiedAt: Date | null` — no manual edit needed, and the existing test fixture already includes it
- **No breaking changes**: Pure type consolidation with zero runtime behavior changes
