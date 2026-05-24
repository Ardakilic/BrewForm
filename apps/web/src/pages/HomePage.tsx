import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { recipeApi } from '../api/index.ts';
import type { RecipeListItem } from '../api/types.ts';
import { useTranslation } from '../contexts/I18nContext.tsx';
import { SEOHead } from '../components/seo/SEOHead.tsx';

export function HomePage() {
  const [latestRecipes, setLatestRecipes] = useState<RecipeListItem[]>([]);
  const [popularRecipes, setPopularRecipes] = useState<RecipeListItem[]>([]);
  const { t } = useTranslation();

  useEffect(() => {
    recipeApi.list({ perPage: '6', sortBy: 'createdAt' }).then((response) => {
      setLatestRecipes(response.data ?? []);
    }).catch(() => {});
    recipeApi.list({ perPage: '6', sortBy: 'likeCount' }).then((response) => {
      setPopularRecipes(response.data ?? []);
    }).catch(() => {});
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
        <div className='grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3'>
          {latestRecipes.map((r) => <RecipeCard key={r.id} recipe={r} />)}
        </div>
      </section>

      <section className='mx-auto max-w-6xl px-6 py-8'>
        <h2 className='mb-4 text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>
          {t('home.popularRecipes')}
        </h2>
        <div className='grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3'>
          {popularRecipes.map((r) => <RecipeCard key={r.id} recipe={r} />)}
        </div>
      </section>
    </div>
  );
}

function RecipeCard({ recipe }: { recipe: RecipeListItem }) {
  return (
    <Link to={`/recipes/${recipe.slug}`} className='card hover:shadow-lg transition-shadow'>
      <h3 className='font-semibold' style={{ color: 'var(--text-primary)' }}>{recipe.title}</h3>
      <p className='mt-1 text-sm' style={{ color: 'var(--text-secondary)' }}>
        by {recipe.author
          ? (
            <Link
              to={`/u/${recipe.author.username}`}
              onClick={(e) => e.stopPropagation()}
              className='hover:underline'
              style={{ color: 'var(--accent-primary)' }}
            >
              {recipe.author.displayName || recipe.author.username}
            </Link>
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
