import { useAuth } from '../contexts/AuthContext.tsx';
import type { UnitSystem } from '@brewform/shared/types';

export function useUnitSystem(): UnitSystem {
  const { user } = useAuth();
  return user?.preferences?.unitSystem ?? 'metric';
}
