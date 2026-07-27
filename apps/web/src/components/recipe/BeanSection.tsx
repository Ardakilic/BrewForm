import {
  daysBetween,
  grindDateResult,
  packageOpenDateResult,
  type RelativeDateResult,
  roastDateResult,
} from '../../utils/relative-date.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { formatDate } from '../../utils/format.ts';

interface BeanSectionProps {
  productName?: string | null;
  coffeeBrand?: string | null;
  coffeeProcessing?: string | null;
  roastDate?: string | Date | null;
  packageOpenDate?: string | Date | null;
  grindDate?: string | Date | null;
  brewDate?: string | Date | null;
  bean?: {
    origin?: string | null;
    roaster?: string | null;
    roastLevel?: string | null;
  } | null;
}

function parseDate(value: string | Date | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function hasBeanData(props: BeanSectionProps): boolean {
  const {
    productName,
    coffeeBrand,
    coffeeProcessing,
    roastDate,
    packageOpenDate,
    grindDate,
    bean,
  } = props;
  return (
    productName != null ||
    coffeeBrand != null ||
    coffeeProcessing != null ||
    roastDate != null ||
    packageOpenDate != null ||
    grindDate != null ||
    (bean != null && (bean.origin != null || bean.roaster != null || bean.roastLevel != null))
  );
}

/**
 * Returns "peak window" label if the roast date is 7–21 days before the brew date.
 */
function isPeakWindow(roastDate: Date, brewDate: Date): boolean {
  const days = daysBetween(roastDate, brewDate);
  return days >= 7 && days <= 21;
}

/**
 * Bean details card: product/brand/processing, origin/roaster/roast level,
 * and roast / package-open / grind dates with relative-day badges and a
 * "peak window" hint (7–21 days post-roast). Renders nothing without bean data.
 */
export function BeanSection(props: BeanSectionProps) {
  const { t, locale } = useTranslation();
  const {
    productName,
    coffeeBrand,
    coffeeProcessing,
    roastDate: roastDateRaw,
    packageOpenDate: packageOpenDateRaw,
    grindDate: grindDateRaw,
    brewDate: brewDateRaw,
    bean,
  } = props;

  if (!hasBeanData(props)) {
    return null;
  }

  const brewDate = parseDate(brewDateRaw) ?? new Date();
  const roastDate = parseDate(roastDateRaw);
  const packageOpenDate = parseDate(packageOpenDateRaw);
  const grindDate = parseDate(grindDateRaw);

  /** Translates a RelativeDateResult to a localized string */
  function translateRelative(result: RelativeDateResult): string {
    if (result.type === 'today') return t('common.today');
    if (result.type === 'daysPostRoast') {
      return t('recipe.bean.daysPostRoast').replace('{days}', String(result.days));
    }
    if (result.type === 'daysSinceOpened') {
      return t('recipe.bean.daysSinceOpened').replace('{days}', String(result.days));
    }
    // daysAgo
    return t('recipe.bean.daysAgo').replace('{days}', String(result.days));
  }

  /**
   * Short inline badge: "14d" or "today".
   * Used next to the date in the compact grid.
   */
  function shortRelative(result: RelativeDateResult): string {
    if (result.type === 'today') return t('common.today');
    return `${result.days}d`;
  }

  // Header: "X days post-roast · peak window"
  const roastResult = roastDate ? roastDateResult(roastDate, brewDate) : null;
  const roastHeaderLabel = roastResult ? translateRelative(roastResult) : null;
  const showPeakWindow = roastDate ? isPeakWindow(roastDate, brewDate) : false;

  // Subtitle: "Heart Roasters · Washed process"
  const roasterDisplay = coffeeBrand ?? bean?.roaster ?? null;
  const processingDisplay = coffeeProcessing
    ? coffeeProcessing.charAt(0).toUpperCase() + coffeeProcessing.slice(1).toLowerCase() +
      ' process'
    : null;
  const subtitle = [roasterDisplay, processingDisplay].filter(Boolean).join(' · ') || null;

  const origin = bean?.origin ?? null;

  return (
    <section className='card' aria-label={t('a11y.bean.section')}>
      {/* Section header */}
      <div className='flex items-center justify-between mb-4'>
        <span className='text-xs uppercase tracking-widest font-semibold text-[color:var(--text-tertiary)]'>
          {t('recipe.bean.title')}
        </span>
        {roastHeaderLabel && (
          <span className='text-xs text-[color:var(--text-tertiary)]'>
            {roastHeaderLabel}
            {showPeakWindow && (
              <span className='text-[color:var(--accent-primary)]'>
                · {t('recipe.bean.peakWindow')}
              </span>
            )}
          </span>
        )}
      </div>

      {/* Body */}
      <div className='flex gap-4 items-start'>
        {/* Bean image placeholder */}
        <div
          className='flex-shrink-0 rounded-lg overflow-hidden flex items-center justify-center w-[72px] h-[72px] bg-[color:var(--bg-tertiary)] text-[color:var(--text-tertiary)] text-2xl'
          aria-label={t('a11y.bean.imagePlaceholder')}
          role='img'
        >
          ☕
        </div>

        {/* Right side: name + subtitle + date grid */}
        <div className='flex-1 min-w-0'>
          {/* Product name */}
          {productName && (
            <span className='block text-xl font-bold leading-tight mb-0.5 text-[color:var(--text-primary)]'>
              {productName}
            </span>
          )}

          {/* Subtitle: "Heart Roasters · Washed process" */}
          {subtitle && (
            <span className='block text-sm mb-3 text-[color:var(--text-secondary)]'>
              {subtitle}
            </span>
          )}

          {/* Date + origin grid: 2 columns */}
          <div className='grid grid-cols-2 gap-x-6 gap-y-2'>
            {roastDate && roastResult && (
              <DateField
                label={t('recipe.bean.roasted')}
                date={roastDate}
                relative={shortRelative(roastResult)}
                locale={locale}
              />
            )}
            {packageOpenDate && (
              <DateField
                label={t('recipe.bean.bagOpened')}
                date={packageOpenDate}
                relative={shortRelative(packageOpenDateResult(packageOpenDate, brewDate))}
                locale={locale}
              />
            )}
            {grindDate && (
              <DateField
                label={t('recipe.bean.ground')}
                date={grindDate}
                relative={shortRelative(grindDateResult(grindDate, brewDate))}
                locale={locale}
              />
            )}
            {origin && (
              <div className='flex flex-col gap-0.5'>
                <span className='text-xs uppercase tracking-widest text-[color:var(--text-tertiary)]'>
                  {t('recipe.bean.origin')}
                </span>
                <span className='text-sm font-bold text-[color:var(--text-primary)]'>
                  {origin}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

interface DateFieldProps {
  label: string;
  date: Date;
  relative: string;
  locale: string;
}

function DateField({ label, date, relative, locale }: DateFieldProps) {
  return (
    <div className='flex flex-col gap-0.5'>
      <span className='text-xs uppercase tracking-widest text-[color:var(--text-tertiary)]'>
        {label}
      </span>
      {/* Date + short relative on one line */}
      <span className='flex items-baseline gap-1.5'>
        <span className='text-sm font-bold text-[color:var(--text-primary)]'>
          {formatDate(date, locale)}
        </span>
        <span className='text-xs text-[color:var(--text-tertiary)]'>
          {relative}
        </span>
      </span>
    </div>
  );
}
