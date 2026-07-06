import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { recipeApi } from '../../api/index.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { createLogger } from '../../utils/logger.ts';
import { BREW_METHODS, DRINK_TYPES } from '@brewform/shared/constants';

const log = createLogger('RecipeComparePage');

// deno-lint-ignore no-explicit-any
function labelFor(value: string, constants: any) {
  return constants.find((c: any) => c.value === value)?.label || value;
}

/**
 * Side-by-side comparison of two recipes (`:slug1` vs `:slug2`):
 * fetches both in parallel and renders their current versions'
 * parameters in a comparison table.
 */
export function RecipeComparePage() {
  const { t } = useTranslation();
  const { slug1, slug2 } = useParams();
  // deno-lint-ignore no-explicit-any
  const [recipe1, setRecipe1] = useState<any>(null);
  // deno-lint-ignore no-explicit-any
  const [recipe2, setRecipe2] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    log.debug({}, 'RecipeComparePage mounted');
    return () => {
      log.debug({}, 'RecipeComparePage unmounted');
    };
  }, []);

  useEffect(() => {
    if (!slug1 || !slug2) return;
    setLoading(true);
    Promise.all([
      recipeApi.get(slug1).catch(() => {
        return null;
      }),
      recipeApi.get(slug2).catch(() => {
        return null;
      }),
    ]).then(([r1, r2]) => {
      setRecipe1(r1);
      setRecipe2(r2);
    }).finally(() => setLoading(false));
  }, [slug1, slug2]);

  if (loading) {
    return (
      <div
        className='mx-auto max-w-6xl px-6 py-12 text-center'
        style={{ color: 'var(--text-secondary)' }}
      >
        {t('common.loading')}
      </div>
    );
  }
  if (!recipe1 || !recipe2) {
    return (
      <div
        className='mx-auto max-w-6xl px-6 py-12 text-center'
        style={{ color: 'var(--text-tertiary)' }}
      >
        {t('compare.notFound')}
      </div>
    );
  }

  const v1 = recipe1.currentVersion;
  const v2 = recipe2.currentVersion;

  return (
    <div className='mx-auto max-w-6xl px-6 py-8'>
      <SEOHead
        title={t('compare.seoTitle').replace('{title1}', recipe1.title).replace(
          '{title2}',
          recipe2.title,
        )}
      />
      <h1 className='text-2xl font-bold mb-6' style={{ color: 'var(--text-primary)' }}>
        {t('recipe.compareTitle')}
      </h1>

      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
        <div>
          <h2 className='text-lg font-semibold mb-4' style={{ color: 'var(--accent-primary)' }}>
            {recipe1.title}
          </h2>
          <CompareTable v={v1} tasteNotes={recipe1.tasteNotes} equipment={recipe1.equipment} />
        </div>
        <div>
          <h2 className='text-lg font-semibold mb-4' style={{ color: 'var(--accent-secondary)' }}>
            {recipe2.title}
          </h2>
          <CompareTable v={v2} tasteNotes={recipe2.tasteNotes} equipment={recipe2.equipment} />
        </div>
      </div>
    </div>
  );
}

// deno-lint-ignore no-explicit-any
function CompareTable(
  { v, tasteNotes, equipment }: {
    v: any;
    tasteNotes: { id: string; name: string }[];
    equipment: { id: string; name: string; type: string }[];
  },
) {
  const { t } = useTranslation();
  return (
    <div className='card'>
      <table className='w-full text-sm'>
        <tbody>
          <CompareRow label={t('recipe.brewMethod')} value={labelFor(v.brewMethod, BREW_METHODS)} />
          <CompareRow
            label={t('recipe.drinkType')}
            value={labelFor(v.drinkType, DRINK_TYPES)}
          />
          <CompareRow
            label={t('recipe.dose')}
            value={v.groundWeightGrams ? `${v.groundWeightGrams}g` : '-'}
          />
          <CompareRow
            label={t('recipe.yield')}
            value={v.extractionVolumeMl ? `${v.extractionVolumeMl}ml` : '-'}
          />
          <CompareRow
            label={t('recipe.time')}
            value={v.extractionTimeSeconds ? `${v.extractionTimeSeconds}s` : '-'}
          />
          <CompareRow
            label={t('recipe.temperature')}
            value={v.temperatureCelsius ? `${v.temperatureCelsius}°C` : '-'}
          />
          <CompareRow label={t('recipe.ratio')} value={v.brewRatio ? `1:${v.brewRatio}` : '-'} />
          <CompareRow label={t('recipe.rating')} value={v.rating ? `${v.rating}/10` : '-'} />
          <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
            <td className='py-2 font-medium' style={{ color: 'var(--text-secondary)' }}>
              {t('recipe.tasteNotes')}
            </td>
            <td className='py-2' style={{ color: 'var(--text-primary)' }}>
              {tasteNotes.map((note) => note.name).join(', ') || '-'}
            </td>
          </tr>
          <tr>
            <td className='py-2 font-medium' style={{ color: 'var(--text-secondary)' }}>
              {t('equipment.title')}
            </td>
            <td className='py-2' style={{ color: 'var(--text-primary)' }}>
              {equipment.map((e) => e.name).join(', ') || '-'}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function CompareRow({ label, value }: { label: string; value: string }) {
  return (
    <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
      <td className='py-2 font-medium' style={{ color: 'var(--text-secondary)' }}>{label}</td>
      <td className='py-2' style={{ color: 'var(--text-primary)' }}>{value}</td>
    </tr>
  );
}
