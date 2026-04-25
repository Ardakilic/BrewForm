import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { recipeApi } from '../api/index';

interface RecipeListItem {
  id: string;
  slug: string;
  title: string;
  author?: { username: string };
  likeCount: number;
  commentCount: number;
  forkCount: number;
}

export function HomePage() {
  const [latestRecipes, setLatestRecipes] = useState<RecipeListItem[]>([]);
  const [popularRecipes, setPopularRecipes] = useState<RecipeListItem[]>([]);

  useEffect(() => {
    recipeApi.list({ perPage: '6', sortBy: 'createdAt' }).then((data) => {
      setLatestRecipes((data as Record<string, unknown>).recipes as RecipeListItem[]);
    }).catch(() => {});
    recipeApi.list({ perPage: '6', sortBy: 'likeCount' }).then((data) => {
      setPopularRecipes((data as Record<string, unknown>).recipes as RecipeListItem[]);
    }).catch(() => {});
  }, []);

  return (
    <div>
      <section className="mx-auto max-w-6xl px-6 py-12 text-center">
        <h1 className="text-4xl font-bold" style={{ color: 'var(--accent-primary)' }}>
          ☕ BrewForm
        </h1>
        <p className="mt-4 text-lg" style={{ color: 'var(--text-secondary)' }}>
          Digitalize, share, and discover coffee brewing recipes and tasting notes.
        </p>
        <div className="mt-6 flex justify-center gap-4">
          <Link to="/recipes" className="btn-primary">Browse Recipes</Link>
          <Link to="/register" className="btn-secondary">Get Started</Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-8">
        <h2 className="mb-4 text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Latest Recipes</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {latestRecipes.map((r) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-8">
        <h2 className="mb-4 text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Popular Recipes</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {popularRecipes.map((r) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </div>
      </section>
    </div>
  );
}

function RecipeCard({ recipe }: { recipe: RecipeListItem }) {
  return (
    <Link to={`/recipes/${recipe.slug}`} className="card hover:shadow-lg transition-shadow">
      <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{recipe.title}</h3>
      <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>by {recipe.author?.username}</p>
      <div className="mt-2 flex items-center gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
        <span>❤️ {recipe.likeCount}</span>
        <span>💬 {recipe.commentCount}</span>
        <span>🍴 {recipe.forkCount}</span>
      </div>
    </Link>
  );
}