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
