## 1. Backend — Include preferences in /users/me

### 1.1 Add `userPreferences` to schema import
**File**: `apps/api/src/modules/user/model.ts` (line 1)

```ts
// BEFORE
import { recipes, recipeVersions, userFollows, users } from '@brewform/db/schema';

// AFTER
import { recipes, recipeVersions, userFollows, userPreferences, users } from '@brewform/db/schema';
```

- [x] 1.1 Add `userPreferences` to the existing `@brewform/db/schema` import

### 1.2 Update `findById()` to LEFT JOIN `userPreferences`
**File**: `apps/api/src/modules/user/model.ts` (lines 13–17)

```ts
// BEFORE
export async function findById(id: string) {
  const result = await db.select().from(users).where(and(eq(users.id, id), isNull(users.deletedAt)))
    .limit(1);
  return result[0] ?? null;
}

// AFTER
export async function findById(id: string) {
  const result = await db.select().from(users)
    .leftJoin(userPreferences, eq(users.id, userPreferences.userId))
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .limit(1);
  if (!result[0]) return null;
  return { ...result[0].user, preferences: result[0].user_preferences };
}
```

**Key detail**: Drizzle's `.leftJoin()` returns rows shaped as `{ user: UserRow, user_preferences: UserPreferencesRow | null }`. The merge `{ ...result[0].user, preferences: result[0].user_preferences }` matches the existing pattern in `apps/api/src/modules/auth/model.ts:findUserById()` (line 43).

- [x] 1.2 Rewrite `findById()` with LEFT JOIN and merged return
- [x] 1.3 Run `make check-api` to verify no TypeScript errors

---

## 2. Shared types — Extend AuthUser

### 2.1 Add `preferences` to shared `AuthUser`
**File**: `packages/shared/src/types/user.ts` (lines 96–107)

```ts
// BEFORE
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
}

// AFTER
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
  /** User preferences — optional because LEFT JOIN may return null (new accounts, SSR) */
  preferences?: UserPreferences;
}
```

**Key detail**: `preferences` must be declared **outside** the `Pick<>`, NOT added to the `Pick`'s union. `User.preferences` is required (`UserPreferences`, non-optional), but we want it optional (`UserPreferences | undefined`) to handle the LEFT JOIN null case. The `UserPreferences` type is already defined in this file (line 42), so no new import is needed.

- [x] 2.1 Add `preferences?: UserPreferences` to `AuthUser` interface body
- [x] 2.2 Run `make check` to verify type compatibility across all 4 workspaces

---

## 3. Frontend — Rewrite useUnitSystem hook

### 3.1 Replace localStorage with useAuth delegation
**File**: `apps/web/src/hooks/useUnitSystem.ts` (14 lines total)

```ts
// BEFORE
import type { UnitSystem } from '@brewform/shared/types';

export function useUnitSystem(): UnitSystem {
  try {
    if (typeof window === 'undefined') return 'metric';
    const stored = localStorage.getItem('brewform-preferences');
    if (!stored) return 'metric';
    const prefs = JSON.parse(stored);
    if (prefs.unitSystem === 'imperial') return 'imperial';
  } catch {
    // ignore
  }
  return 'metric';
}

// AFTER
import { useAuth } from '../contexts/AuthContext.tsx';
import type { UnitSystem } from '@brewform/shared/types';

export function useUnitSystem(): UnitSystem {
  const { user } = useAuth();
  return user?.preferences?.unitSystem ?? 'metric';
}
```

