## 1. Backend — Include preferences in /users/me

- [ ] 1.1 Add `userPreferences` import to `apps/api/src/modules/user/model.ts` from `@brewform/db/schema`
- [ ] 1.2 Update `findById()` to LEFT JOIN `userPreferences` and return merged result with `preferences` field, following the existing pattern in `apps/api/src/modules/auth/model.ts:findUserById()`
- [ ] 1.3 Run `make check-api` to verify no TypeScript errors from the model change

## 2. Shared types — Extend AuthUser

- [ ] 2.1 Add optional `preferences?: UserPreferences` field to the `AuthUser` interface in `packages/shared/src/types/user.ts` (must be optional to handle LEFT JOIN null case and match SSR/unauth scenarios)
- [ ] 2.2 Run `make check` to verify type compatibility across all workspaces (API + web + shared + db)

## 3. Frontend — Rewrite useUnitSystem hook

- [ ] 3.1 Replace `localStorage`-based implementation in `apps/web/src/hooks/useUnitSystem.ts` with a delegation to `useAuth().user?.preferences?.unitSystem ?? 'metric'`
- [ ] 3.2 Remove the try/catch block (no longer needed — no `localStorage` parsing, no JSON errors to catch)
- [ ] 3.3 Remove the `typeof window === 'undefined'` SSR guard (no longer needed — `useAuth` returns null user during SSR)
- [ ] 3.4 Run `make check-web` to verify the hook compiles and types align

## 4. Frontend — Wire refreshUser in SettingsPage (with error handling)

- [ ] 4.1 In `apps/web/src/pages/settings/SettingsPage.tsx`, remove the `_` prefix from `refreshUser: _refreshUser` (line 32) so the variable is used
- [ ] 4.2 Add `await refreshUser()` call *after* the save try/catch block (not inside it) so that a `refreshUser` failure does not couple to the save success/failure UI message and does not risk logging the user out on transient network errors
- [ ] 4.3 Wrap the `refreshUser()` call in its own try/catch with a `log.error` on failure (preferences are already committed to the DB; the next page load will pick up the new unit system)
- [ ] 4.4 Run `make check-web` to verify no lint warnings about unused variables

## 5. Verification

- [ ] 5.1 Run `make check` (type-check all workspaces) — must pass with zero errors
- [ ] 5.2 Run `make lint` — must pass with zero warnings related to changed files
- [ ] 5.3 Run `make test-api` — existing user/auth tests must pass
- [ ] 5.4 Run `make test-specific filter=apps/web/src/pages/recipes/RecipeDetailPage.test.tsx` — existing tests must pass (mocks `useUnitSystem` directly; `useAuth` is also mocked so the real hook is never exercised)
- [ ] 5.5 Run `make test-specific filter=apps/web/src/pages/recipes/RecipeVersionsPage.test.tsx` — existing tests must pass (mocks `useUnitSystem` at module level; `useAuth` is not mocked but the hook module is fully replaced so `useAuth` dependency is never loaded)
- [ ] 5.6 Run `make test-specific filter=apps/web/src/utils/stat-cards.test.ts` — existing metric tests must pass; verify that imperial formatting is correct by reading the test output (the tests use default `'metric'`; imperial formatting is exercised in `conversion.test.ts` at the shared package level)

## 6. Optional: Imperial stat-card test coverage

- [ ] 6.1 Add a test case to `apps/web/src/utils/stat-cards.test.ts` that passes `unitSystem: 'imperial'` to `buildStatCards` and asserts the formatted weight, volume, and temperature fields display in imperial units (oz, fl oz, °F)
- [ ] 6.2 Run `make test-specific filter=apps/web/src/utils/stat-cards.test.ts` to confirm
