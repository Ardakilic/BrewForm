import type { RecipeDetailOutput } from '@brewform/shared/schemas';
import { useEffect, useState } from 'react';
import { useFetcher, useLoaderData, useNavigate } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { Field } from '../../components/form/Field.tsx';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { ErrorState } from '../../components/ui/ErrorState.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useActionFeedback } from '../../hooks/useActionFeedback.ts';
import type { action, loader } from './RecipeForkPage.data.ts';
import { recipeFormErrorMessage } from './recipe-form-errors.ts';

const log = createLogger('RecipeForkPage');

/**
 * `/recipes/:id/fork`: lets a user fork an existing recipe. The source recipe comes from the
 * route loader (`RecipeForkPage.data.ts`; a failed load renders the route error state). The
 * form is keyed by recipe id so another source re-seeds the pre-filled title.
 */
export function RecipeForkPage() {
  const { recipe } = useLoaderData<typeof loader>();

  useEffect(() => {
    log.debug({ id: recipe.id }, 'RecipeForkPage mounted');
    return () => {
      log.debug({ id: recipe.id }, 'RecipeForkPage unmounted');
    };
  }, [recipe.id]);

  return <RecipeForkForm key={recipe.id} recipe={recipe} />;
}

/**
 * The fork form: a title pre-filled with "Fork of <source title>". Submitting posts `title`
 * to the `/recipes/:id/fork` route action; `{ ok: true, id }` opens the fork's editor and
 * `{ ok: false }` shows the error above the form.
 */
function RecipeForkForm({ recipe }: { recipe: RecipeDetailOutput }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const fetcher = useFetcher<typeof action>();
  const forking = fetcher.state !== 'idle';
  const [error, setError] = useState('');
  const [title, setTitle] = useState(() =>
    t('recipe.fork.ofTitle').replace('{title}', recipe.title),
  );

  useActionFeedback(fetcher, {
    onSuccess: (result) => {
      if (result.ok) navigate(`/recipes/${result.id}/edit`);
    },
    onError: (result) => {
      if (!result.ok) setError(recipeFormErrorMessage(result, t, 'recipe.fork.forkError'));
    },
  });

  /** Submits the current title to the fork action (the result is handled above). */
  function handleFork() {
    if (forking) return;
    setError('');
    fetcher.submit({ title }, { method: 'post', defaultShouldRevalidate: false });
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <SEOHead title={t('recipe.fork.seoTitle').replace('{title}', recipe.title)} noIndex />
      <h1 className="text-2xl font-bold mb-6">{t('recipe.fork')}</h1>

      {error && <ErrorState message={error} className="mb-4" />}

      <div className="card">
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          {t('recipe.fork.forking')} <strong>{recipe.title}</strong>
        </p>
        <Field label={t('recipe.fork.title')}>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            className="input-field mb-4"
          />
        </Field>
        <div className="flex gap-3">
          <button type="button" onClick={handleFork} disabled={forking} className="btn-primary">
            {forking ? t('recipe.fork.creating') : t('recipe.fork.create')}
          </button>
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary">
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