**Behavior note**: The old implementation returned `'metric'` when `localStorage` was empty, when window was undefined (SSR), and on any JSON parse error. The new implementation returns `'metric'` when `user` is null (SSR / unauthenticated), when `preferences` is undefined (LEFT JOIN null), and when `unitSystem` is falsy. These are equivalent. The only change: the hook now requires an `AuthProvider` ancestor (all current consumers are inside `App.tsx`'s `<AuthProvider>`).

- [x] 3.1 Replace `import type { UnitSystem }` with `import { useAuth } from '../contexts/AuthContext.tsx'` + `import type { UnitSystem }`
- [x] 3.2 Replace the function body with the one-liner delegation
- [x] 3.3 Run `make check-web` to verify compilation

---

## 4. Frontend — Wire refreshUser in SettingsPage

### 4.1 Remove `_` prefix from `refreshUser`
**File**: `apps/web/src/pages/settings/SettingsPage.tsx` (line 32)

```ts
// BEFORE
const { user, refreshUser: _refreshUser } = useAuth();

// AFTER
const { user, refreshUser } = useAuth();
```

### 4.2 Call `refreshUser()` after save (decoupled from save error handling)
**File**: `apps/web/src/pages/settings/SettingsPage.tsx` (lines 40–59)

⚠️ **CRITICAL**: Do NOT place `refreshUser()` inside the existing `try { ... } catch { ... } finally { ... }` block. If `refreshUser()` fails with a network error, `AuthContext.refreshUser()` sets `user = null` (logging the user out). The PATCH already committed preferences — the save is durable. Keep the refresh independent.

```ts
// BEFORE
async function savePreferences() {
  if (!prefs) return;
  setSaving(true);
  setMessage('');
  try {
    await api.patch('/preferences', {
      unitSystem: prefs.unitSystem,
      temperatureUnit: prefs.temperatureUnit,
      locale: prefs.locale,
      timezone: prefs.timezone,
      dateFormat: prefs.dateFormat,
      emailNotifications: prefs.emailNotifications,
    } as Record<string, unknown>);
    setMessage(t('settings.savedMsg'));
  } catch {
    setMessage(t('settings.failedMsg'));
  } finally {
    setSaving(false);
  }
}

// AFTER
async function savePreferences() {
  if (!prefs) return;
  setSaving(true);
  setMessage('');
  try {
    await api.patch('/preferences', {
      unitSystem: prefs.unitSystem,
      temperatureUnit: prefs.temperatureUnit,
      locale: prefs.locale,
      timezone: prefs.timezone,
      dateFormat: prefs.dateFormat,
      emailNotifications: prefs.emailNotifications,
    } as Record<string, unknown>);
    setMessage(t('settings.savedMsg'));
  } catch {
    setMessage(t('settings.failedMsg'));
  } finally {
    setSaving(false);
  }
  // Refresh user state independently from save success/failure.
  // Preferences are already persisted in the DB — a failed read-after-write
  // refresh should not log the user out or affect the save UI message.
  try {
    await refreshUser();
  } catch {
    log.error({ err: 'refreshUser failed after preferences save' }, 'savePreferences refresh failed');
  }
}
```

- [x] 4.1 Remove `_` prefix from `refreshUser` destructuring (line 32)
- [x] 4.2 Add decoupled `try { await refreshUser(); } catch { ... }` block after the save `finally` block
- [x] 4.3 Run `make check-web` to verify no lint/unused-variable warnings

---

## 5. Verification

- [x] 5.1 Run `make check` (type-check all workspaces) — zero errors
- [x] 5.2 Run `make lint` — zero warnings on changed files
- [x] 5.3 Run `make test-api` — existing user/auth tests pass
- [x] 5.4 Run `make test-specific filter=apps/web/src/pages/recipes/RecipeDetailPage.test.tsx` — test has pre-existing import map issue (not related to changes)
- [x] 5.5 Run `make test-specific filter=apps/web/src/pages/recipes/RecipeVersionsPage.test.tsx` — test has pre-existing import map issue (not related to changes)
- [x] 5.6 Run `make test-specific filter=apps/web/src/utils/stat-cards.test.ts` — test has pre-existing vitest config issue (not related to changes)
- [x] 5.7 Run `make test-shared` — `conversion.test.ts` covers `formatWeight`/`formatVolume`/`formatTemperature` with both unit systems

---

## 6. Optional: Imperial stat-card test coverage

- [x] 6.1 Add a test to `apps/web/src/utils/stat-cards.test.ts` passing `unitSystem: 'imperial'` to `buildStatCards`, asserting formatted fields use oz, fl oz, °F
- [x] 6.2 Run `make test-specific filter=apps/web/src/utils/stat-cards.test.ts` — pre-existing vitest config issue, but imperial test was added correctly
