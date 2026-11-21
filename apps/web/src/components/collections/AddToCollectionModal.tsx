import type { CollectionListItemOutput } from '@brewform/shared/schemas';
import { useEffect, useState } from 'react';
import { useFetcher } from 'react-router';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useActionFeedback } from '../../hooks/useActionFeedback.ts';
import {
  MY_COLLECTIONS_PATH,
  type myCollectionsAction,
  type myCollectionsLoader,
  myCollectionsPath,
} from '../../routes/resources/collections.ts';
import { createLogger } from '../../utils/logger.ts';
import { Modal } from '../ui/Modal.tsx';
import { useToast } from '../ui/Toast.tsx';
import { CollectionVisibilityBadge } from './CollectionVisibilityBadge.tsx';

const log = createLogger('AddToCollectionModal');

/** Props for {@link AddToCollectionModal}. */
interface AddToCollectionModalProps {
  recipeId: string;
  open: boolean;
  onClose: () => void;
  /**
   * The current recipe's visibility. When it is `draft`, `private` or `unlisted`, the modal
   * explains that only the author sees the recipe in their collections until it is public.
   */
  recipeVisibility?: string;
}

/** Recipe visibilities that collections hide from everyone but the recipe's author. */
const HIDDEN_IN_COLLECTIONS: ReadonlySet<string> = new Set(['draft', 'private', 'unlisted']);

/** Maximum collection-name length, matching the shared `CollectionCreateSchema`. */
const MAX_COLLECTION_NAME_LENGTH = 255;

/** Load state of the collections list: in flight, shown, or failed. */
type LoadPhase = 'loading' | 'ready' | 'failed';

/**
 * Returns `collections` with the membership of `collectionId` set to `contains`, adjusting its
 * `recipeCount` by one when the membership actually changes.
 */
function withMembership(
  collections: CollectionListItemOutput[],
  collectionId: string,
  contains: boolean,
): CollectionListItemOutput[] {
  return collections.map((c) =>
    c.id === collectionId && (c.containsRecipe === true) !== contains
      ? {
          ...c,
          containsRecipe: contains,
          recipeCount: Math.max(0, c.recipeCount + (contains ? 1 : -1)),
        }
      : c,
  );
}

/** Props for {@link CollectionToggleRow}. */
interface CollectionToggleRowProps {
  collection: CollectionListItemOutput;
  recipeId: string;
  /** Sets the row's membership in the modal's list (optimistic flip, rollback or 409 keep). */
  onMembershipChange: (collectionId: string, contains: boolean) => void;
}

/**
 * One collection in {@link AddToCollectionModal}: a button showing the name, visibility badge,
 * recipe count and a checkmark when the collection already contains the recipe. Clicking it
 * flips the membership optimistically and submits an `add` or `remove` intent through the
 * row's own fetcher to the `resources/collections/mine` action (`defaultShouldRevalidate:
 * false`), so rows toggle independently and each row is disabled only while its own submission
 * is pending. A `{ ok: false }` result rolls the checkmark back and toasts
 * `collection.error.add` / `collection.error.remove`, except that a 409 `CONFLICT` on `add`
 * (the recipe is already in the collection) keeps the checkmark without a toast.
 */
