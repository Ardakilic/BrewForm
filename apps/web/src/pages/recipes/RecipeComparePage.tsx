import { BREW_METHODS, DRINK_TYPES } from '@brewform/shared/constants';
import type { RecipeDetailVersionOutput } from '@brewform/shared/schemas';
import { useEffect, useState } from 'react';
import { useFetcher, useLoaderData, useNavigate } from 'react-router';
import { DiffHighlighter } from '../../components/recipe/DiffHighlighter.tsx';
import { MergeSelector } from '../../components/recipe/MergeSelector.tsx';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useActionFeedback } from '../../hooks/useActionFeedback.ts';
import { formatDecimal, formatDuration } from '../../utils/format.ts';
import { createLogger } from '../../utils/logger.ts';
import type { action, loader } from './RecipeComparePage.data.ts';
import { recipeFormErrorMessage } from './recipe-form-errors.ts';

const log = createLogger('RecipeComparePage');

/** The display label of a constant `value` (falls back to the raw value). */
function labelFor(value: string, constants: ReadonlyArray<{ value: string; label: string }>) {
  return constants.find((c) => c.value === value)?.label || value;
}

/** A formatter that appends `unit` to a value, or `-` when the value is missing. */
const unitFormatter = (unit: string) => (val: string | number | null) =>
  val != null ? `${val}${unit}` : '-';

/**
 * Unified diff comparison of two recipes (`:slug1` vs `:slug2`): both come from the route
 * loader (`RecipeComparePage.data.ts`; a missing recipe renders the not-found page and any
 * other failure the route error state), and their current versions' parameters render in a
 * single diff table, with an optional merge flow submitted to the route action. Never
 * indexed: derived view (`noindex, nofollow`).
 */
