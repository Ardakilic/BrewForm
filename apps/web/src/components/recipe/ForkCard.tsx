import { Link } from 'react-router';
import { useTranslation } from '../../contexts/I18nContext.tsx';

interface Props {
  recipeId: string;
}

export function ForkCard({ recipeId }: Props) {
  const { t } = useTranslation();

  return (
    <div className='card'>
      <p>{t('recipe.forkDescription')}</p>
      <Link to={`/recipes/${recipeId}/fork`} aria-label={t('recipe.fork')}>
        {t('recipe.fork')}
      </Link>
    </div>
  );
}
