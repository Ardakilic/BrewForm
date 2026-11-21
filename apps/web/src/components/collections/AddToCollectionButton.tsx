import { useState } from 'react';
import { useRevalidator } from 'react-router';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { createLogger } from '../../utils/logger.ts';
import { AddToCollectionModal } from './AddToCollectionModal.tsx';

const log = createLogger('AddToCollectionButton');

/** Props for {@link AddToCollectionButton}. */
interface AddToCollectionButtonProps {
  recipeId: string;
  /** The recipe's visibility, passed to the modal for its hidden-recipe note. */
  recipeVisibility?: string;
}

/**
 * Button that opens the "Add to Collection" modal. Gated on authentication
 * by the parent (only rendered when `isAuthenticated` is true). Forwards
 * `recipeVisibility` so the modal can explain that a `draft`, `private` or
 * `unlisted` recipe stays hidden from other viewers of the collection. When the modal closes
 * after a confirmed membership change it revalidates the page once (from the close handler, not
 * an effect), so the recipe page's "In collections" card is current.
 */
export function AddToCollectionButton({ recipeId, recipeVisibility }: AddToCollectionButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const revalidator = useRevalidator();

  /** Closes the modal and refreshes the page's loaders once when a membership changed. */
  function handleClose(changed: boolean) {
    setOpen(false);
    if (changed) {
      log.debug({ recipeId }, 'AddToCollectionButton revalidating after collection changes');
      void revalidator.revalidate();
    }
  }

  log.debug({ recipeId }, 'AddToCollectionButton rendered');

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-secondary text-sm min-h-11 px-3"
        aria-label={t('collection.modal.add')}
      >
        {t('collection.modal.add')}
      </button>
      <AddToCollectionModal
        recipeId={recipeId}
        recipeVisibility={recipeVisibility}
        open={open}
        onClose={handleClose}
      />
    </>
  );
}
