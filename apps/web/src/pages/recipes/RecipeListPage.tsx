import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { recipeApi } from '../../api/index';
import { SEOHead } from '../../components/seo/SEOHead';
import { BREW_METHODS, DRINK_TYPES, VISIBILITY_STATES } from '@brewform/shared/constants';

// deno-lint-ignore no-explicit-any
const BREW_METHODS_ANY = BREW_METHODS as unknown as any[];
// deno-lint-ignore no-explicit-any
const DRINK_TYPES_ANY = DRINK_TYPES as unknown as any[];
// deno-lint-ignore no-explicit-any
const VISIBILITY_ANY = VISIBILITY_STATES as unknown as any[];

interface RecipeListItem {
  id: string;
  slug: string;
  title: string;
  visibility: string;
  likeCount: number;
  commentCount: number;
  forkCount: number;
  author?: { username: string; displayName: string | null };
  currentVersion?: { brewMethod: string; drinkType: string; rating: number | null };
  createdAt: string;
}

export function RecipeListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [recipes, setRecipes] = useState<RecipeListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const page = Number(searchParams.get('page')) || 1;
  const brewMethod = searchParams.get('brewMethod') || '';
  const drinkType = searchParams.get('drinkType') || '';
  const visibility = searchParams.get('visibility') || '';
  const sortBy = searchParams.get('sortBy') || 'createdAt';
  const search = searchParams.get('search') || '';

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), perPage: '12', sortBy };
    if (brewMethod) params.brewMethod = brewMethod;
    if (drinkType) params.drinkType = drinkType;
    if (visibility) params.visibility = visibility;
    if (search) params.search = search;

    recipeApi.list(params).then((data: any) => {
      setRecipes(data.recipes || []);
      setTotal(data.total || 0);
    }).catch(() => {
    }).finally(() => setLoading(false));
  }, [page, brewMethod, drinkType, visibility, sortBy, search]);

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete('page');
    setSearchParams(params);
  }

  const activeFilters = [brewMethod, drinkType, visibility].filter(Boolean);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <SEOHead title="Recipes" description="Browse and discover coffee brewing recipes on BrewForm." />

      <h1 className="text-3xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Recipes</h1>

      <div className="flex flex-col lg:flex-row gap-6">
        <aside className="w-full lg:w-64 flex-shrink-0">
          <div className="card">
            <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Filters</h3>

            <div className="mb-3">
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Search</label>
              <input
                type="text"
                placeholder="Search recipes..."
                value={search}
                onChange={(e) => updateFilter('search', e.target.value)}
                className="input-field text-sm"
              />
            </div>

            <div className="mb-3">
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Brew Method</label>
              <select value={brewMethod} onChange={(e) => updateFilter('brewMethod', e.target.value)} className="input-field text-sm">
                <option value="">All</option>
                {BREW_METHODS_ANY.map((m: any) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>

            <div className="mb-3">
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Drink Type</label>
              <select value={drinkType} onChange={(e) => updateFilter('drinkType', e.target.value)} className="input-field text-sm">
                <option value="">All</option>
                {DRINK_TYPES_ANY.map((d: any) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>

            <div className="mb-3">
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Visibility</label>
              <select value={visibility} onChange={(e) => updateFilter('visibility', e.target.value)} className="input-field text-sm">
                <option value="">All</option>
                {VISIBILITY_ANY.map((v: any) => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
            </div>

            <div className="mb-3">
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Sort By</label>
              <select value={sortBy} onChange={(e) => updateFilter('sortBy', e.target.value)} className="input-field text-sm">
                <option value="createdAt">Newest</option>
                <option value="likeCount">Most Liked</option>
                <option value="rating">Top Rated</option>
              </select>
            </div>

            {activeFilters.length > 0 && (
              <button type="button" onClick={() => setSearchParams({})} className="btn-secondary text-sm w-full">
                Clear Filters
              </button>
            )}
          </div>
        </aside>

        <main className="flex-1">
          {loading ? (
            <div className="text-center py-12" style={{ color: 'var(--text-secondary)' }}>Loading...</div>
          ) : recipes.length === 0 ? (
            <div className="text-center py-12" style={{ color: 'var(--text-tertiary)' }}>No recipes found.</div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {recipes.map((r) => (
                  <RecipeCard key={r.id} recipe={r} />
                ))}
              </div>

              {total > 12 && (
                <div className="flex justify-center gap-2 mt-8">
                  {page > 1 && (
                    <button type="button" onClick={() => updateFilter('page', String(page - 1))} className="btn-secondary">
                      Previous
                    </button>
                  )}
                  <span className="py-2 px-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Page {page} of {Math.ceil(total / 12)}
                  </span>
                  {page < Math.ceil(total / 12) && (
                    <button type="button" onClick={() => updateFilter('page', String(page + 1))} className="btn-secondary">
                      Next
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function RecipeCard({ recipe }: { recipe: RecipeListItem }) {
  return (
    <Link to={`/recipes/${recipe.slug}`} className="card hover:shadow-lg transition-shadow">
      <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{recipe.title}</h3>
      <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
        by {recipe.author?.displayName || recipe.author?.username}
      </p>
      {recipe.currentVersion && (
        <div className="mt-1 flex flex-wrap gap-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          <span>{recipe.currentVersion.brewMethod.replace(/_/g, ' ')}</span>
          <span>•</span>
          <span>{recipe.currentVersion.drinkType.replace(/_/g, ' ')}</span>
          {recipe.currentVersion.rating && <span>• ★ {recipe.currentVersion.rating}</span>}
        </div>
      )}
      <div className="mt-2 flex items-center gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
        <span>❤️ {recipe.likeCount}</span>
        <span>💬 {recipe.commentCount}</span>
        <span>🍴 {recipe.forkCount}</span>
      </div>
    </Link>
  );
}