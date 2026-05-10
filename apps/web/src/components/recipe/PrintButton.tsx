import { useTranslation } from '../../contexts/I18nContext';

export function PrintButton({ slug }: { slug: string }) {
  const { t } = useTranslation();
  return (
    <button
      type='button'
      onClick={() => globalThis.open(`/recipes/${slug}/print`, '_blank')}
      className='btn-secondary text-sm'
    >
      🖨️ {t('recipe.print')}
    </button>
  );
}

// Focus Mode navigates to the dedicated focus-mode page (/recipes/:slug/focus).
// The page shows only the brew parameters in a distraction-free layout.
export function FocusModeButton({ slug }: { slug: string }) {
  const { t } = useTranslation();
  return (
    <button
      type='button'
      onClick={() => globalThis.open(`/recipes/${slug}/focus`, '_blank')}
      className='btn-secondary text-sm'
    >
      📖 {t('recipe.focusMode')}
    </button>
  );
}
