/**
 * Hook that returns the authenticated user's preferred unit system.
 *
 * Reads from `AuthContext` reactively — when the user changes their
 * preference in Settings and `refreshUser()` is called, all consumers
 * automatically re-render with the new unit system.
 *
 * Falls back to `'metric'` when:
 * - No user is authenticated
 * - The user has no preferences record
 * - `unitSystem` is undefined
 */
import { useAuth } from '../contexts/AuthContext.tsx';
import type { UnitSystem } from '@brewform/shared/types';

export function useUnitSystem(): UnitSystem {
  const { user } = useAuth();
  return user?.preferences?.unitSystem ?? 'metric';
}
