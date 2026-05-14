import { Link } from 'react-router';
import { useTranslation } from '../../contexts/I18nContext';

/**
 * Shown when a public-only QR scan resolves to a recipe that is no longer
 * accessible (deleted, made private, or moved back to draft).
 */
export function RecipeNotAvailablePage() {
  const { t } = useTranslation();

  return (
    <div className='flex min-h-[60vh] flex-col items-center justify-center px-6 text-center'>
      <div className='text-8xl'>☕</div>
      <h1 className='mt-4 text-3xl font-bold' style={{ color: 'var(--text-primary)' }}>
        {t('recipe.unavailable.title')}
      </h1>
      <p className='mt-3 max-w-md text-base' style={{ color: 'var(--text-secondary)' }}>
        {t('recipe.unavailable.message')}
      </p>
      <div className='mt-6 flex gap-3'>
        <Link to='/recipes' className='btn-primary'>{t('common.browseRecipes')}</Link>
        <Link to='/' className='btn-secondary'>{t('common.goHome')}</Link>
      </div>
    </div>
  );
}
