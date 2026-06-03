import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { recipeApi } from '../../api/index.ts';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';

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
    if (!id) return;
    recipeApi.get(id).then((recipe) => {
      setSourceTitle(recipe.title);
      setTitle(`Fork of ${recipe.title}`);
    }).catch(() => {
      setError('Failed to load recipe');
    }).finally(() => setLoading(false));
  }, [id]);

  async function handleFork() {
    if (!id) return;
    setForking(true);
    setError('');
    try {
      const result = await recipeApi.fork(id, title.trim() || undefined);
      navigate(`/recipes/${result.id}/edit`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fork recipe';
      setError(message);
    } finally {
      setForking(false);
    }
  }

  if (loading) {
    return <div className='mx-auto max-w-2xl px-6 py-12 text-center'>Loading...</div>;
  }

  return (
    <div className='mx-auto max-w-2xl px-6 py-8'>
      <SEOHead title={`Fork: ${sourceTitle}`} noIndex />
      <h1 className='text-2xl font-bold mb-6'>{t('recipe.fork')}</h1>

      {error && (
        <div
          className='mb-4 rounded p-3 text-sm'
          style={{ backgroundColor: 'var(--error)', color: 'white' }}
        >
          {error}
        </div>
      )}

      <div className='card'>
        <p className='text-sm mb-4' style={{ color: 'var(--text-secondary)' }}>
          Forking: <strong>{sourceTitle}</strong>
        </p>
        <label htmlFor='fork-title' className='block text-sm font-medium mb-1'>Fork Title</label>
        <input
          id='fork-title'
          type='text'
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          className='input-field mb-4'
        />
        <div className='flex gap-3'>
          <button type='button' onClick={handleFork} disabled={forking} className='btn-primary'>
            {forking ? 'Creating Fork...' : 'Create Fork'}
          </button>
          <button type='button' onClick={() => navigate(-1)} className='btn-secondary'>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
