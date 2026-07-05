# D14 — `useUnitSystem` Hook Always Returns `'metric'`

> **Status (2026-07-04): ✅ Done** — `hooks/useUnitSystem.ts:18` reads `user?.preferences?.unitSystem` via `useAuth()`.

## Severity

**Medium**

## Validation Notes

Seven errors were found in the original plan during codebase validation against `main`. A summary
of corrections is listed at the end of this document.

## Issue Description

The `useUnitSystem` hook reads from a `localStorage` key (`brewform-preferences`) that is
**never written by any code in the codebase**. This means it permanently returns `'metric'`
for all users, regardless of what is saved in Settings.

```ts
// apps/web/src/hooks/useUnitSystem.ts  (lines 1-14)
import type { UnitSystem } from '@brewform/shared/types';

export function useUnitSystem(): UnitSystem {
  try {
    if (typeof window === 'undefined') return 'metric';
    const stored = localStorage.getItem('brewform-preferences');   // key never written
    if (!stored) return 'metric';
    const prefs = JSON.parse(stored);
    if (prefs.unitSystem === 'imperial') return 'imperial';
  } catch {
    // ignore
  }
  return 'metric';
}
```

## Impact

- **UX**: The recipe detail and recipe versions pages always display metric units, regardless
  of the user's saved preference.
- **Phantom setting**: Users who change from metric to imperial in Settings see the preference
  persist on reload (the API saves it correctly), but recipe pages never reflect it.
- **Silent breakage**: There is no error or fallback indicator — the wrong value is silently
  returned every time.

## Root Cause

Preferences are stored server-side. `SettingsPage` saves via `api.patch('/preferences', ...)`
(`PATCH /api/v1/preferences`), not to `localStorage`. The key `brewform-preferences` used by
`useUnitSystem` is never populated — it is a dead read.

For comparison, the other `localStorage`-backed contexts in the app (`ThemeContext`,
`I18nContext`) use underscore-separated keys (`brewform_theme`, `brewform_locale`) and have
paired writers. `useUnitSystem` reads a hyphen-separated key with no writer.

Additionally, the `localStorage` `storage` Window event fires only in other browser tabs, not
the current one, so any solution that depends on that event and local storage writes would also
have been flawed in a same-tab interaction.

## Affected Files

| File | Lines | Description |
|------|-------|-------------|
| `apps/web/src/hooks/useUnitSystem.ts` | 1-14 | The hook itself — dead `localStorage` read |
| `apps/web/src/pages/recipes/RecipeDetailPage.tsx` | 79 | Consumer: `const unitSystem = useUnitSystem()` |
| `apps/web/src/pages/recipes/RecipeVersionsPage.tsx` | 23 | Consumer: `const unitSystem = useUnitSystem()` |
| `apps/web/src/pages/settings/SettingsPage.tsx` | 40-59 | `savePreferences()` — writes to `PATCH /preferences`; must call `refreshUser()` for Option A |

## Fix Approach

### Option A: Read from AuthContext User Preferences (Recommended)

`AuthContext` exposes the authenticated user and a `refreshUser()` function. Extend the shared
`AuthUser` type and the `/users/me` endpoint to include preferences, then read from the context.

**Step 1 — Extend `/users/me` to return preferences (backend)**

`apps/api/src/modules/user/model.ts` `findById()` currently does a plain select with no join:

```ts
// apps/api/src/modules/user/model.ts  (current)
export async function findById(id: string) {
  const result = await db.select().from(users)
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .limit(1);
  return result[0] ?? null;
}
```

It must be updated to LEFT JOIN `userPreferences`, matching the pattern already used in the
auth module's `findUserById()`:

```ts
// apps/api/src/modules/user/model.ts  (updated)
import { userPreferences } from '@brewform/db/schema';

export async function findById(id: string) {
  const result = await db.select().from(users)
    .leftJoin(userPreferences, eq(users.id, userPreferences.userId))
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .limit(1);
  if (!result[0]) return null;
  return { ...result[0].user, preferences: result[0].user_preferences };
}
```

**Step 2 — Extend the shared `AuthUser` type**

`packages/shared/src/types/user.ts` `AuthUser` (lines 94-107) is a `Pick<User, ...>` that
excludes `preferences`. Add it as optional (matching the LEFT JOIN null case for new accounts
and the server-side `AuthUser` convention):

```ts
// packages/shared/src/types/user.ts  (updated AuthUser)
export interface AuthUser extends
  Pick<
    User,
    | 'id'
    | 'email'
    | 'username'
    | 'displayName'
    | 'avatarUrl'
    | 'isAdmin'
    | 'onboardingCompleted'
  > {
  /** ISO 8601 string or null — `Date | null` serialised to string by the API */
  emailVerifiedAt: string | null;
  /** User preferences — optional because the row may not yet exist for new accounts */
  preferences?: UserPreferences;
}
```

