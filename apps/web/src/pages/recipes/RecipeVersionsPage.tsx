import type { RecipeVersionRow } from '@brewform/shared/schemas';
import { formatTemperature, formatVolume, formatWeight } from '@brewform/shared/utils';
import { useEffect, useState } from 'react';
import { Link, useLoaderData } from 'react-router';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { Breadcrumb } from '../../components/ui/Breadcrumb.tsx';
import { PageContainer } from '../../components/ui/PageContainer.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useUnitSystem } from '../../hooks/useUnitSystem.ts';
import { formatDate, formatDuration } from '../../utils/format.ts';
import { createLogger } from '../../utils/logger.ts';
import type { loader } from './RecipeVersionsPage.data.ts';

const log = createLogger('RecipeVersionsPage');

/**
 * `/recipes/:slug/versions`: version-history table for a recipe — per-version brew date,
 * method and key parameters formatted for the user's unit system — with a two-version
 * selection that links to the diff page. The history comes from the route loader
 * (`RecipeVersionsPage.data.ts`); a failed load renders the route error state, never
 * `common.noResults`. Never indexed: derived view (`noindex, nofollow`).
 */
export function RecipeVersionsPage() {
  const data = useLoaderData<typeof loader>();

  useEffect(() => {
    log.debug({}, 'RecipeVersionsPage mounted');
    return () => {
      log.debug({}, 'RecipeVersionsPage unmounted');
    };
  }, []);

  return (
    <VersionHistory key={data.slug} title={data.title} slug={data.slug} versions={data.versions} />
  );
}

/** Props of {@link VersionHistory}: the loaded recipe title, slug and version rows. */
interface VersionHistoryProps {
  title: string;
  slug: string;
  versions: RecipeVersionRow[];
}

/**
 * The version rows with their selection checkboxes (at most two). Keyed by slug in
 * {@link RecipeVersionsPage}, so the selection resets when another recipe loads.
 */
function VersionHistory({ title, slug, versions }: VersionHistoryProps) {
  const { t, locale } = useTranslation();
  const unitSystem = useUnitSystem();
  const [selected, setSelected] = useState<string[]>([]);
  const data = { title, slug, versions };

  /** Toggle a version ID in the selection set (max 2). */
  const toggleSelect = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 2 ? prev : [...prev, id],
    );
  };

  const brewMethodLabel = (method: string): string =>
    method.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <>
      <SEOHead title={`${data.title} – ${t('recipe.versionHistory')}`} noIndex />
      <PageContainer width="4xl">
        <div className="mb-6">
          <div className="mb-2">
            <Breadcrumb
              items={[
                { label: t('recipe.list.title'), to: '/recipes' },
                { label: data.title, to: `/recipes/${data.slug}` },
                { label: t('recipe.versionHistory') },
              ]}
            />
          </div>
          <h1 className="text-2xl font-bold text-[color:var(--text-primary)]">
            {data.title} – {t('recipe.versionHistory')}
          </h1>
          {selected.length === 2 && (
            <Link
              to={`/recipes/${data.slug}/versions/diff?v1=${selected[0]}&v2=${selected[1]}`}
              className="mt-2 inline-block rounded-md bg-[color:var(--accent-primary)] px-3 py-1.5 text-sm font-medium text-white"
            >
              {t('versionDiff.compareSelected')}
            </Link>
          )}
        </div>

        <div className="space-y-3">
          {data.versions.map((v) => (
            <div
              key={v.id}
              className="rounded-lg p-4 bg-[color:var(--bg-secondary)] border border-[color:var(--border-primary)]"
            >
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected.includes(v.id)}
                    onChange={() => toggleSelect(v.id)}
                    disabled={!selected.includes(v.id) && selected.length >= 2}
                    className="h-4 w-4 accent-[color:var(--accent-primary)]"
                  />
                  <span className="font-semibold text-[color:var(--text-primary)]">
                    v{v.versionNumber}
                  </span>
                </label>
                <span className="text-sm text-[color:var(--text-tertiary)]">
                  {formatDate(v.brewDate, locale)}
                </span>
              </div>
              <div className="mt-2 flex gap-4 text-sm text-[color:var(--text-secondary)]">
                {v.brewMethod && <span>{brewMethodLabel(v.brewMethod)}</span>}
                {v.groundWeightGrams != null && (
                  <span>{formatWeight(v.groundWeightGrams, unitSystem)}</span>
                )}
                {v.extractionVolumeMl != null && (
                  <span>{formatVolume(v.extractionVolumeMl, unitSystem)}</span>
                )}
                {v.extractionTimeSeconds != null && (
                  <span>{formatDuration(v.extractionTimeSeconds, locale)}</span>
                )}
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
      </PageContainer>
    </>
  );
}
