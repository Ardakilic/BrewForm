import {
  roastDateLabel,
  packageOpenDateLabel,
  grindDateLabel,
} from '../../utils/relative-date.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';

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

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function hasBeanData(props: BeanSectionProps): boolean {
  const { productName, coffeeBrand, coffeeProcessing, roastDate, packageOpenDate, grindDate, bean } =
    props;
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

export function BeanSection(props: BeanSectionProps) {
  const { t } = useTranslation();
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

  // Compute days post-roast for the header label
  const roastLabel = roastDate ? roastDateLabel(roastDate, brewDate) : null;

  // Resolve brand/roaster: prefer coffeeBrand, fall back to bean.roaster
  const brandDisplay = coffeeBrand ?? bean?.roaster ?? null;

  // Origin from linked bean record
  const origin = bean?.origin ?? null;

  return (
    <section className='card' aria-label='Bean information'>
      {/* Section header */}
      <div className='flex items-center justify-between mb-4'>
        <span
          className='text-xs uppercase tracking-widest font-semibold'
          style={{ color: 'var(--text-tertiary)' }}
        >
          {t('recipe.bean.title')}
        </span>
        {roastLabel && (
          <span className='text-xs' style={{ color: 'var(--text-tertiary)' }}>
            {roastLabel}
            {bean?.roastLevel ? ` · ${bean.roastLevel}` : ''}
          </span>
        )}
      </div>

      {/* Body: left side (image + text) + right side (date grid) */}
      <div className='flex flex-col sm:flex-row gap-4'>
        {/* Left side */}
        <div className='flex gap-3 items-start'>
          {/* 80×80 image placeholder */}
          <div
            className='flex-shrink-0 flex items-center justify-center rounded-lg text-2xl'
            style={{
              width: '80px',
              height: '80px',
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-tertiary)',
            }}
            aria-label='Coffee bean image placeholder'
            role='img'
          >
            ☕
          </div>

          {/* Product info */}
          <div className='flex flex-col gap-1'>
            {productName && (
              <span
                className='text-lg font-bold leading-tight'
                style={{ color: 'var(--text-primary)' }}
              >
                {productName}
              </span>
            )}
            {brandDisplay && (
              <span className='text-sm' style={{ color: 'var(--text-secondary)' }}>
                {brandDisplay}
              </span>
            )}
            {coffeeProcessing && (
              <span
                className='text-xs uppercase tracking-wide'
                style={{ color: 'var(--text-tertiary)' }}
              >
                {coffeeProcessing}
              </span>
            )}
          </div>
        </div>

        {/* Right side: 2-column date/info grid */}
        <div className='flex-1 grid grid-cols-2 gap-x-4 gap-y-3 sm:ml-auto'>
          {roastDate && (
            <DateField
              label={t('recipe.bean.roasted')}
              date={roastDate}
              relative={roastDateLabel(roastDate, brewDate)}
            />
          )}
          {packageOpenDate && (
            <DateField
              label={t('recipe.bean.bagOpened')}
              date={packageOpenDate}
              relative={packageOpenDateLabel(packageOpenDate, brewDate)}
            />
          )}
          {grindDate && (
            <DateField
              label={t('recipe.bean.ground')}
              date={grindDate}
              relative={grindDateLabel(grindDate, brewDate)}
            />
          )}
          {origin && (
            <div className='flex flex-col gap-0.5'>
              <span
                className='text-xs uppercase tracking-widest'
                style={{ color: 'var(--text-tertiary)' }}
              >
                {t('recipe.bean.origin')}
              </span>
              <span className='text-sm font-bold' style={{ color: 'var(--text-primary)' }}>
                {origin}
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

interface DateFieldProps {
  label: string;
  date: Date;
  relative: string;
}

function DateField({ label, date, relative }: DateFieldProps) {
  return (
    <div className='flex flex-col gap-0.5'>
      <span
        className='text-xs uppercase tracking-widest'
        style={{ color: 'var(--text-tertiary)' }}
      >
        {label}
      </span>
      <span className='text-sm font-bold' style={{ color: 'var(--text-primary)' }}>
        {formatDate(date)}
      </span>
      <span className='text-xs' style={{ color: 'var(--text-tertiary)' }}>
        {relative}
      </span>
    </div>
  );
}