export function RecipeComparePage() {
  const { t } = useTranslation();
  const { recipe1, recipe2 } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const mergeFetcher = useFetcher<typeof action>();
  const [showMerge, setShowMerge] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);

  useActionFeedback(mergeFetcher, {
    onSuccess: (result) => {
      if (result.ok) navigate(`/recipes/${result.id}/edit`);
    },
    onError: (result) => {
      if (!result.ok) setMergeError(recipeFormErrorMessage(result, t, 'error.unexpected'));
    },
  });

  useEffect(() => {
    log.debug({}, 'RecipeComparePage mounted');
    return () => {
      log.debug({}, 'RecipeComparePage unmounted');
    };
  }, []);

  useEffect(() => {
    if (!showMerge) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowMerge(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showMerge]);

  /** Submits the merge of both current versions with the chosen per-field selections. */
  function handleMerge(selections: Record<string, 'v1' | 'v2'>) {
    if (mergeFetcher.state !== 'idle') return;
    setMergeError(null);
    mergeFetcher.submit(
      {
        recipeVersionId1: recipe1.currentVersion.id,
        recipeVersionId2: recipe2.currentVersion.id,
        title: `${recipe1.title} + ${recipe2.title}`,
        selections,
      },
      { method: 'post', encType: 'application/json', defaultShouldRevalidate: false },
    );
  }

  const v1 = recipe1.currentVersion;
  const v2 = recipe2.currentVersion;

  const mergeFields = [
    {
      key: 'brewMethod',
      labelKey: 'recipe.brewMethod',
      value1: v1.brewMethod,
      value2: v2.brewMethod,
    },
    { key: 'drinkType', labelKey: 'recipe.drinkType', value1: v1.drinkType, value2: v2.drinkType },
    { key: 'grindSize', labelKey: 'recipe.grindSize', value1: v1.grindSize, value2: v2.grindSize },
    {
      key: 'groundWeightGrams',
      labelKey: 'recipe.dose',
      value1: v1.groundWeightGrams,
      value2: v2.groundWeightGrams,
    },
    {
      key: 'extractionVolumeMl',
      labelKey: 'recipe.yield',
      value1: v1.extractionVolumeMl,
      value2: v2.extractionVolumeMl,
    },
    {
      key: 'extractionTimeSeconds',
      labelKey: 'recipe.time',
      value1: v1.extractionTimeSeconds,
      value2: v2.extractionTimeSeconds,
    },
    {
      key: 'temperatureCelsius',
      labelKey: 'recipe.temperature',
      value1: v1.temperatureCelsius,
      value2: v2.temperatureCelsius,
    },
    { key: 'grinder', labelKey: 'recipe.grinder', value1: v1.grinder, value2: v2.grinder },
  ];

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <SEOHead
        title={t('compare.seoTitle')
          .replace('{title1}', recipe1.title)
          .replace('{title2}', recipe2.title)}
        noIndex
      />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {t('recipe.compareTitle')}
        </h1>
        <button type="button" className="btn-primary" onClick={() => setShowMerge(true)}>
          {t('merge.button')}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 pb-2 text-sm font-semibold">
        <div style={{ color: 'var(--accent-primary)' }}>{recipe1.title}</div>
        <div />
        <div className="text-right" style={{ color: 'var(--accent-secondary)' }}>
          {recipe2.title}
        </div>
      </div>

      <div className="card">
        <CompareTable
          v1={v1}
          v2={v2}
          tasteNotes1={recipe1.tasteNotes.map((n) => n.name).join(', ') || null}
          tasteNotes2={recipe2.tasteNotes.map((n) => n.name).join(', ') || null}
          equipment1={recipe1.equipment.map((e) => e.name).join(', ') || null}
          equipment2={recipe2.equipment.map((e) => e.name).join(', ') || null}
        />
      </div>

      {showMerge && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowMerge(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <MergeSelector fields={mergeFields} onMerge={handleMerge} />
            {mergeError && (
              <p className="mt-2 text-sm" style={{ color: 'var(--error)' }}>
                {mergeError}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** The diff table of the two current versions' parameters, taste notes and equipment. */
function CompareTable({
  v1,
  v2,
  tasteNotes1,
  tasteNotes2,
  equipment1,
  equipment2,
}: {
  v1: RecipeDetailVersionOutput;
  v2: RecipeDetailVersionOutput;
  tasteNotes1: string | null;
  tasteNotes2: string | null;
  equipment1: string | null;
  equipment2: string | null;
}) {
  const { locale } = useTranslation();
  const grams = unitFormatter('g');
  const ml = unitFormatter('ml');
  const duration = (val: string | number | null) =>
    val != null ? formatDuration(Number(val), locale) : '-';
  const ratio = (val: string | number | null) =>
    val != null ? `1:${formatDecimal(Number(val), locale, 1)}` : '-';
  const celsius = unitFormatter('°C');
  return (
    <div>
      <DiffHighlighter
        labelKey="recipe.brewMethod"
        value1={v1.brewMethod}
        value2={v2.brewMethod}
        formatter={(val) => (val != null ? labelFor(String(val), BREW_METHODS) : '-')}
      />
      <DiffHighlighter
        labelKey="recipe.drinkType"
        value1={v1.drinkType}
        value2={v2.drinkType}
        formatter={(val) => (val != null ? labelFor(String(val), DRINK_TYPES) : '-')}
      />
      <DiffHighlighter labelKey="recipe.grindSize" value1={v1.grindSize} value2={v2.grindSize} />
      <DiffHighlighter
        labelKey="recipe.dose"
        value1={v1.groundWeightGrams}
        value2={v2.groundWeightGrams}
        formatter={grams}
      />
      <DiffHighlighter
        labelKey="recipe.yield"
        value1={v1.extractionVolumeMl}
        value2={v2.extractionVolumeMl}
        formatter={ml}
      />
      <DiffHighlighter
        labelKey="recipe.time"
        value1={v1.extractionTimeSeconds}
        value2={v2.extractionTimeSeconds}
        formatter={duration}
      />
      <DiffHighlighter
        labelKey="recipe.temperature"
        value1={v1.temperatureCelsius}
        value2={v2.temperatureCelsius}
        formatter={celsius}
      />
      <DiffHighlighter
        labelKey="recipe.ratio"
        value1={v1.brewRatio}
        value2={v2.brewRatio}
        formatter={ratio}
      />
      <DiffHighlighter
        labelKey="recipe.rating"
        value1={v1.rating}
        value2={v2.rating}
        formatter={(val) => (val != null ? `${val}/10` : '-')}
      />
      <DiffHighlighter labelKey="recipe.grinder" value1={v1.grinder} value2={v2.grinder} />
      <DiffHighlighter labelKey="recipe.tasteNotes" value1={tasteNotes1} value2={tasteNotes2} />
      <DiffHighlighter labelKey="equipment.title" value1={equipment1} value2={equipment2} />
    </div>
  );
}
