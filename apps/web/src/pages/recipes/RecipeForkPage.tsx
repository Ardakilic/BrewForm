import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { recipeApi } from '../../api/index.ts';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { Field } from '../../components/form/Field.tsx';
import { ErrorState } from '../../components/ui/ErrorState.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { createLogger } from '@/utils/logger.ts';

const log = createLogger('RecipeForkPage');

/**
 * Allows a user to fork an existing recipe. Loads the source recipe details,
 * displays a pre-filled fork title, and navigates to the editor on success.
 */
export function RecipeForkPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [forking, setForking] = useState(false);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [sourceTitle, setSourceTitle] = useState('');

  useEffect(() => {
    log.debug({ id }, 'RecipeForkPage mounted');
    return () => {
      log.debug({ id }, 'RecipeForkPage unmounted');
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    log.debug({ id }, 'loadSourceRecipe started');
    recipeApi.get(id).then((recipe) => {
      setSourceTitle(recipe.title);
      setTitle(t('recipe.fork.ofTitle').replace('{title}', recipe.title));
      log.debug({ id, sourceTitle: recipe.title }, 'loadSourceRecipe completed');
    }).catch((err) => {
      log.error({ err, id }, 'loadSourceRecipe failed');
      setError(t('recipe.fork.loadError'));
    }).finally(() => setLoading(false));
  }, [id, t]);

  /** Creates a fork of the source recipe with the current title. On success navigates to the new recipe's edit page; on failure displays the error. */
  async function handleFork() {
    if (!id) return;
    setForking(true);
    setError('');
    log.debug({ id, title }, 'handleFork started');
    try {
      const result = await recipeApi.fork(id, title.trim() || undefined);
      log.debug({ id, newId: result.id }, 'handleFork completed');
      navigate(`/recipes/${result.id}/edit`);
    } catch (err) {
      log.error({ err, id }, 'handleFork failed');
      const message = err instanceof Error ? err.message : t('recipe.fork.forkError');
      setError(message);
    } finally {
      setForking(false);
    }
  }

  if (loading) {
    return (
      <div
        className='mx-auto max-w-2xl px-6 py-12 text-center'
        style={{ color: 'var(--text-secondary)' }}
      >
        {t('common.loading')}
      </div>
    );
  }

  return (
    <div className='mx-auto max-w-2xl px-6 py-8'>
      <SEOHead title={t('recipe.fork.seoTitle').replace('{title}', sourceTitle)} noIndex />
      <h1 className='text-2xl font-bold mb-6'>{t('recipe.fork')}</h1>

      {error && <ErrorState message={error} className='mb-4' />}

      <div className='card'>
        <p className='text-sm mb-4' style={{ color: 'var(--text-secondary)' }}>
          {t('recipe.fork.forking')} <strong>{sourceTitle}</strong>
        </p>
        <Field label={t('recipe.fork.title')}>
          <input
            type='text'
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            className='input-field mb-4'
          />
        </Field>
        <div className='flex gap-3'>
          <button type='button' onClick={handleFork} disabled={forking} className='btn-primary'>
            {forking ? t('recipe.fork.creating') : t('recipe.fork.create')}
          </button>
          <button type='button' onClick={() => navigate(-1)} className='btn-secondary'>
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
