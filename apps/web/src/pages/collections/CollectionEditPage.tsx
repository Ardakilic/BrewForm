import type { CollectionUpdate } from '@brewform/shared/schemas';
import { useEffect, useState } from 'react';
import { useActionData, useLoaderData, useNavigation, useSubmit } from 'react-router';
import { Field } from '../../components/form/Field.tsx';
import { ErrorState } from '../../components/ui/ErrorState.tsx';
import { PageContainer } from '../../components/ui/PageContainer.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { failureToError } from '../../routes/action-result.ts';
import { getApiErrorMessage } from '../../utils/apiErrorMessage.ts';
import { createLogger } from '../../utils/logger.ts';
import type { action, loader } from './CollectionEditPage.data.ts';

const log = createLogger('CollectionEditPage');

/** The collection visibilities the form offers, in display order. */
type CollectionVisibility = 'private' | 'unlisted' | 'public' | 'draft';

/**
 * Page component for `/collections/:id/edit` — form to edit a collection. The collection
 * comes from the route loader (`CollectionEditPage.data.ts`); the form submits a JSON
 * `CollectionUpdate` (with `description` only when it changed) to the route action, which
 * redirects to the collection on success or returns `{ ok: false }`, shown inline.
 */
export function CollectionEditPage() {
  const { collection } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const { t } = useTranslation();
  const [name, setName] = useState(collection.name);
  const [description, setDescription] = useState(collection.description ?? '');
  const [visibility, setVisibility] = useState(collection.visibility);
  const submitting = navigation.state === 'submitting';
  const failure = actionData && 'ok' in actionData && !actionData.ok ? actionData : null;
  const error = failure
    ? getApiErrorMessage(failureToError(failure), t, 'collection.error.save')
    : '';

  useEffect(() => {
    log.debug({ collectionId: collection.id }, 'CollectionEditPage mounted');
    return () => {
      log.debug({ collectionId: collection.id }, 'CollectionEditPage unmounted');
    };
  }, [collection.id]);

  /** Builds the update payload (description only when changed) and submits it to the action. */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    const data: CollectionUpdate = {
      name: name.trim(),
      visibility: visibility as CollectionVisibility,
    };
    if (description.trim() !== (collection.description ?? '')) {
      data.description = description.trim();
    }
    submit(data, { method: 'post', encType: 'application/json' });
  };

  return (
    <PageContainer width="2xl">
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
        {t('collection.detail.edit')}
      </h1>
      {error && <ErrorState message={error} className="mb-4" />}
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label={t('collection.create.name')} htmlFor="collection-name" required>
          <input
            id="collection-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input w-full"
            required
          />
        </Field>
        <Field label={t('collection.create.description')} htmlFor="collection-description">
          <textarea
            id="collection-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input w-full"
            rows={3}
          />
        </Field>
        <Field label={t('collection.create.visibility')} htmlFor="collection-visibility">
          <select
            id="collection-visibility"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as CollectionVisibility)}
            className="input w-full"
          >
            <option value="draft">{t('collection.visibility.draft')}</option>
            <option value="private">{t('collection.visibility.private')}</option>
            <option value="unlisted">{t('collection.visibility.unlisted')}</option>
            <option value="public">{t('collection.visibility.public')}</option>
          </select>
        </Field>
        <button type="submit" disabled={submitting || !name.trim()} className="btn-primary">
          {submitting ? t('collection.create.creating') : t('collection.create.submit')}
        </button>
      </form>
    </PageContainer>
  );
}
