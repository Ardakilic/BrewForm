import { useState } from 'react';
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
 * `unlisted` recipe stays hidden from other viewers of the collection.
 */
export function AddToCollectionButton({ recipeId, recipeVisibility }: AddToCollectionButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

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
        onClose={() => setOpen(false)}
      />
    </>
  );
}
