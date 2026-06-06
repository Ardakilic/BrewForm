import { useEffect } from 'react';
import { Link, useLoaderData, useNavigate, useNavigation } from 'react-router';
import { recipeApi } from '../api/index.ts';
import type { RecipeListItem } from '../api/types.ts';
import { useTranslation } from '../contexts/I18nContext.tsx';
import { SEOHead } from '../components/seo/SEOHead.tsx';
import { RecipeCardSkeletonGrid } from '../components/ui/Skeleton.tsx';
import { AUTHOR_BUTTON_STYLE } from '../components/recipe/RecipeCard.styles.ts';
import { createLogger } from '@/utils/logger.ts';

const log = createLogger('HomePage');

export interface HomeLoaderData {
  latestRecipes: RecipeListItem[];
  popularRecipes: RecipeListItem[];
}

export const loader = async (): Promise<HomeLoaderData> => {
  const [latestRes, popularRes] = await Promise.all([
    recipeApi.list({ perPage: '6', sortBy: 'createdAt' }),
    recipeApi.list({ perPage: '6', sortBy: 'likeCount' }),
  ]);
  return {
    latestRecipes: latestRes.data ?? [],
    popularRecipes: popularRes.data ?? [],
  };
};

export function HomePage() {
  const { latestRecipes, popularRecipes } = useLoaderData() as HomeLoaderData;
  const navigation = useNavigation();
  const loading = navigation.state === 'loading' && navigation.location?.pathname === '/';
  const { t } = useTranslation();

  useEffect(() => {
    log.debug({}, 'HomePage mounted');
    return () => {
      log.debug({}, 'HomePage unmounted');
    };
  }, []);

  return (
    <div>
      <SEOHead title='Home' />
      <section className='mx-auto max-w-6xl px-6 py-12 text-center'>
        <h1 className='text-4xl font-bold' style={{ color: 'var(--accent-primary)' }}>
          ☕ {t('app.name')}
        </h1>
        <p className='mt-4 text-lg' style={{ color: 'var(--text-secondary)' }}>
          {t('app.tagline')}
        </p>
        <div className='mt-6 flex justify-center gap-4'>
          <Link to='/recipes' className='btn-primary'>{t('common.browseRecipes')}</Link>
          <Link to='/register' className='btn-secondary'>{t('nav.register')}</Link>
        </div>
      </section>

      <section className='mx-auto max-w-6xl px-6 py-8'>
        <h2 className='mb-4 text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>
          {t('home.latestRecipes')}
        </h2>
        {loading
          ? <RecipeCardSkeletonGrid count={6} />
          : (
            <div className='grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3'>
              {latestRecipes.map((r) => <RecipeCard key={r.id} recipe={r} />)}
            </div>
          )}
      </section>

      <section className='mx-auto max-w-6xl px-6 py-8'>
        <h2 className='mb-4 text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>
          {t('home.popularRecipes')}
        </h2>
        {loading
          ? <RecipeCardSkeletonGrid count={6} />
          : (
            <div className='grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3'>
              {popularRecipes.map((r) => <RecipeCard key={r.id} recipe={r} />)}
            </div>
          )}
      </section>
    </div>
  );
}
/**
 * Render a clickable recipe card with an inner author button.
 *
 * Uses `<button>` for the author link instead of `<Link>` to avoid nested
 * `<a>` elements (invalid HTML). The card itself is a `<Link>` for native
 * link behavior (Ctrl+click/new tab), while the author button uses
 * `useNavigate` with `e.stopPropagation()` to prevent card navigation.
 */
function RecipeCard({ recipe }: { recipe: RecipeListItem }) {
  const navigate = useNavigate();
  return (
    <Link to={`/recipes/${recipe.slug}`} className='card hover:shadow-lg transition-shadow'>
      <h3 className='font-semibold' style={{ color: 'var(--text-primary)' }}>{recipe.title}</h3>
      <p className='mt-1 text-sm' style={{ color: 'var(--text-secondary)' }}>
        by {recipe.author
          ? (
            <button
              type='button'
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/u/${recipe.author!.username}`);
              }}
              className='hover:underline'
              style={AUTHOR_BUTTON_STYLE}
            >
              {recipe.author.displayName || recipe.author.username}
            </button>
          )
          : (
            'unknown'
          )}
      </p>
      <div
        className='mt-2 flex items-center gap-2 text-xs'
        style={{ color: 'var(--text-tertiary)' }}
      >
        <span>❤️ {recipe.likeCount}</span>
        <span>💬 {recipe.commentCount}</span>
        <span>🍴 {recipe.forkCount}</span>
      </div>
    </Link>
  );
}
