import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { recipeApi } from '../../api/index.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { EMOJI_TAGS } from '@brewform/shared/constants';

export function RecipeFocusModePage() {
  const { slug } = useParams();
  const { t } = useTranslation();
  // deno-lint-ignore no-explicit-any
  const [recipe, setRecipe] = useState<any>(null);

  useEffect(() => {
    if (!slug) return;
    recipeApi.get(slug).then((data: Record<string, unknown>) => {
      setRecipe(data);
    }).catch(() => {});
  }, [slug]);

  if (!recipe) {
    return (
      <div
        className='mx-auto max-w-2xl px-6 py-12 text-center'
        style={{ color: 'var(--text-secondary)' }}
      >
        {t('common.loading')}
      </div>
    );
  }

  const v = recipe.currentVersion ?? {};
  // deno-lint-ignore no-explicit-any
  const emoji = v.emojiTag ? EMOJI_TAGS.find((e: any) => e.key === v.emojiTag) : null;

  return (
    <div className='focus-mode mx-auto max-w-2xl px-6 py-16'>
      <SEOHead
        title={recipe.title}
        noIndex
        canonical={`${globalThis.location.origin}/recipes/${slug}`}
      />
      <Link
        to={`/recipes/${slug}`}
        className='mb-8 text-sm inline-block'
        style={{ color: 'var(--accent-primary)' }}
      >
        {t('recipe.focusMode.backToRecipe')}
      </Link>

      <h1 className='text-3xl font-bold mb-2' style={{ color: 'var(--text-primary)' }}>
        {recipe.title}
      </h1>
      <p className='mb-8 text-sm' style={{ color: 'var(--text-secondary)' }}>
        {t('recipe.focusMode.by')} {recipe.author?.displayName || recipe.author?.username}
      </p>

      <div className='space-y-6' style={{ lineHeight: '1.8' }}>
        <section>
          <h2 className='text-lg font-semibold mb-3' style={{ color: 'var(--accent-primary)' }}>
            {t('recipe.brewParams')}
          </h2>
          <div className='grid grid-cols-2 gap-2 text-sm'>
            {v.brewMethod && (
              <Param label={t('recipe.focusMode.method')} value={v.brewMethod.replace(/_/g, ' ')} />
            )}
            {v.drinkType && (
              <Param label={t('recipe.focusMode.drink')} value={v.drinkType.replace(/_/g, ' ')} />
            )}
            {v.productName && (
              <Param label={t('recipe.focusMode.product')} value={v.productName} />
            )}
            {v.coffeeBrand && (
              <Param label={t('recipe.focusMode.brand')} value={v.coffeeBrand} />
            )}
            {v.grinder && (
              <Param label={t('recipe.grinder')} value={v.grinder} />
            )}
            {v.grindSize && (
              <Param label={t('recipe.focusMode.grind')} value={v.grindSize} />
            )}
            {v.groundWeightGrams && (
              <Param label={t('recipe.focusMode.dose')} value={`${v.groundWeightGrams}g`} />
            )}
            {v.extractionTimeSeconds && (
              <Param label={t('recipe.focusMode.time')} value={`${v.extractionTimeSeconds}s`} />
            )}
            {v.extractionVolumeMl && (
              <Param label={t('recipe.focusMode.yield')} value={`${v.extractionVolumeMl}ml`} />
            )}
            {v.temperatureCelsius && (
              <Param label={t('recipe.focusMode.temp')} value={`${v.temperatureCelsius}°C`} />
            )}
            {v.brewRatio && (
              <Param label={t('recipe.focusMode.ratio')} value={`1:${v.brewRatio}`} />
            )}
            {v.rating && (
              <Param
                label={t('recipe.focusMode.rating')}
                value={`${v.rating}/10 ${emoji ? emoji.emoji : ''}`}
              />
            )}
          </div>
        </section>

        {Array.isArray(recipe.tasteNotes) && recipe.tasteNotes.length > 0 && (
          <section>
            <h2 className='text-lg font-semibold mb-2' style={{ color: 'var(--accent-primary)' }}>
              {t('recipe.tasteNotes')}
            </h2>
            <div className='flex flex-wrap gap-2'>
              {recipe.tasteNotes.map((tn: any) => (
                <span key={tn.id} className='badge'>{tn.name}</span>
              ))}
            </div>
          </section>
        )}

        {v.personalNotes && (
          <section>
            <h2 className='text-lg font-semibold mb-2' style={{ color: 'var(--accent-primary)' }}>
              {t('recipe.focusMode.notes')}
            </h2>
            <p className='whitespace-pre-wrap' style={{ color: 'var(--text-secondary)' }}>
              {v.personalNotes}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

function Param({ label, value }: { label: string; value: string }) {
  return (
    <div
      className='flex justify-between py-1'
      style={{ borderBottom: '1px solid var(--border-primary)' }}
    >
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span className='font-medium' style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}
