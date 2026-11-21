import { t as fallbackTranslate } from '@brewform/shared/i18n';
import { useContext } from 'react';
import { I18nContext } from '../contexts/I18nContext.tsx';

/**
 * Locale-bound `t()` that degrades to the bundled English string when rendered
 * outside an `I18nProvider`. Several presentational components (equipment icons,
 * `IntensityDots`, `ScaaRadarChart`, `ActiveFilterBadge`, taste-note filters)
 * are unit-tested without a provider, where `useTranslation()` throws; this hook
 * keeps their aria-labels/placeholders externalised and locale-reactive in the
 * app while staying safe in bare test renders. The context is read directly
 * (instead of `useTranslation()`) so no hook ever runs conditionally.
 */
export function useSafeT(): (key: string) => string {
  const context = useContext(I18nContext);
  return context ? context.t : fallbackTranslate;
}

/**
 * Active locale that degrades to `'en'` outside an `I18nProvider`.
 *
 * The locale companion of {@link useSafeT}: presentational chart and rating
 * components pass it to the `utils/format.ts` helpers so numbers and durations
 * localize in the app while bare test renders (no provider) still work.
 *
 * @returns The context locale, or `'en'` when no provider is mounted.
 */
export function useSafeLocale(): string {
  const context = useContext(I18nContext);
  return context ? context.locale : 'en';
}
