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
import { createLogger } from '@/utils/logger.ts';
import type { UnitSystem } from '@brewform/shared/types';

const log = createLogger('useUnitSystem');

export function useUnitSystem(): UnitSystem {
  const { user } = useAuth();
  const unitSystem = user?.preferences?.unitSystem ?? 'metric';
  log.trace?.({ unitSystem }, 'useUnitSystem unit system read');
  return unitSystem;
}
