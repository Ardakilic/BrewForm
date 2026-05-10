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

export function RecipeFocusModePage() {
  const { slug } = useParams();
  const { t } = useTranslation();
  // deno-lint-ignore no-explicit-any
  const [recipe, setRecipe] = useState<any>(null);
  // deno-lint-ignore no-explicit-any
  const [allTasteNotes, setAllTasteNotes] = useState<any[]>([]);

  useEffect(() => {
    tasteApi.flat().then((data) => {
      setAllTasteNotes(Array.isArray(data) ? data as any[] : []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!slug) return;
    recipeApi.get(slug).then((data: Record<string, unknown>) => {
      setRecipe(data);
    }).catch(() => {});
  }, [slug]);

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

  const v = recipe.currentVersion ?? {};

  // Equipment items from the API
  // deno-lint-ignore no-explicit-any
  const equipmentItems: any[] = Array.isArray(recipe.equipment) ? recipe.equipment : [];

  // Taste notes from the API
  // deno-lint-ignore no-explicit-any
  const tasteNotes: any[] = Array.isArray(recipe.tasteNotes) ? recipe.tasteNotes : [];

  // Determine section visibility
  const hasBeanData =
    v.productName != null ||
    v.coffeeBrand != null ||
    v.coffeeProcessing != null ||
    v.roastDate != null ||
    v.packageOpenDate != null ||
    v.grindDate != null ||
    (v.bean != null &&
      (v.bean.origin != null || v.bean.roaster != null || v.bean.roastLevel != null));

  const hasBrewTimeline = v.extractionTimeSeconds != null;
  const hasEquipment = equipmentItems.length > 0;
  const hasTastingNotes = tasteNotes.length > 0 || (v.personalNotes != null && v.personalNotes !== '');

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
        ← {t('recipe.focusMode.backToRecipe')}
      </Link>

      <div className='space-y-6'>
        {/* Recipe title in serif font */}
        <div>
          <h1
            className='text-3xl font-bold mb-1'
            style={{ color: 'var(--text-primary)', fontFamily: 'Georgia, serif' }}
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
          />
        )}

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
