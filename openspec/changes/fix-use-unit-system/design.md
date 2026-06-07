## Context

The `useUnitSystem` hook currently reads from `localStorage` key `brewform-preferences` — a key that is never written by any code in the application. Preferences are stored server-side in the `user_preferences` table and modified via `PATCH /api/v1/preferences`. The hook therefore silently returns `'metric'` for every user, regardless of their saved preference.

Two consumer pages rely on this hook:
- `RecipeDetailPage` (line 79): displays recipe measurements
- `RecipeVersionsPage` (line 23): displays version measurements

The auth module already has a working pattern for including preferences in user queries (`findUserById` in `apps/api/src/modules/auth/model.ts` uses a LEFT JOIN on `userPreferences`). The user module's `findById`, used by `/users/me`, does not — it performs a plain select without joins.

The `AuthContext` already exposes `refreshUser()` and manages `AuthUser | null` state. Adding preferences to `AuthUser` makes the unit system reactive without a new context, new event system, or extra API call on every page mount.

**Note on two `AuthUser` types**: There are two interfaces named `AuthUser` in the codebase — a server-side one in `apps/api/src/modules/auth/service.ts` (which already includes `preferences?: UserPreferences`) and the shared frontend one in `packages/shared/src/types/user.ts` (which does not). This change extends the **shared** `AuthUser` to include preferences, aligning it with the server-side version. The server-side `AuthUser` is unchanged.

**Note on `useStaticCacheSync`**: The `useStaticCacheSync` test references `brewform-preferences` as a test key for `StorageEvent` handling. Since no code writes this `localStorage` key, this test validates a scenario that can never occur in production. After this change, the key is fully dead (no reader, no writer). The existing test remains valid as a unit test of event handling logic — it does not depend on `useUnitSystem`.

## Goals / Non-Goals

**Goals:**
- Fix `useUnitSystem` to return the user's actual saved unit system preference
- Make unit system display reactive — changing preference in Settings immediately updates recipe pages without page reload
- Gracefully fall back to `'metric'` when no preferences exist (new accounts, unauthenticated users)
- Keep the hook's public signature unchanged: `() => UnitSystem`
- Follow existing patterns: LEFT JOIN pattern from auth model, `AuthUser` type conventions

**Non-Goals:**
- Creating a separate `PreferenceContext` (adds an extra provider, an extra fetch on every app load)
- Using TanStack Query (depends on D10 which is not yet implemented)
- Handling `localStorage` fallback or migration — the `brewform-preferences` key is dead, remove the code path entirely
- Exposing other preference fields (theme, locale, etc.) through the hook — out of scope
- Modifying `PATCH /preferences` response shape or preferences API

## Decisions

### Decision 1: Read from AuthContext (Option A) over PreferenceContext (Option B)

**Chosen: Option A — AuthUser.preferences**

| Criterion | Option A (AuthContext) | Option B (PreferenceContext) |
|-----------|----------------------|------------------------------|
| Extra API calls | 0 (data already in AuthUser) | 1 per app load (GET /preferences) |
| New context/provider | None | New `PreferenceProvider` in app tree |
| Reactivity | Automatic via `useState<User>` | Requires manual `refreshPreferences()` call |
| Backend changes | Minor (LEFT JOIN in findById) | None |
| Shared type changes | Additive (`preferences?: UserPreferences`) | None |
| Consistency with Theme/I18n | Different pattern (those use dedicated contexts) | Matches dedicated context pattern |

Rationale: Preferences data is already fetched during authentication (`/users/me` is called on mount by `AuthProvider`). Adding it to the existing user object avoids duplicating network requests. The LEFT JOIN pattern is already established in `auth/model.ts:findUserById()`.

### Decision 2: Optional preferences field on AuthUser

`preferences?: UserPreferences` (optional) rather than `preferences: UserPreferences` (required).

Rationale:
- New accounts have a `user_preferences` row created in the same transaction as the user (see `auth/model.ts:createUser()`), so in practice preferences always exist.
- However, the LEFT JOIN in `findById()` can return `null` for the joined row. Typing it as optional is defensive and matches the `auth/model.ts` pattern where `user_preferences` may be null.
- The hook already has a fallback (`?? 'metric'`), so consumers see `'metric'` gracefully.

### Decision 3: Call `refreshUser()` in SettingsPage after save

Rather than modifying `PATCH /preferences` response to include a full user object, we reuse the existing `refreshUser()` mechanism already available in `AuthContext`.

