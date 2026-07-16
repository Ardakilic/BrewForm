import { useEffect, useState } from 'react';
import { ApiError, collectionApi } from '../../api/index.ts';
import type { CollectionListItemOutput } from '@brewform/shared/schemas';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { createLogger } from '../../utils/logger.ts';

const log = createLogger('AddToCollectionModal');

/** Props for {@link AddToCollectionModal}. */
interface AddToCollectionModalProps {
  recipeId: string;
  open: boolean;
  onClose: () => void;
}

/**
 * Modal for adding a recipe to collections. Lists the user's collections with
 * a checkmark for those already containing the recipe (via the `containsRecipe`
 * flag returned when listing with a `recipeId` context), toggles membership on
 * click (add vs. remove based on `containsRecipe`, with a 409→remove fallback
 * for stale state), and supports inline creation of a new collection.
 */
export function AddToCollectionModal({ recipeId, open, onClose }: AddToCollectionModalProps) {
  const { t } = useTranslation();
  const [collections, setCollections] = useState<CollectionListItemOutput[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggleLoading, setToggleLoading] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newVisibility, setNewVisibility] = useState('private');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    log.debug({ recipeId }, 'AddToCollectionModal opened');
    setLoading(true);
    collectionApi.list({ recipeId })
      .then((res) => setCollections(res.data))
      .catch((err) => log.error({ err }, 'Failed to load collections'))
      .finally(() => setLoading(false));
  }, [open, recipeId]);

  if (!open) return null;

  /** Flip membership state locally for one collection (avoids a refetch). */
  const applyMembership = (collectionId: string, contains: boolean) => {
    setCollections((prev) =>
      prev.map((c) =>
        c.id === collectionId
          ? {
            ...c,
            containsRecipe: contains,
            recipeCount: Math.max(0, c.recipeCount + (contains ? 1 : -1)),
          }
          : c
      )
    );
  };

  const handleToggle = async (collection: CollectionListItemOutput) => {
    setToggleLoading(collection.id);
    try {
      if (collection.containsRecipe) {
        await collectionApi.removeRecipe(collection.id, recipeId);
        log.debug({ collectionId: collection.id, recipeId }, 'Recipe removed from collection');
        applyMembership(collection.id, false);
        return;
      }
      await collectionApi.addRecipe(collection.id, recipeId);
      log.debug({ collectionId: collection.id, recipeId }, 'Recipe added to collection');
      applyMembership(collection.id, true);
    } catch (err) {
      if (
        !collection.containsRecipe &&
        err instanceof ApiError &&
        (err.code === 'CONFLICT' || err.status === 409)
      ) {
        // Fallback for stale state: the server says the recipe is already in
        // the collection, so interpret the toggle as a removal instead.
        try {
          await collectionApi.removeRecipe(collection.id, recipeId);
          log.debug(
            { collectionId: collection.id, recipeId },
            'Recipe removed from collection',
          );
          applyMembership(collection.id, false);
        } catch (removeErr) {
          log.error({ err: removeErr }, 'Failed to toggle recipe in collection');
        }
      } else {
        log.error({ err }, 'Failed to toggle recipe in collection');
      }
    } finally {
      setToggleLoading(null);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    let createdId: string | null = null;
    try {
      const created = await collectionApi.create({
        name: newName.trim(),
        visibility: newVisibility as 'private' | 'unlisted' | 'public' | 'draft',
      });
      createdId = created.id;
      await collectionApi.addRecipe(created.id, recipeId);
      const res = await collectionApi.list({ recipeId });
      setCollections(res.data);
      setNewName('');
      log.debug({ collectionId: created.id }, 'New collection created with recipe');
    } catch (err) {
      if (createdId) {
        // Create succeeded but addRecipe failed — collection exists without the recipe
        log.error(
          { err, collectionId: createdId, recipeId },
          'Collection created but recipe add failed',
        );
      } else {
        log.error({ err }, 'Failed to create collection');
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'
      onClick={onClose}
    >
      <div
        className='card max-w-md w-full mx-4 p-6 max-h-[80vh] overflow-y-auto'
        onClick={(e) => e.stopPropagation()}
      >
        <div className='flex items-center justify-between mb-4'>
          <h2 className='text-lg font-bold' style={{ color: 'var(--text-primary)' }}>
            {t('collection.modal.title')}
          </h2>
          <button
            type='button'
            onClick={onClose}
            className='text-xl'
            aria-label={t('common.close')}
          >
            ×
          </button>
        </div>

        {loading
          ? <p style={{ color: 'var(--text-secondary)' }}>{t('common.loading')}</p>
          : (
            <div className='space-y-2 mb-4'>
              {collections.length === 0
                ? (
                  <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>
                    {t('collection.modal.selectCollection')}
                  </p>
                )
                : (
                  collections.map((col) => (
                    <button
                      key={col.id}
                      type='button'
                      onClick={() => handleToggle(col)}
                      disabled={toggleLoading === col.id}
                      className='w-full flex items-center justify-between p-3 rounded border text-left hover:bg-black/5 disabled:opacity-50'
                      style={{ borderColor: 'var(--border-primary)' }}
                    >
                      <div>
                        <span className='font-medium' style={{ color: 'var(--text-primary)' }}>
                          {col.name}
                        </span>
                        <span className='ml-2 text-xs' style={{ color: 'var(--text-tertiary)' }}>
                          {col.visibility === 'public'
                            ? '🌐'
                            : col.visibility === 'unlisted'
                            ? '🔗'
                            : '🔒'}
                        </span>
                      </div>
                      <span className='flex items-center gap-2'>
                        {col.containsRecipe === true && (
                          <span
                            aria-label={t('collection.modal.alreadyIn')}
                            title={t('collection.modal.alreadyIn')}
                            style={{ color: 'var(--text-primary)' }}
                          >
                            ✓
                          </span>
                        )}
                        <span className='text-xs' style={{ color: 'var(--text-tertiary)' }}>
                          {col.recipeCount}
                        </span>
                      </span>
                    </button>
                  ))
                )}
            </div>
          )}

        <div className='border-t pt-4' style={{ borderColor: 'var(--border-primary)' }}>
          <h3 className='text-sm font-semibold mb-2' style={{ color: 'var(--text-primary)' }}>
            {t('collection.modal.createNew')}
          </h3>
          <input
            type='text'
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('collection.create.name')}
            className='input text-sm w-full mb-2'
          />
          <select
            value={newVisibility}
            onChange={(e) => setNewVisibility(e.target.value)}
            className='input text-sm w-full mb-2'
          >
            <option value='private'>{t('collection.visibility.private')}</option>
            <option value='unlisted'>{t('collection.visibility.unlisted')}</option>
            <option value='public'>{t('collection.visibility.public')}</option>
          </select>
          <button
            type='button'
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className='btn-primary text-sm w-full min-h-11'
          >
            {creating ? t('collection.create.creating') : t('collection.create.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
