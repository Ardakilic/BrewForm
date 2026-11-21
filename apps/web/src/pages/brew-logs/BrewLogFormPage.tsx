import { useEffect, useMemo } from 'react';
import { useFetcher, useLoaderData, useNavigate } from 'react-router';
import { BrewLogForm, type BrewLogFormValues } from '../../components/brew-log/BrewLogForm.tsx';
import { PageContainer } from '../../components/ui/PageContainer.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useActionFeedback } from '../../hooks/useActionFeedback.ts';
import { createLogger } from '../../utils/logger.ts';
import type { action, loader } from './BrewLogFormPage.data.ts';

const log = createLogger('BrewLogFormPage');

/**
 * Page component for `/brew-logs/new` (create) and `/brew-logs/:id/edit` (edit), rendered
 * from the route loader (`BrewLogFormPage.data.ts`). Create prefills dose/yield from the
 * recipe version; edit prefills from the fetched log. Saving submits the form values to the
 * route action through a fetcher (no revalidation, so the typed values survive a failure):
 * `{ ok: true }` navigates to `/brew-logs`, `{ ok: false }` shows an error toast.
 */
export function BrewLogFormPage() {
  const { mode, logId, editLog, recipe, recipeId, recipeVersionId } =
    useLoaderData<typeof loader>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const saveFetcher = useFetcher<typeof action>();

  useActionFeedback(saveFetcher, {
    errorKey: mode === 'edit' ? 'brewLog.error.updateFailed' : 'brewLog.error.createFailed',
    onSuccess: () => {
      log.debug({ mode, logId }, 'Brew log saved');
      navigate('/brew-logs');
    },
  });

  useEffect(() => {
    log.debug({ mode, logId }, 'BrewLogFormPage mounted');
    return () => {
      log.debug({ mode, logId }, 'BrewLogFormPage unmounted');
    };
  }, [mode, logId]);

  // Memoized so the form's initialValues-reset effect only fires when the
  // loaded data (edit log / recipe / version) actually changes.
  const initialValues = useMemo<BrewLogFormValues>(() => {
    if (mode === 'edit' && editLog) {
      return {
        brewedAt: editLog.brewedAt,
        yieldActual: editLog.yieldActual,
        doseActual: editLog.doseActual,
        notes: editLog.notes,
        personalRating: editLog.personalRating,
      };
    }
    // ponytail: extractionVolumeMl (ml) prefills yieldActual (g) — close enough for water-based brews
    const version = recipeVersionId
      ? recipe?.versions.find((v) => v.id === recipeVersionId)
      : recipe?.currentVersion;
    return {
      brewedAt: new Date().toISOString(),
      yieldActual: version?.extractionVolumeMl ?? null,
      doseActual: version?.groundWeightGrams ?? null,
      notes: null,
      personalRating: null,
    };
  }, [mode, editLog, recipe, recipeVersionId]);

  /**
   * Submits `values` to the route action and resolves once the submission settles, so the
   * form keeps its submitting state until then; the result is handled by `useActionFeedback`.
   */
  const handleSubmit = (values: BrewLogFormValues) =>
    saveFetcher.submit(
      {
        values: { ...values },
        ...(recipeId ? { recipeId } : {}),
        ...(recipeVersionId ? { recipeVersionId } : {}),
      },
      { method: 'post', encType: 'application/json', defaultShouldRevalidate: false },
    );

  return (
    <PageContainer width="2xl">
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
        {mode === 'edit' ? t('brewLog.form.titleEdit') : t('brewLog.form.titleCreate')}
      </h1>
      <BrewLogForm
        initialValues={initialValues}
        onSubmit={handleSubmit}
        submitLabel={
          mode === 'edit' ? t('brewLog.form.submitUpdate') : t('brewLog.form.submitCreate')
        }
      />
    </PageContainer>
  );
}