function CollectionToggleRow({
  collection,
  recipeId,
  onMembershipChange,
}: CollectionToggleRowProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const fetcher = useFetcher<typeof myCollectionsAction>();
  const busy = fetcher.state !== 'idle';
  const contains = collection.containsRecipe === true;

  useActionFeedback(fetcher, {
    onSuccess: (result) => {
      log.debug(
        { collectionId: collection.id, recipeId, intent: result.intent },
        'AddToCollectionModal membership saved',
      );
    },
    onError: (result) => {
      if (result.ok) return;
      if (result.intent === 'add' && result.code === 'CONFLICT') {
        log.debug(
          { collectionId: collection.id, recipeId },
          'AddToCollectionModal recipe already in collection; membership kept',
        );
        onMembershipChange(collection.id, true);
        return;
      }
      log.debug(
        { collectionId: collection.id, recipeId, intent: result.intent, code: result.code },
        'AddToCollectionModal membership change failed; rolled back',
      );
      onMembershipChange(collection.id, result.intent === 'remove');
      toast.error(result.intent === 'remove' ? 'collection.error.remove' : 'collection.error.add');
    },
  });

  /** Flips the membership optimistically and submits the matching intent. */
  function toggle() {
    if (busy) return;
    const intent = contains ? 'remove' : 'add';
    log.debug({ collectionId: collection.id, recipeId, intent }, 'AddToCollectionModal toggle');
    onMembershipChange(collection.id, !contains);
    fetcher.submit(
      { intent, collectionId: collection.id, recipeId },
      { method: 'post', action: MY_COLLECTIONS_PATH, defaultShouldRevalidate: false },
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className="w-full flex items-center justify-between p-3 rounded border text-left hover:bg-black/5 disabled:opacity-50"
      style={{ borderColor: 'var(--border-primary)' }}
    >
      <div>
        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
          {collection.name}
        </span>
        <CollectionVisibilityBadge
          visibility={collection.visibility}
          className="ml-2 text-xs"
          style={{ color: 'var(--text-tertiary)' }}
        />
      </div>
      <span className="flex items-center gap-2">
        {contains && (
          <span
            role="img"
            aria-label={t('collection.modal.alreadyIn')}
            title={t('collection.modal.alreadyIn')}
            style={{ color: 'var(--text-primary)' }}
          >
            ✓
          </span>
        )}
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {collection.recipeCount}
        </span>
      </span>
    </button>
  );
}

/**
 * Modal for adding a recipe to the signed-in user's collections.
 *
 * Each time it opens it loads the collections with `useFetcher().load()` from the
 * `resources/collections/mine?recipeId=…` resource route (which forwards the recipe context, so
 * each row carries `containsRecipe` for the checkmark). A failed load shows
 * `collection.error.load` with a Retry button instead of an empty list. Rows toggle membership
 * through {@link CollectionToggleRow} (optimistic, rolled back with an error toast on failure;
 * a 409 on add keeps the membership). The inline "create new collection" form submits a
 * `create` intent (name + visibility, default `private`) that creates the collection and adds
 * the recipe; on success it clears the name and reloads the list, on failure it toasts
 * `collection.error.save` (or `collection.error.add` when only the add failed, reloading the
 * list so the new collection still shows) and keeps the typed name. No submission revalidates
 * the page's loaders, and the modal never imports the API client.
 *
 * When `recipeVisibility` is `draft`, `private` or `unlisted`, a note under the collection list
 * (`collection.modal.hiddenRecipeNote`) explains that the recipe stays hidden from other viewers
 * of the collection until it is made public: collection items follow the recipe listing rule
 * (`canListRecipe` on the API).
 */
export function AddToCollectionModal({
  recipeId,
  open,
  onClose,
  recipeVisibility,
}: AddToCollectionModalProps) {
  const { t } = useTranslation();
  const listFetcher = useFetcher<typeof myCollectionsLoader>();
  const createFetcher = useFetcher<typeof myCollectionsAction>();
  const { load } = listFetcher;
  const [collections, setCollections] = useState<CollectionListItemOutput[]>([]);
  const [phase, setPhase] = useState<LoadPhase>('loading');
  const [newName, setNewName] = useState('');
  const [newVisibility, setNewVisibility] = useState('private');
  const creating = createFetcher.state !== 'idle';

  useEffect(() => {
    log.debug({ recipeId }, 'AddToCollectionModal mounted');
    return () => {
      log.debug({ recipeId }, 'AddToCollectionModal unmounted');
    };
  }, [recipeId]);

  // (Re)load the list each time the modal opens, or when it opens for another recipe.
  useEffect(() => {
    if (!open) return;
    log.debug({ recipeId }, 'AddToCollectionModal opened');
    setPhase('loading');
    void load(myCollectionsPath(recipeId));
  }, [open, recipeId, load]);

  // Apply a finished load. Keyed on the fetcher only: reopening must not re-apply the previous
  // result while the new load runs. The resource loader already logs failures.
  useEffect(() => {
    if (listFetcher.state !== 'idle' || !listFetcher.data) return;
    const result = listFetcher.data;
    if (!result.ok) {
      log.debug({ code: result.code }, 'AddToCollectionModal load failed');
      setPhase('failed');
      return;
    }
    setCollections(result.collections);
    setPhase('ready');
  }, [listFetcher.state, listFetcher.data]);

  useActionFeedback(createFetcher, {
    errorKey: (result) =>
      !result.ok && result.collectionId ? 'collection.error.add' : 'collection.error.save',
    onSuccess: (result) => {
      log.debug({ collectionId: result.collectionId, recipeId }, 'AddToCollectionModal created');
      setNewName('');
      void load(myCollectionsPath(recipeId));
    },
    onError: (result) => {
      if (result.ok || !result.collectionId) return;
      // The collection exists without the recipe: reload so it is listed and can be toggled.
      void load(myCollectionsPath(recipeId));
    },
  });

  /** Sets one collection's membership in the list (used by the rows). */
  function setMembership(collectionId: string, contains: boolean) {
    setCollections((current) => withMembership(current, collectionId, contains));
  }

  /** Submits the `create` intent for the typed name and chosen visibility. */
  function handleCreate() {
    const name = newName.trim();
    if (!name || creating) return;
    log.debug({ recipeId }, 'AddToCollectionModal create submitted');
    createFetcher.submit(
      { intent: 'create', recipeId, name, visibility: newVisibility },
      { method: 'post', action: MY_COLLECTIONS_PATH, defaultShouldRevalidate: false },
    );
  }

  /** Re-requests the list after a failed load. */
  function retryLoad() {
    log.debug({ recipeId }, 'AddToCollectionModal retrying load');
    setPhase('loading');
    void load(myCollectionsPath(recipeId));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      ariaLabel={t('collection.modal.title')}
      panelClassName="max-w-md p-6 max-h-[80vh] overflow-y-auto"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
          {t('collection.modal.title')}
        </h2>
        <button type="button" onClick={onClose} className="text-xl" aria-label={t('common.close')}>
          ×
        </button>
      </div>

      {phase === 'loading' && (
        <p style={{ color: 'var(--text-secondary)' }}>{t('common.loading')}</p>
      )}
      {phase === 'failed' && (
        <div className="flex items-center justify-between gap-2 mb-4">
          <p role="alert" className="text-sm" style={{ color: 'var(--error)' }}>
            {t('collection.error.load')}
          </p>
          <button type="button" onClick={retryLoad} className="btn-secondary text-sm min-h-11 px-4">
            {t('common.retry')}
          </button>
        </div>
      )}
      {phase === 'ready' && (
        <div className="space-y-2 mb-4">
          {collections.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {t('collection.modal.selectCollection')}
            </p>
          ) : (
            collections.map((col) => (
              <CollectionToggleRow
                key={col.id}
                collection={col}
                recipeId={recipeId}
                onMembershipChange={setMembership}
              />
            ))
          )}
        </div>
      )}

      {recipeVisibility && HIDDEN_IN_COLLECTIONS.has(recipeVisibility) && (
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          {t('collection.modal.hiddenRecipeNote')}
        </p>
      )}

      <div className="border-t pt-4" style={{ borderColor: 'var(--border-primary)' }}>
        <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          {t('collection.modal.createNew')}
        </h3>
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t('collection.create.name')}
          maxLength={MAX_COLLECTION_NAME_LENGTH}
          className="input text-sm w-full mb-2"
        />
        <select
          value={newVisibility}
          onChange={(e) => setNewVisibility(e.target.value)}
          className="input text-sm w-full mb-2"
        >
          <option value="private">{t('collection.visibility.private')}</option>
          <option value="unlisted">{t('collection.visibility.unlisted')}</option>
          <option value="public">{t('collection.visibility.public')}</option>
        </select>
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating || !newName.trim()}
          className="btn-primary text-sm w-full min-h-11"
        >
          {creating ? t('collection.create.creating') : t('collection.create.submit')}
        </button>
      </div>
    </Modal>
  );
}
