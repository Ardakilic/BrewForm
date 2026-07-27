import { useEffect, useState } from 'react';
import { useLoaderData, useNavigate } from 'react-router';
import { ApiError, collectionApi } from '../../api/index.ts';
import type { CollectionDetailOutput, CollectionUpdate } from '@brewform/shared/schemas';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { createLogger } from '../../utils/logger.ts';
import { PageContainer } from '../../components/ui/PageContainer.tsx';
import { Field } from '../../components/form/Field.tsx';

const log = createLogger('CollectionEditPage');

/** Loader payload for {@link CollectionEditPage}. */
export interface CollectionEditLoaderData {
  collection: CollectionDetailOutput;
}

/**
 * React Router data loader for `/collections/:id/edit` — fetches the collection.
 * A 404 is mapped to `throw new Response('Not Found', { status: 404 })`.
 */
export const loader = async (
  { params }: { params: Record<string, string | undefined> },
): Promise<CollectionEditLoaderData> => {
  const id = params.id;
  if (!id) throw new Response('Not Found', { status: 404 });
  log.debug({ collectionId: id }, 'CollectionEditPage loader started');
  let collection: CollectionDetailOutput;
  try {
    collection = await collectionApi.get(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      throw new Response('Not Found', { status: 404 });
    }
    log.error({ err, collectionId: id }, 'CollectionEditPage loader failed');
    throw err;
  }
  log.debug({ collectionId: id }, 'CollectionEditPage loader completed');
  return { collection };
};

/**
 * Page component for `/collections/:id/edit` — form to edit a collection.
 */
export function CollectionEditPage() {
  const { collection } = useLoaderData() as CollectionEditLoaderData;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [name, setName] = useState(collection.name);
  const [description, setDescription] = useState(collection.description ?? '');
  const [visibility, setVisibility] = useState(collection.visibility);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    log.debug({ collectionId: collection.id }, 'CollectionEditPage mounted');
    return () => {
      log.debug({ collectionId: collection.id }, 'CollectionEditPage unmounted');
    };
  }, [collection.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const data: CollectionUpdate = {
        name: name.trim(),
        visibility: visibility as 'private' | 'unlisted' | 'public' | 'draft',
      };
      if (description.trim() !== (collection.description ?? '')) {
        data.description = description.trim();
      }
      await collectionApi.update(collection.id, data);
      log.debug({ collectionId: collection.id }, 'Collection updated');
      navigate(`/collections/${collection.id}`);
    } catch (err) {
      log.error({ err, collectionId: collection.id }, 'Failed to update collection');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageContainer width='2xl'>
      <h1 className='text-2xl font-bold mb-6' style={{ color: 'var(--text-primary)' }}>
        {t('collection.detail.edit')}
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
            onChange={(e) =>
              setVisibility(e.target.value as 'private' | 'unlisted' | 'public' | 'draft')}
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
