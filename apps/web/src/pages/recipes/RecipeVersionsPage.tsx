import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../../api/client.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { useUnitSystem } from '../../hooks/useUnitSystem.ts';
import { createLogger } from '../../utils/logger.ts';
import { formatTemperature, formatVolume, formatWeight } from '@brewform/shared/utils';

const log = createLogger('RecipeVersionsPage');

interface VersionSummary {
  id: string;
  versionNumber: number;
  brewDate: string;
  brewMethod: string;
  groundWeightGrams: number | null;
  extractionVolumeMl: number | null;
  extractionTimeSeconds: number | null;
  temperatureCelsius: number | null;
}

export function RecipeVersionsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const unitSystem = useUnitSystem();
  const [data, setData] = useState<
    { title: string; slug: string; versions: VersionSummary[] } | null
  >(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    log.debug({}, 'RecipeVersionsPage mounted');
    return () => {
      log.debug({}, 'RecipeVersionsPage unmounted');
    };
  }, []);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setData(null);
    api.get<{ title: string; slug: string; versions: VersionSummary[] }>(
      `/recipes/${slug}/versions`,
    )
      .then(setData)
      .catch((err) => {
        log.error({ err }, 'RecipeVersionsPage loadData failed');
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className='mx-auto max-w-4xl px-4 py-12 text-[color:var(--text-secondary)]'>
        {t('common.loading')}
      </div>
    );
  }
  if (!data) {
    return (
      <div className='mx-auto max-w-4xl px-4 py-12 text-[color:var(--text-secondary)]'>
        {t('common.noResults')}
      </div>
    );
  }

  const brewMethodLabel = (method: string): string =>
    method.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <>
      <SEOHead title={`${data.title} – ${t('recipe.versionHistory')}`} />
      <div className='mx-auto max-w-4xl px-4 py-12'>
        <div className='mb-6'>
          <Link
            to={`/recipes/${data.slug}`}
            className='text-sm text-[color:var(--accent-primary)] hover:underline'
          >
            ← {t('common.back')}
          </Link>
          <h1 className='text-2xl font-bold mt-2 text-[color:var(--text-primary)]'>
            {data.title} – {t('recipe.versionHistory')}
          </h1>
        </div>

        <div className='space-y-3'>
          {data.versions.map((v) => (
            <div
              key={v.id}
              className='rounded-lg p-4 bg-[color:var(--bg-secondary)] border border-[color:var(--border-primary)]'
            >
              <div className='flex items-center justify-between'>
                <span className='font-semibold text-[color:var(--text-primary)]'>
                  v{v.versionNumber}
                </span>
                <span className='text-sm text-[color:var(--text-tertiary)]'>
                  {new Date(v.brewDate).toLocaleDateString()}
                </span>
              </div>
              <div className='mt-2 flex gap-4 text-sm text-[color:var(--text-secondary)]'>
                {v.brewMethod && <span>{brewMethodLabel(v.brewMethod)}</span>}
                {v.groundWeightGrams != null && (
                  <span>{formatWeight(v.groundWeightGrams, unitSystem)}</span>
                )}
                {v.extractionVolumeMl != null && (
                  <span>{formatVolume(v.extractionVolumeMl, unitSystem)}</span>
                )}
                {v.extractionTimeSeconds != null && <span>{v.extractionTimeSeconds}s</span>}
                {v.temperatureCelsius != null && (
                  <span>
                    {formatTemperature(
                      v.temperatureCelsius,
                      unitSystem === 'imperial' ? 'fahrenheit' : 'celsius',
                    )}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
