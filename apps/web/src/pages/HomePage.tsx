import { useEffect } from 'react';
import { Link, useLoaderData, useNavigation } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { RecipeCard } from '../components/recipe-list/index.ts';
import { SEOHead } from '../components/seo/SEOHead.tsx';
import { RecipeCardSkeletonGrid } from '../components/ui/Skeleton.tsx';
import { useTranslation } from '../contexts/I18nContext.tsx';
import type { loader } from './HomePage.data.ts';

const log = createLogger('HomePage');

/**
 * Landing page: hero with browse/register CTAs plus "latest" and
 * "popular" recipe grids from the `/` route loader (`HomePage.data.ts`),
 * with skeletons while navigating.
 */
export function HomePage() {
  const { latestRecipes, popularRecipes } = useLoaderData<typeof loader>();
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
      <SEOHead title={t('seo.home.title')} />
      <section className="mx-auto max-w-6xl px-6 py-12 text-center">
        <h1 className="text-4xl font-bold" style={{ color: 'var(--accent-primary)' }}>
          ☕ {t('app.name')}
        </h1>
        <p className="mt-4 text-lg" style={{ color: 'var(--text-secondary)' }}>
          {t('app.tagline')}
        </p>
        <div className="mt-6 flex justify-center gap-4">
          <Link to="/recipes" className="btn-primary">
            {t('common.browseRecipes')}
          </Link>
          <Link to="/register" className="btn-secondary">
            {t('nav.register')}
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-8">
        <h2 className="mb-4 text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {t('home.latestRecipes')}
        </h2>
        {loading ? (
          <RecipeCardSkeletonGrid count={6} />
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {latestRecipes.map((r) => (
              <RecipeCard key={r.id} recipe={r} />
            ))}
          </div>
        )}
      </section>

      <section className="mx-auto max-w-6xl px-6 py-8">
        <h2 className="mb-4 text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {t('home.popularRecipes')}
        </h2>
        {loading ? (
          <RecipeCardSkeletonGrid count={6} />
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {popularRecipes.map((r) => (
              <RecipeCard key={r.id} recipe={r} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
