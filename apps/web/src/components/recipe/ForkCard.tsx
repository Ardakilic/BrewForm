import { Link } from 'react-router';
import { useTranslation } from '../../contexts/I18nContext.tsx';

interface Props {
  recipeId: string;
}

export function ForkCard({ recipeId }: Props) {
  const { t } = useTranslation();

  return (
    <div className='card'>
      <h4 className='font-semibold mb-3' style={{ color: 'var(--text-primary)' }}>
        {t('recipe.fork')}
      </h4>
      <Link to={`/recipes/${recipeId}/fork`} className='btn-secondary text-sm inline-block mb-3'>
        🍴 {t('recipe.fork')}
      </Link>
      <p className='text-xs' style={{ color: 'var(--text-tertiary)' }}>
        {t('recipe.forkDescription')}
      </p>
    </div>
  );
}
