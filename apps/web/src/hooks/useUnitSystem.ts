import type { UnitSystem } from '@brewform/shared/types';

export function useUnitSystem(): UnitSystem {
  if (typeof window === 'undefined') return 'metric';
  const stored = localStorage.getItem('brewform-preferences');
  if (stored) {
    try {
      const prefs = JSON.parse(stored);
      if (prefs.unitSystem === 'imperial') return 'imperial';
    } catch {
      // ignore parse errors
    }
  }
  return 'metric';
}
