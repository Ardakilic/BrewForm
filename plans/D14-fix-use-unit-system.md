# D14 — `useUnitSystem` Hook is Not Reactive

## Severity

**Medium**

## Issue Description

The `useUnitSystem` hook reads from `localStorage` on every render but has no subscription to changes. When a user updates their unit preference in Settings, the change doesn't take effect until a full page reload.

```ts
// apps/web/src/hooks/useUnitSystem.ts
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
```

## Impact

- **UX**: Users who change from metric to imperial (or vice versa) in Settings don't see the change reflected in RecipeDetailPage until they manually reload
- **Inconsistency**: The recipe detail page shows one unit system while other components may show another if they read from a different source

## Root Cause

The hook reads `localStorage` directly on each render. `localStorage` is a synchronous, pull-based API — it doesn't notify subscribers when values change. There is no event subscription or context provider to trigger re-renders.

## Affected Files

| File | Lines | Description |
|------|-------|-------------|
| `apps/web/src/hooks/useUnitSystem.ts` | 1-14 | The hook itself |
| `apps/web/src/pages/recipes/RecipeDetailPage.tsx` | 37 | Consumer: `const unitSystem = useUnitSystem()` |
| `apps/web/src/pages/settings/SettingsPage.tsx` | 186-187 | Writes to preferences (source of change) |

## Fix Approach

### Option A: Read from AuthContext User Preferences (Recommended)

The user's preferences are already loaded in `AuthContext` via `refreshUser()` (which calls `userApi.me()`). The API response includes user preferences. Instead of reading `localStorage`, read from the auth user object:

```ts
// apps/web/src/hooks/useUnitSystem.ts
import { useAuth } from '../contexts/AuthContext.tsx';

export function useUnitSystem(): UnitSystem {
  const { user } = useAuth();
  // User preferences would need to be included in the auth user response
  // or fetched separately and cached in context
  return user?.preferences?.unitSystem ?? 'metric';
}
```

Benefits:
- Reactive — when `user` changes (via `refreshUser()`), all consumers re-render
- Single source of truth — preferences come from the API, not localStorage
- No new context or event system needed

### Option B: PreferenceContext with Custom Event

Create a `PreferenceContext` that wraps the app and provides a reactive unit system value:

```ts
// apps/web/src/contexts/PreferenceContext.tsx
import { createContext, useContext, useEffect, useState } from 'react';

interface PreferenceContextType {
  unitSystem: UnitSystem;
  refreshPreferences: () => void;
}

const PreferenceContext = createContext<PreferenceContextType | null>(null);

export function PreferenceProvider({ children }: { children: React.ReactNode }) {
  const [unitSystem, setUnitSystem] = useState<UnitSystem>(() => {
    try {
      const stored = localStorage.getItem('brewform-preferences');
      if (stored) {
        const prefs = JSON.parse(stored);
        return prefs.unitSystem === 'imperial' ? 'imperial' : 'metric';
      }
    } catch {}
    return 'metric';
  });

  useEffect(() => {
    function handleStorageChange(e: StorageEvent) {
      if (e.key === 'brewform-preferences' && e.newValue) {
        try {
          const prefs = JSON.parse(e.newValue);
          setUnitSystem(prefs.unitSystem === 'imperial' ? 'imperial' : 'metric');
        } catch {}
      }
    }
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return (
    <PreferenceContext.Provider value={{ unitSystem, refreshPreferences: () => {
      // Re-read from localStorage
      try {
        const stored = localStorage.getItem('brewform-preferences');
        if (stored) {
          const prefs = JSON.parse(stored);
          setUnitSystem(prefs.unitSystem === 'imperial' ? 'imperial' : 'metric');
        }
      } catch {}
    }}}>
      {children}
    </PreferenceContext.Provider>
  );
}

export function useUnitSystem() {
  const ctx = useContext(PreferenceContext);
  if (!ctx) throw new Error('useUnitSystem must be used within PreferenceProvider');
  return ctx.unitSystem;
}
```

### Option C: TanStack Query (If D10 is done)

If D10 is implemented, preferences become a query:

```ts
export function useUnitSystem(): UnitSystem {
  const { data: prefs } = useQuery({
    queryKey: ['preferences'],
    queryFn: () => api.get('/preferences'),
    staleTime: Infinity, // Preferences don't change often
  });
  return prefs?.unitSystem ?? 'metric';
}
```

## Implementation Steps

### Option A (Recommended):

1. Read `apps/web/src/hooks/useUnitSystem.ts` and `apps/web/src/contexts/AuthContext.tsx`
2. Check if `userApi.me()` returns preferences — if not, add preferences to the user response
3. Update `useUnitSystem` to read from auth context
4. Update all consumers to work with the reactive hook
5. Remove `localStorage` read from `useUnitSystem`
6. Run `make check-web`

### Option B:

1. Read the current `useUnitSystem` implementation
2. Create `apps/web/src/contexts/PreferenceContext.tsx`
3. Add `PreferenceProvider` to the provider tree in `App.tsx`
4. Export `useUnitSystem` from the context
5. Update all consumers to import from the new location
6. Update `SettingsPage` to call `refreshPreferences()` after saving
7. Run `make check-web`

### Option C:

1. Follow D10 implementation first
2. Create `usePreferences()` query hook
3. Update `useUnitSystem` to use the query
4. Run `make check-web`

## Testing Strategy

- Open recipe detail page — verify units display (metric or imperial)
- Navigate to Settings — change unit system from metric to imperial
- Navigate back to recipe detail page — verify units updated without page reload
- Open recipe detail in a second tab — verify units match across tabs
- Test with no preferences set — verify default is metric
- Test with corrupted localStorage — verify graceful fallback to metric

## Risk Assessment

- **Low**: Option A is the simplest if preferences are already in the auth response
- **Medium**: Option B requires a new context provider but is self-contained
- **Low**: Option C piggybacks on D10 and is the most robust

## Dependencies

- **D10** (TanStack Query) — Option C depends on this
- None for Options A or B
