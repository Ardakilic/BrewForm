import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { collectionApi } from '../../api/index.ts';
import type { CollectionCreate } from '@brewform/shared/schemas';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { createLogger } from '../../utils/logger.ts';
import { PageContainer } from '../../components/ui/PageContainer.tsx';
import { Field } from '../../components/form/Field.tsx';

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
    <PageContainer width='2xl'>
      <h1 className='text-2xl font-bold mb-6' style={{ color: 'var(--text-primary)' }}>
        {t('collection.list.create')}
      </h1>
      <form onSubmit={handleSubmit} className='space-y-4'>
        <Field label={t('collection.create.name')} htmlFor='collection-name' required>
          <input
            id='collection-name'
            type='text'
            value={name}
            onChange={(e) => setName(e.target.value)}
            className='input w-full'
            required
          />
        </Field>
        <Field label={t('collection.create.description')} htmlFor='collection-description'>
          <textarea
            id='collection-description'
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className='input w-full'
            rows={3}
          />
        </Field>
        <Field label={t('collection.create.visibility')} htmlFor='collection-visibility'>
          <select
            id='collection-visibility'
            value={visibility}
            onChange={(e) => setVisibility(e.target.value)}
            className='input w-full'
          >
            <option value='draft'>{t('collection.visibility.draft')}</option>
            <option value='private'>{t('collection.visibility.private')}</option>
            <option value='unlisted'>{t('collection.visibility.unlisted')}</option>
            <option value='public'>{t('collection.visibility.public')}</option>
          </select>
        </Field>
        <button
          type='submit'
          disabled={submitting || !name.trim()}
          className='btn-primary'
        >
          {submitting ? t('collection.create.creating') : t('collection.create.submit')}
        </button>
      </form>
    </PageContainer>
  );
}
