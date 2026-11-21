import type { CollectionCreate } from '@brewform/shared/schemas';
import { useEffect, useState } from 'react';
import { useActionData, useNavigation, useSubmit } from 'react-router';
import { Field } from '../../components/form/Field.tsx';
import { ErrorState } from '../../components/ui/ErrorState.tsx';
import { PageContainer } from '../../components/ui/PageContainer.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { failureToError } from '../../routes/action-result.ts';
import { getApiErrorMessage } from '../../utils/apiErrorMessage.ts';
import { createLogger } from '../../utils/logger.ts';
import type { action } from './CollectionCreatePage.data.ts';

const log = createLogger('CollectionCreatePage');

/** The collection visibilities the form offers. */
type CollectionVisibility = 'private' | 'unlisted' | 'public' | 'draft';

/**
 * Page component for `/collections/new` — form to create a new collection. The form submits a
 * JSON `CollectionCreate` (with `description` only when set) to the `/collections/new` route
 * action (`CollectionCreatePage.data.ts`), which redirects to the new collection on success
 * or returns `{ ok: false }`, shown inline with the typed values kept.
 */
export function CollectionCreatePage() {
  const { t } = useTranslation();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<CollectionVisibility>('private');
  const submitting = navigation.state === 'submitting';
  const failure = actionData && 'ok' in actionData && !actionData.ok ? actionData : null;
  const error = failure
    ? getApiErrorMessage(failureToError(failure), t, 'collection.error.save')
    : '';

  useEffect(() => {
    log.debug({}, 'CollectionCreatePage mounted');
    return () => {
      log.debug({}, 'CollectionCreatePage unmounted');
    };
  }, []);

  /** Builds the create payload (description only when set) and submits it to the action. */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    const data: CollectionCreate = { name: name.trim(), visibility };
    if (description.trim()) data.description = description.trim();
    submit(data, { method: 'post', encType: 'application/json' });
  };

  return (
    <PageContainer width="2xl">
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
        {t('collection.list.create')}
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