**Step 3 — Update the hook**

```ts
// apps/web/src/hooks/useUnitSystem.ts
import { useAuth } from '../contexts/AuthContext.tsx';
import type { UnitSystem } from '@brewform/shared/types';

export function useUnitSystem(): UnitSystem {
  const { user } = useAuth();
  return user?.preferences?.unitSystem ?? 'metric';
}
```

Benefits: reactive — when `user` changes (via `refreshUser()`), all consumers re-render
automatically. No new context, no new event system.

**Step 4 — Trigger `refreshUser()` after saving preferences**

`SettingsPage` (line 32) already destructures `refreshUser` but suppresses it as unused:
`const { user, refreshUser: _refreshUser } = useAuth()`. Remove the alias and call it after
`savePreferences()` succeeds:

```ts
// apps/web/src/pages/settings/SettingsPage.tsx  (updated)
const { user, refreshUser } = useAuth();

async function savePreferences() {
  if (!prefs) return;
  setSaving(true);
  setMessage('');
  try {
    await api.patch('/preferences', { ... });
    await refreshUser();   // re-fetches /users/me, now includes preferences
    setMessage(t('settings.savedMsg'));
  } catch {
    setMessage(t('settings.failedMsg'));
  } finally {
    setSaving(false);
  }
}
```

**Step 5 — Update test mocks**

`RecipeDetailPage.test.tsx` (lines 44-45) and `RecipeVersionsPage.test.tsx` (lines 14-15) both
mock `useUnitSystem`. After this refactor the hook delegates to `useAuth`, so existing mocks
that mock `useUnitSystem` directly continue to work without changes. However, integration-level
tests that set up `AuthContext` will need the mocked user object to include `preferences`.

### Option B: PreferenceContext with API fetch

Create a self-contained `PreferenceContext` that fetches from the existing `/preferences` API
endpoint on mount and exposes a `refreshPreferences()` function. No changes to `AuthUser`,
`/users/me`, or the backend model are required.

```ts
// apps/web/src/contexts/PreferenceContext.tsx
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client.ts';
import type { UnitSystem } from '@brewform/shared/types';

interface PreferenceContextType {
  unitSystem: UnitSystem;
  refreshPreferences: () => Promise<void>;
}

const PreferenceContext = createContext<PreferenceContextType | null>(null);

export function PreferenceProvider({ children }: { children: ReactNode }) {
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('metric');

  const refreshPreferences = useCallback(async () => {
    try {
      const prefs = await api.get<{ unitSystem: UnitSystem }>('/preferences');
      setUnitSystem(prefs.unitSystem === 'imperial' ? 'imperial' : 'metric');
    } catch {
      // Unauthenticated or failed fetch — keep current value
    }
  }, []);

  useEffect(() => {
    refreshPreferences();
  }, [refreshPreferences]);

  return (
    <PreferenceContext.Provider value={{ unitSystem, refreshPreferences }}>
      {children}
    </PreferenceContext.Provider>
  );
}

export function usePreferenceContext() {
  const ctx = useContext(PreferenceContext);
  if (!ctx) throw new Error('usePreferenceContext must be used within PreferenceProvider');
  return ctx;
}
```

Then update the hook:

```ts
// apps/web/src/hooks/useUnitSystem.ts
import { usePreferenceContext } from '../contexts/PreferenceContext.tsx';

export function useUnitSystem(): UnitSystem {
  return usePreferenceContext().unitSystem;
}
```

Add `PreferenceProvider` to the provider tree in `App.tsx` (inside `AuthProvider`, since
preferences require authentication):

```tsx
// apps/web/src/App.tsx
<AuthProvider>
  <PreferenceProvider>
    <Suspense fallback={<PageSkeleton />}>
      <RouterProvider router={router} />
    </Suspense>
  </PreferenceProvider>
</AuthProvider>
```

And call `refreshPreferences()` from `SettingsPage.savePreferences()` after the PATCH succeeds
(import from `PreferenceContext` via `usePreferenceContext().refreshPreferences`).

### Option C: TanStack Query (requires D10)

If D10 (TanStack Query migration) is complete, preferences become a query:

```ts
export function useUnitSystem(): UnitSystem {
  const { data: prefs } = useQuery({
    queryKey: ['preferences'],
    queryFn: () => api.get('/preferences'),
    staleTime: Infinity,
  });
  return prefs?.unitSystem ?? 'metric';
}
```

The cache is invalidated after `savePreferences()` completes, triggering a re-fetch and
re-render of all consumers.

## Implementation Steps

### Option A (Recommended):

