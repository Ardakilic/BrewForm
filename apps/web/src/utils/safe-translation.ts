import { t as fallbackTranslate } from '@brewform/shared/i18n';
import { useTranslation } from '../contexts/I18nContext.tsx';

/**
 * Locale-bound `t()` that degrades to the bundled English string when rendered
 * outside an `I18nProvider`. Several presentational components (equipment icons,
 * `IntensityDots`, `ScaaRadarChart`, `ActiveFilterBadge`, taste-note filters)
 * are unit-tested without a provider, where `useTranslation()` throws; this hook
 * keeps their aria-labels/placeholders externalised and locale-reactive in the
 * app while staying safe in bare test renders. The `useContext` call inside
 * `useTranslation()` runs unconditionally, so hook order stays stable.
 */
export function useSafeT(): (key: string) => string {
  try {
    return useTranslation().t;
  } catch {
    return fallbackTranslate;
  }
}
