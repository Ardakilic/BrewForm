import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { collectionApi } from '../../api/index.ts';
import type { CollectionCreate } from '@brewform/shared/schemas';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { createLogger } from '../../utils/logger.ts';

const log = createLogger('CollectionCreatePage');

/**
 * Page component for `/collections/new` — form to create a new collection.
 */
export function CollectionCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState('private');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    log.debug({}, 'CollectionCreatePage mounted');
    return () => {
      log.debug({}, 'CollectionCreatePage unmounted');
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const data: CollectionCreate = {
        name: name.trim(),
        visibility: visibility as 'private' | 'unlisted' | 'public' | 'draft',
      };
      if (description.trim()) data.description = description.trim();
      const created = await collectionApi.create(data);
      log.debug({ collectionId: created.id }, 'Collection created');
      navigate(`/collections/${created.id}`);
    } catch (err) {
      log.error({ err }, 'Failed to create collection');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className='container mx-auto px-4 py-8 max-w-2xl'>
      <h1 className='text-2xl font-bold mb-6' style={{ color: 'var(--text-primary)' }}>
        {t('collection.list.create')}
      </h1>
      <form onSubmit={handleSubmit} className='space-y-4'>
        <div>
          <label className='block text-sm mb-1' style={{ color: 'var(--text-secondary)' }}>
            {t('collection.create.name')}
          </label>
          <input
            type='text'
            value={name}
            onChange={(e) => setName(e.target.value)}
            className='input w-full'
            required
          />
        </div>
        <div>
          <label className='block text-sm mb-1' style={{ color: 'var(--text-secondary)' }}>
            {t('collection.create.description')}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className='input w-full'
            rows={3}
          />
        </div>
        <div>
          <label className='block text-sm mb-1' style={{ color: 'var(--text-secondary)' }}>
            {t('collection.create.visibility')}
          </label>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value)}
            className='input w-full'
          >
            <option value='private'>{t('collection.visibility.private')}</option>
            <option value='unlisted'>{t('collection.visibility.unlisted')}</option>
            <option value='public'>{t('collection.visibility.public')}</option>
          </select>
        </div>
        <button
          type='submit'
          disabled={submitting || !name.trim()}
          className='btn-primary min-h-11 px-6'
        >
          {submitting ? t('collection.create.creating') : t('collection.create.submit')}
        </button>
      </form>
    </div>
  );
}
