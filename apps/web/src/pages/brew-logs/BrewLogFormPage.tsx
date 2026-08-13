import { useEffect } from 'react';
import { redirect, useLoaderData, useNavigate } from 'react-router';
import { brewLogApi, recipeApi } from '../../api/index.ts';
import type {
  BrewLogCreate,
  BrewLogOutput,
  BrewLogUpdate,
  RecipeDetailOutput,
} from '@brewform/shared/schemas';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { createLogger } from '../../utils/logger.ts';
import { useToast } from '../../components/ui/Toast.tsx';
import { PageContainer } from '../../components/ui/PageContainer.tsx';
import { BrewLogForm, type BrewLogFormValues } from '../../components/brew-log/BrewLogForm.tsx';

const log = createLogger('BrewLogFormPage');

/** Loader payload for {@link BrewLogFormPage} — serves both create and edit routes. */
export interface BrewLogFormLoaderData {
  mode: 'create' | 'edit';
  logId?: string;
  editLog?: BrewLogOutput;
  recipe?: RecipeDetailOutput;
  recipeId?: string;
  recipeVersionId?: string;
}

/**
 * React Router data loader for `/brew-logs/new` and `/brew-logs/:id/edit`.
 * Create mode requires `?recipeId` (redirects to `/brew-logs` without it) and
 * fetches the recipe to prefill dose/yield from the version. Edit mode fetches
 * the existing log (the API rejects non-owners with 404) and redirects to
 * `/brew-logs` when it is missing.
 */
export const loader = async (
  { params, request }: { params: Record<string, string | undefined>; request: Request },
): Promise<BrewLogFormLoaderData> => {
  if (params.id) {
    log.debug({ logId: params.id }, 'BrewLogFormPage edit loader started');
    try {
      const editLog = await brewLogApi.get(params.id);
      log.debug({ logId: params.id }, 'BrewLogFormPage edit loader completed');
      return { mode: 'edit', logId: params.id, editLog };
    } catch (err) {
      log.error({ err, logId: params.id }, 'BrewLogFormPage edit loader failed');
      throw redirect('/brew-logs');
    }
  }
  const url = new URL(request.url);
  const recipeId = url.searchParams.get('recipeId');
  if (!recipeId) {
    log.debug({}, 'BrewLogFormPage create loader missing recipeId, redirecting');
    throw redirect('/brew-logs');
  }
  const recipeVersionId = url.searchParams.get('recipeVersionId') ?? undefined;
  log.debug({ recipeId, recipeVersionId }, 'BrewLogFormPage create loader started');
  try {
    const recipe = await recipeApi.get(recipeId);
    log.debug({ recipeId }, 'BrewLogFormPage create loader completed');
    return { mode: 'create', recipe, recipeId, recipeVersionId };
  } catch (err) {
    log.error({ err, recipeId }, 'BrewLogFormPage create loader failed');
    throw err;
  }
};

/**
 * Page component for `/brew-logs/new` (create) and `/brew-logs/:id/edit`
 * (edit). Create prefills dose/yield from the recipe version; edit prefills
 * from the fetched log.
 */
export function BrewLogFormPage() {
  const { mode, logId, editLog, recipe, recipeId, recipeVersionId } =
    useLoaderData() as BrewLogFormLoaderData;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    log.debug({ mode, logId }, 'BrewLogFormPage mounted');
    return () => {
      log.debug({ mode, logId }, 'BrewLogFormPage unmounted');
    };
  }, [mode, logId]);

  let initialValues: BrewLogFormValues;
  if (mode === 'edit' && editLog) {
    initialValues = {
      brewedAt: editLog.brewedAt,
      yieldActual: editLog.yieldActual,
      doseActual: editLog.doseActual,
      notes: editLog.notes,
      personalRating: editLog.personalRating,
    };
  } else {
    // ponytail: extractionVolumeMl (ml) prefills yieldActual (g) — close enough for water-based brews
    const version = recipeVersionId
      ? recipe?.versions.find((v) => v.id === recipeVersionId)
      : recipe?.currentVersion;
    initialValues = {
      brewedAt: new Date().toISOString(),
      yieldActual: version?.extractionVolumeMl ?? null,
      doseActual: version?.groundWeightGrams ?? null,
      notes: null,
      personalRating: null,
    };
  }

  const handleSubmit = async (values: BrewLogFormValues) => {
    try {
      if (mode === 'edit' && logId) {
        const data: BrewLogUpdate = {
          brewedAt: values.brewedAt,
          yieldActual: values.yieldActual,
          doseActual: values.doseActual,
          notes: values.notes,
          personalRating: values.personalRating,
        };
        await brewLogApi.update(logId, data);
        log.debug({ logId }, 'Brew log updated');
      } else {
        const data: BrewLogCreate = {
          recipeId: recipeId!,
          recipeVersionId,
          brewedAt: values.brewedAt,
          yieldActual: values.yieldActual ?? undefined,
          doseActual: values.doseActual ?? undefined,
          notes: values.notes ?? undefined,
          personalRating: values.personalRating ?? undefined,
        };
        await brewLogApi.create(data);
        log.debug({ recipeId }, 'Brew log created');
      }
      navigate('/brew-logs');
    } catch (err) {
      log.error({ err, mode, logId }, 'Failed to save brew log');
      toast.error(mode === 'edit' ? 'brewLog.error.updateFailed' : 'brewLog.error.createFailed');
    }
  };

  return (
    <PageContainer width='2xl'>
      <h1 className='text-2xl font-bold mb-6' style={{ color: 'var(--text-primary)' }}>
        {mode === 'edit' ? t('brewLog.form.titleEdit') : t('brewLog.form.titleCreate')}
      </h1>
      <BrewLogForm
        initialValues={initialValues}
        onSubmit={handleSubmit}
        submitLabel={mode === 'edit'
          ? t('brewLog.form.submitUpdate')
          : t('brewLog.form.submitCreate')}
      />
    </PageContainer>
  );
}
