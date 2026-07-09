import { useState } from 'react';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { AddToCollectionModal } from './AddToCollectionModal.tsx';
import { createLogger } from '../../utils/logger.ts';

const log = createLogger('AddToCollectionButton');

/** Props for {@link AddToCollectionButton}. */
interface AddToCollectionButtonProps {
  recipeId: string;
}

/**
 * Button that opens the "Add to Collection" modal. Gated on authentication
 * by the parent (only rendered when `isAuthenticated` is true).
 */
export function AddToCollectionButton({ recipeId }: AddToCollectionButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  log.debug({ recipeId }, 'AddToCollectionButton rendered');

  return (
    <>
      <button
        type='button'
        onClick={() => setOpen(true)}
        className='btn-secondary text-sm min-h-11 px-3'
        aria-label={t('collection.modal.add')}
      >
        {t('collection.modal.add')}
      </button>
      <AddToCollectionModal recipeId={recipeId} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