Rationale:
- `refreshUser()` already exists and re-fetches `/users/me`. After the model change, it will include preferences.
- This keeps the preferences API unchanged (no response shape modification).
- All consumers of `useUnitSystem` re-render automatically because `useAuth().user` state changes.

### Decision 4: Not adding `refreshUser` call to onSuccess handler abstraction

SettingsPage calls `savePreferences()` which does `api.patch(...)`. We add `await refreshUser()` directly after the PATCH in the same try block.

Rationale:
- Simple, explicit, one-line change.
- No abstraction layer needed for a single call site.
- If we later need to refresh after preference changes elsewhere, we can refactor.

### Decision 5: Mitigate `refreshUser()` failure → logout risk

`AuthContext.refreshUser()` sets `user = null` inside its `catch` block. This is correct for initial load (user is not authenticated), but after saving preferences it becomes a risk: if `GET /users/me` fails transiently, the user gets logged out despite their preferences being saved successfully.

**Chosen mitigation**: Add a post-save check in SettingsPage. If `refreshUser()` fails after a successful PATCH, do NOT let the error propagate — log it and leave the existing `user` state intact. This requires a small refactor: extract the `refreshUser` call from the `savePreferences` try block to avoid coupling its failure to the save success/failure UI message.

```ts
// Approximate change:
try {
  await api.patch('/preferences', { ... });
  setMessage(t('settings.savedMsg'));
} catch {
  setMessage(t('settings.failedMsg'));
} finally {
  setSaving(false);
}
// Refresh user state independently — don't couple to save success
try {
  await refreshUser();
} catch {
  // refresh failed but preferences are saved; ignore
}
```

Rationale:
- The PATCH already committed the preferences to the database. The save is not rolled back.
- A failed `GET /users/me` should not log the user out — it's a read-after-write refresh, not an auth check.
- Logging the error is sufficient for observability; the UI will eventually reflect the new units on next page load (when AuthContext hydrates on mount).

**Alternative considered**: Modifying `AuthContext.refreshUser()` to distinguish initial load from subsequent refreshes (preserving the previous user on error for non-initial calls). Rejected as out of scope — touching the auth infrastructure introduces broader risk.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| **LEFT JOIN returns null for user_preferences on legacy rows** | `preferences?: UserPreferences` is optional; hook falls back to `'metric'`. New accounts always have a preferences row (created in transaction with user). |
| **`refreshUser()` sets `user = null` on transient network errors, logging the user out** | Decouple `refreshUser()` call from the save success/failure flow (Decision 5). Call it AFTER the save try/catch block with its own error handling that ignores failures. The PATCH already committed preferences to the database — a failed read-after-write refresh does not invalidate the save. |
| **Double fetch on app load: `/preferences` (SettingsPage loader) + `/users/me` (AuthContext)** | Both now carry preferences redundantly. Harmless — the SettingsPage loader fetches the flat format for its own UI, AuthContext carries nested `preferences` for `useUnitSystem`. Optimization deferred. |
| **SettingsPage currently suppresses `refreshUser` as `_refreshUser`** | The lint rule suppressing unused variables masks that `refreshUser` was destructured but not used. Removing the `_` prefix and calling it fixes this. May need to add `// deno-lint-ignore` if the variable had another unused-variable suppression. |
| **SSR/hydration mismatch if SSR reads from AuthContext** | `useUnitSystem` falls back to `'metric'` when `user` is null. AuthProvider's `isLoading` state means consumers won't render until user is loaded. |
| **Existing tests mock `useUnitSystem` directly, bypassing `useAuth`** | These mocks continue to work unchanged — they intercept the hook import and return a fixed value. `RecipeDetailPage.test.tsx` also mocks `useAuth`, so the component never exercises the real hook. `RecipeVersionsPage.test.tsx` does NOT mock `useAuth`, but the module-level `vi.mock('../../hooks/useUnitSystem.ts', ...)` replaces the entire hook module, so the real `useUnitSystem` (and its `useAuth` dependency) is never loaded. Integration tests that set up `AuthContext` must include `preferences` in their `user` mock. |
| **Type errors from `AuthUser` not matching API response** | The API serializes `UserPreferences` to JSON; shared type already uses JS types (not `Date`). The `preferences` field is additive and optional — no breaking change. |
| **No imperial unit display tests exist in stat-cards tests** | `apps/web/src/utils/stat-cards.test.ts` only tests `unitSystem: 'metric'` (the default). A verification task is included to add imperial coverage. |
