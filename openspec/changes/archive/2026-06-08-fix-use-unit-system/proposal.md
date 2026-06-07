## Why

The `useUnitSystem` hook reads from a `localStorage` key (`brewform-preferences`) that is **never written** by any code in the application. Preferences are stored server-side via `PATCH /api/v1/preferences`. This means the hook silently returns `'metric'` for every user, every time — recipe detail and recipe versions pages never reflect a user's saved imperial preference. Users who change their unit system in Settings see the preference persist across reloads (the API saves it correctly), but recipe pages remain stuck on metric.

## What Changes

- **Fix the root cause**: Extend the `/users/me` endpoint to include user preferences via a LEFT JOIN in the user model, matching the pattern already established in the auth module's `findUserById`.
- **Extend the shared `AuthUser` type**: Add an optional `preferences` field to `AuthUser` so the frontend has access to unit system, temperature unit, date format, etc.
- **Rewrite `useUnitSystem`**: Replace the dead `localStorage` read with a delegation to `useAuth().user?.preferences?.unitSystem ?? 'metric'`, making it reactive to `user` state changes.
- **Keep preferences in sync**: Call `refreshUser()` in `SettingsPage.savePreferences()` after a successful PATCH so the `AuthUser` state updates immediately, and all consumers re-render with the new unit system without a page reload.
- **Remove dead code path**: No more phantom `localStorage` key `brewform-preferences`.

No breaking changes. The hook's public signature (`() => UnitSystem`) is unchanged. Existing test mocks that mock `useUnitSystem` directly continue to work.

## Capabilities

### New Capabilities
- `unit-system-display`: Display recipe measurement values (weight, volume, temperature) in the user's preferred unit system (metric or imperial), reacting to preference changes without page reload.

### Modified Capabilities
<!-- No existing specs are modified by this change. -->
(none)

## Impact

| Area | Impact |
|------|--------|
| `apps/api/src/modules/user/model.ts` | `findById()` adds LEFT JOIN on `userPreferences` |
| `apps/api/src/modules/user/service.ts` | `getProfile()` now includes preferences in the returned user (indirectly, via model) |
| `packages/shared/src/types/user.ts` | `AuthUser` gains optional `preferences?: UserPreferences` field |
| `apps/web/src/hooks/useUnitSystem.ts` | Rewritten to read from `useAuth()` instead of `localStorage` |
| `apps/web/src/pages/settings/SettingsPage.tsx` | Un-suppress `refreshUser` and call it after preferences save |
| `apps/web/src/pages/recipes/RecipeDetailPage.tsx` | No code change needed — re-renders reactively |
| `apps/web/src/pages/recipes/RecipeVersionsPage.tsx` | No code change needed — re-renders reactively |
| Tests: `RecipeDetailPage.test.tsx`, `RecipeVersionsPage.test.tsx` | Existing mocks of `useUnitSystem` still work; integration tests that set up `AuthContext` need `user.preferences` in their mock payload |
