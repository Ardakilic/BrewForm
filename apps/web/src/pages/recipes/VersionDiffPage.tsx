import { formatTemperature, formatVolume, formatWeight } from '@brewform/shared/utils';
import { useEffect } from 'react';
import { useLoaderData } from 'react-router';
import { DiffHighlighter } from '../../components/recipe/DiffHighlighter.tsx';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { Breadcrumb } from '../../components/ui/Breadcrumb.tsx';
import { PageContainer } from '../../components/ui/PageContainer.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useUnitSystem } from '../../hooks/useUnitSystem.ts';
import { formatDate, formatDecimal, formatDuration } from '../../utils/format.ts';
import { createLogger } from '../../utils/logger.ts';
import type { loader } from './VersionDiffPage.data.ts';

const log = createLogger('VersionDiffPage');

/** i18n label key for each diffed version field. */
const FIELD_LABELS: Record<string, string> = {
  brewMethod: 'recipe.brewMethod',
  drinkType: 'recipe.drinkType',
  productName: 'recipe.productName',
  coffeeBrand: 'recipe.coffeeBrand',
  coffeeProcessing: 'recipe.coffeeProcessing',
  grindSize: 'recipe.grindSize',
  grinder: 'recipe.grinder',
  brewerDetails: 'recipe.brewerDetails',
  groundWeightGrams: 'recipe.groundWeight',
  extractionTimeSeconds: 'recipe.extractionTime',
  extractionVolumeMl: 'recipe.extractionVolume',
  temperatureCelsius: 'recipe.temperature',
  brewRatio: 'recipe.ratio',
  flowRate: 'recipe.flowRate',
  preInfusionTimeSeconds: 'recipe.preInfusionTime',
  tds: 'recipe.tds',
  preparationNotes: 'recipe.preparationNotes',
  personalNotes: 'recipe.personalNotes',
  rating: 'recipe.rating',
  emojiTag: 'recipe.emojiTag',
};

/** A labelled list of added (+), removed (-) and unchanged tags (taste notes, equipment). */
function DiffTagList({
  items,
  label,
}: {
  items: { added: string[]; removed: string[]; unchanged: string[] };
  label: string;
}) {
  return (
    <div className="mt-4">
      <h3 className="mb-2 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </h3>
      <div className="flex flex-wrap gap-2">
        {items.added.map((item) => (
          <span
            key={item}
            className="rounded px-2 py-0.5 text-xs"
            style={{ color: 'var(--diff-added-text)', backgroundColor: 'var(--diff-added-bg)' }}
          >
            + {item}
          </span>
        ))}
        {items.removed.map((item) => (
          <span
            key={item}
            className="rounded px-2 py-0.5 text-xs"
            style={{ color: 'var(--diff-removed-text)', backgroundColor: 'var(--diff-removed-bg)' }}
          >
            - {item}
          </span>
        ))}
        {items.unchanged.map((item) => (
          <span
            key={item}
            className="rounded px-2 py-0.5 text-xs"
            style={{ color: 'var(--text-secondary)' }}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * `/recipes/:slug/versions/diff?v1&v2`: a field-by-field diff between two recipe versions,
 * with unit-aware formatting for scalar fields and colored tag lists for taste
 * notes/equipment. The diff comes from the route loader (`VersionDiffPage.data.ts`); a failed
 * load renders the route error state, never `common.noResults`. Never indexed: derived view
 * (`noindex, nofollow`).
 */
export function VersionDiffPage() {
  const { slug, diff: data } = useLoaderData<typeof loader>();
  const { t, locale } = useTranslation();
  const unitSystem = useUnitSystem();

  useEffect(() => {
    log.debug({}, 'VersionDiffPage mounted');
    return () => {
      log.debug({}, 'VersionDiffPage unmounted');
    };
  }, []);

  /** The display formatter for a diffed field, or `undefined` for the raw value. */
  const getFormatter = (field: string) => {
    if (field === 'groundWeightGrams') {
      return (v: string | number | null) => (v != null ? formatWeight(Number(v), unitSystem) : '-');
    }
    if (field === 'extractionVolumeMl') {
      return (v: string | number | null) => (v != null ? formatVolume(Number(v), unitSystem) : '-');
    }
    if (field === 'temperatureCelsius') {
      return (v: string | number | null) =>
        v != null
          ? formatTemperature(Number(v), unitSystem === 'imperial' ? 'fahrenheit' : 'celsius')
          : '-';
    }
    if (field === 'extractionTimeSeconds' || field === 'preInfusionTimeSeconds') {
      return (v: string | number | null) => (v != null ? formatDuration(Number(v), locale) : '-');
    }
    if (field === 'brewRatio') {
      return (v: string | number | null) =>
        v != null ? `1:${formatDecimal(Number(v), locale, 1)}` : '-';
    }
    if (field === 'flowRate') {
      return (v: string | number | null) =>
        v != null
          ? t('recipe.brewTimeline.flowRate').replace(
              '{value}',
              formatDecimal(Number(v), locale, 1),
            )
          : '-';
    }
    return undefined;
  };

  return (
    <>
      <SEOHead title={`${slug} – ${t('versionDiff.title')}`} noIndex />
      <PageContainer width="4xl">
        <div className="mb-6">
          <Breadcrumb
            items={[
              { label: t('recipe.list.title'), to: '/recipes' },
              { label: slug, to: `/recipes/${slug}` },
              { label: t('versionDiff.title') },
            ]}
          />
        </div>

        <h1 className="mb-4 text-2xl font-bold">{t('versionDiff.title')}</h1>

        <div className="mb-6 flex gap-8 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <span>
            v{data.version1.versionNumber} — {formatDate(data.version1.brewDate, locale)}
          </span>
          <span>
            v{data.version2.versionNumber} — {formatDate(data.version2.brewDate, locale)}
          </span>
        </div>

        <h2 className="mb-2 text-lg font-semibold">{t('versionDiff.parameters')}</h2>
        <div className="mb-6">
          {data.fields.map((f) => (
            <DiffHighlighter
              key={f.field}
              labelKey={FIELD_LABELS[f.field] ?? f.field}
              value1={f.value1}
              value2={f.value2}
              status={f.status}
              formatter={getFormatter(f.field)}
            />
          ))}
        </div>

        <DiffTagList items={data.tasteNotes} label={t('recipe.tasteNotes')} />
        <DiffTagList items={data.equipment} label={t('equipment.title')} />
      </PageContainer>
    </>
  );
}