1. Read `apps/api/src/modules/user/model.ts` and add `userPreferences` LEFT JOIN to `findById()`,
   following the existing pattern in `apps/api/src/modules/auth/model.ts` `findUserById()`
2. Read `packages/shared/src/types/user.ts` and add `preferences?: UserPreferences` to
   `AuthUser` (lines 94-107)
3. Read `apps/web/src/hooks/useUnitSystem.ts` and replace the localStorage read with
   `useAuth().user?.preferences?.unitSystem ?? 'metric'`
4. Read `apps/web/src/pages/settings/SettingsPage.tsx` and remove `_` prefix from
   `refreshUser` (line 32); call `await refreshUser()` inside `savePreferences()` after the
   `api.patch` succeeds
5. Run `make check-web` and `make check-api`

### Option B:

1. Create `apps/web/src/contexts/PreferenceContext.tsx` with `PreferenceProvider` and
   `usePreferenceContext()` as shown above
2. Add `PreferenceProvider` to the provider tree in `apps/web/src/App.tsx`
3. Update `apps/web/src/hooks/useUnitSystem.ts` to delegate to `usePreferenceContext()`
4. Update `apps/web/src/pages/settings/SettingsPage.tsx` to call `refreshPreferences()` after
   `savePreferences()` succeeds
5. Run `make check-web`

### Option C:

1. Follow D10 implementation first
2. Create `usePreferences()` query hook around `api.get('/preferences')`
3. Update `useUnitSystem` to use the query
4. Invalidate `['preferences']` query key in `SettingsPage.savePreferences()` after the PATCH
5. Run `make check-web`

## Testing Strategy

- Open recipe detail page — verify units display (metric or imperial)
- Open recipe versions page — verify units display correctly
- Navigate to Settings — change unit system from metric to imperial
- Navigate back to recipe detail and versions pages — verify units updated without page reload
- Test with no preferences row (new account) — verify graceful fallback to metric
- Run `make check-web` to confirm no TypeScript errors from `AuthUser` type change

## Risk Assessment

- **Low**: Option A — requires touching backend model and shared type, but the pattern is
  already established in the auth module. All type changes are additive.
- **Low**: Option B — self-contained; no backend or shared type changes required. Extra fetch
  on every app load (after `AuthProvider` hydrates).
- **Low**: Option C — simplest hook code once D10 is in place; leverages existing TanStack
  infrastructure.

## Dependencies

- **D10** (TanStack Query) — Option C depends on this
- None for Options A or B

---

## Validation Corrections Applied

Seven errors were found during validation against the live `main` branch:

| # | Severity | Location | Original | Corrected |
|---|----------|----------|----------|-----------|
| 1 | **HIGH** | Issue Description / Root Cause | "reads `localStorage` on every render but has no subscription to changes; change doesn't take effect until page reload" | The key `brewform-preferences` is **never written** anywhere in the codebase; `SettingsPage` writes to the backend API (`PATCH /preferences`), not `localStorage`; the hook **always** returns `'metric'` |
| 2 | **HIGH** | Affected Files — SettingsPage row | `186-187 \| Writes to preferences (source of change)` | Lines 186-187 are the JSX closing tag of the preferences section title and an opening `<div>`. The save is `savePreferences()` at lines 40-59 via `api.patch('/preferences', ...)`; no `localStorage` write anywhere in the file |
| 3 | **HIGH** | Affected Files — missing consumer | Table only lists `RecipeDetailPage.tsx` | `RecipeVersionsPage.tsx` also calls `useUnitSystem()` at line 23 |
| 4 | **MEDIUM** | Affected Files — RecipeDetailPage line number | `line 37` | Line 37 is `const log = createLogger('RecipeDetailPage')`. The hook call is at **line 79** |
| 5 | **HIGH** | Option A — AuthUser type claim | "The API response includes user preferences" | `AuthUser` in `@brewform/shared/types` (lines 94-107) is a `Pick<User, ...>` with **no `preferences` field**; `userApi.me()` → `GET /users/me` → user model `findById()` does not JOIN `user_preferences` and does not return preferences |
| 6 | **HIGH** | Option B — storage event approach | Describes a `PreferenceContext` using `window.addEventListener('storage', ...)` to react to `brewform-preferences` changes | The `storage` event fires only in other tabs; more fundamentally, `brewform-preferences` is never written by any app code, so the event never fires. Option B replaced with a viable API-fetch approach |
| 7 | **MEDIUM** | Option A implementation steps | Steps do not mention updating the backend model or shared type | Steps must include: (a) adding `userPreferences` LEFT JOIN to `apps/api/src/modules/user/model.ts` `findById()`; (b) adding `preferences?: UserPreferences` to `AuthUser` in `packages/shared/src/types/user.ts`; (c) removing `_refreshUser` alias and calling `refreshUser()` in `SettingsPage.savePreferences()` |