import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { recipeApi, tasteApi } from '../../api/index.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { StatCards } from '../../components/recipe/StatCards.tsx';
import { BeanSection } from '../../components/recipe/BeanSection.tsx';
import { BrewTimeline } from '../../components/recipe/BrewTimeline.tsx';
import { EquipmentSection } from '../../components/recipe/EquipmentSection.tsx';
import { TastingNotesSection } from '../../components/recipe/TastingNotesSection.tsx';
import { ErrorState } from '../../components/ui/ErrorState.tsx';
import { createLogger } from '../../utils/logger.ts';
import type {
  RecipeDetailOutput,
  RecipeDetailVersionOutput,
  TasteNoteOutput,
} from '@brewform/shared/schemas';

const log = createLogger('RecipeFocusModePage');

/** Renders a focused, distraction-free view of a single brew recipe with stats, bean info, brew timeline, equipment, and tasting notes. */
export function RecipeFocusModePage() {
  const { slug } = useParams();
  const { t } = useTranslation();
  const [recipe, setRecipe] = useState<RecipeDetailOutput | null>(null);
  const [allTasteNotes, setAllTasteNotes] = useState<TasteNoteOutput[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    log.debug({}, 'RecipeFocusModePage mounted');
    return () => {
      log.debug({}, 'RecipeFocusModePage unmounted');
    };
  }, []);

  useEffect(() => {
    tasteApi.flat().then((data) => {
      setAllTasteNotes(Array.isArray(data) ? data : []);
    }).catch((err) => {
      log.error({ err }, 'Failed to fetch taste notes for focus mode');
    });
  }, []);

  useEffect(() => {
    if (!slug) return;
    recipeApi.get(slug).then((data) => {
      setRecipe(data);
    }).catch((err) => {
      log.error({ err, slug }, 'Failed to fetch recipe for focus mode');
      setError(t('recipe.focusMode.loadError'));
    });
  }, [slug, t]);

  if (error) {
    return (
      <div className='mx-auto max-w-3xl px-4 sm:px-6 py-12'>
        <ErrorState message={error} />
      </div>
    );
  }

  if (!recipe) {
    return (
      <div
        className='mx-auto max-w-3xl px-4 sm:px-6 py-12 text-center'
        style={{ color: 'var(--text-secondary)' }}
      >
        {t('common.loading')}
      </div>
    );
  }

  const v: Partial<RecipeDetailVersionOutput> = recipe.currentVersion ?? {};

  // Equipment items from the API
  const equipmentItems: RecipeDetailOutput['equipment'] = Array.isArray(recipe.equipment)
    ? recipe.equipment
    : [];

  // Taste notes from the API
  const tasteNotes: RecipeDetailOutput['tasteNotes'] = Array.isArray(recipe.tasteNotes)
    ? recipe.tasteNotes
    : [];

  // Determine section visibility
  const hasBeanData = v.productName != null ||
    v.coffeeBrand != null ||
    v.coffeeProcessing != null ||
    v.roastDate != null ||
    v.packageOpenDate != null ||
    v.grindDate != null ||
    (v.bean != null &&
      (v.bean.origin != null || v.bean.roaster != null || v.bean.roastLevel != null));

  const hasBrewTimeline = v.extractionTimeSeconds != null;
  const hasEquipment = equipmentItems.length > 0 ||
    (v.brewerDetails != null && v.brewerDetails !== '');
  const hasTastingNotes = tasteNotes.length > 0 ||
    (v.personalNotes != null && v.personalNotes !== '');

  return (
    <div className='focus-mode mx-auto max-w-3xl px-4 sm:px-6 py-8'>
      <SEOHead
        title={recipe.title}
        noIndex
        canonical={`${globalThis.location.origin}/recipes/${slug}`}
      />

      {/* Back to Recipe link — visible without scrolling */}
      <Link
        to={`/recipes/${slug}`}
        className='mb-6 text-sm inline-block'
        style={{ color: 'var(--accent-primary)' }}
      >
        {t('recipe.focusMode.backToRecipe')}
      </Link>

      <div className='space-y-6'>
        {/* Recipe title in serif font */}
        <div>
          <h1
            className='text-3xl font-bold font-serif mb-1'
            style={{ color: 'var(--text-primary)' }}
          >
            {recipe.title}
          </h1>
          {/* Author byline */}
          <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>
            {t('recipe.focusMode.by')} {recipe.author?.displayName || recipe.author?.username}
          </p>
        </div>

        {/* Stat Cards — full width, all 5 */}
        <StatCards version={v} />

        {/* Bean Section — hide if no bean data */}
        {hasBeanData && (
          <BeanSection
            productName={v.productName}
            coffeeBrand={v.coffeeBrand}
            coffeeProcessing={v.coffeeProcessing}
            roastDate={v.roastDate}
            packageOpenDate={v.packageOpenDate}
            grindDate={v.grindDate}
            brewDate={v.brewDate}
            bean={v.bean}
          />
        )}

        {/* Brew Timeline — hide if no extractionTimeSeconds */}
        {hasBrewTimeline && (
          <BrewTimeline
            extractionTimeSeconds={v.extractionTimeSeconds}
            preInfusionTimeSeconds={v.preInfusionTimeSeconds}
            flowRate={v.flowRate}
          />
        )}

        {/* Equipment Section — hide if no equipment */}
        {hasEquipment && (
          <EquipmentSection
            items={equipmentItems}
            brewMethod={v.brewMethod}
            brewerDetails={v.brewerDetails}
          />
        )}

        {/* Preparation Notes Section — always show (mandatory field) */}
        <section className='card' aria-label={t('a11y.preparationNotes')}>
          <div className='flex items-center justify-between mb-4'>
            <span
              className='text-xs font-semibold uppercase tracking-widest'
              style={{ color: 'var(--text-tertiary)' }}
            >
              {t('recipe.preparationNotes')}
            </span>
          </div>
          <p
            className='text-sm'
            style={{
              color: 'var(--text-secondary)',
              whiteSpace: 'pre-wrap',
              lineHeight: '1.6',
            }}
          >
            {v.preparationNotes}
          </p>
        </section>

        {/* Tasting Notes Section — hide if no taste notes AND no personalNotes */}
        {hasTastingNotes && (
          <TastingNotesSection
            tasteNotes={tasteNotes}
            personalNotes={v.personalNotes}
            allTasteNotes={allTasteNotes}
          />
        )}
      </div>
    </div>
  );
}
