import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router';
import { api } from '../../api/client';
import { SEOHead } from '../../components/seo/SEOHead';
import { BREW_METHODS, DRINK_TYPES } from '@brewform/shared/constants';

// deno-lint-ignore no-explicit-any
const BREW_METHODS_ANY = BREW_METHODS as unknown as any[];
// deno-lint-ignore no-explicit-any
const DRINK_TYPES_ANY = DRINK_TYPES as unknown as any[];

interface SearchRecipe {
  id: string;
  slug: string;
  title: string;
  author?: { username: string; displayName: string | null };
  currentVersion?: { brewMethod: string; drinkType: string; rating: number | null };
  likeCount: number;
}

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [results, setResults] = useState<SearchRecipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);

  const q = searchParams.get('q') || '';
  const brewMethod = searchParams.get('brewMethod') || '';
  const drinkType = searchParams.get('drinkType') || '';
  const sortBy = searchParams.get('sortBy') || 'createdAt';
  const page = Number(searchParams.get('page')) || 1;

  useEffect(() => {
    if (!q && !brewMethod && !drinkType) {
      setResults([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    const params: Record<string, string> = {};
    if (q) params.q = q;
    if (brewMethod) params.brewMethod = brewMethod;
    if (drinkType) params.drinkType = drinkType;
    params.sortBy = sortBy;
    params.page = String(page);
    params.perPage = '12';

    api.get<{ recipes: SearchRecipe[]; total: number }>(`/search?${new URLSearchParams(params)}`)
      .then((data: any) => {
        setResults((data.recipes as SearchRecipe[]) || []);
        setTotal((data.total as number) || 0);
      })
      .catch(() => {
        setResults([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [q, brewMethod, drinkType, sortBy, page]);

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

  const activeFilters = [q, brewMethod, drinkType].filter(Boolean);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <SEOHead title="Search Recipes" description="Search and filter coffee brewing recipes on BrewForm." />

      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Search Recipes</h1>

      <div className="flex flex-col lg:flex-row gap-6">
        <aside className="w-full lg:w-64 flex-shrink-0">
          <div className="card">
            <h3 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Filters</h3>

            <div className="mb-3">
              <input
                type="text"
                value={q}
                onChange={(e) => updateFilter('q', e.target.value)}
                placeholder="Search..."
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
            <div className="text-center py-12" style={{ color: 'var(--text-secondary)' }}>Searching...</div>
          ) : results.length === 0 ? (
            <div className="text-center py-12" style={{ color: 'var(--text-tertiary)' }}>
              {activeFilters.length > 0 ? 'No results found. Try adjusting your filters.' : 'Enter a search query or select filters.'}
            </div>
          ) : (
            <>
              <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>{total} results</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {results.map((r) => (
                  <Link key={r.id} to={`/recipes/${r.slug}`} className="card hover:shadow-lg transition-shadow">
                    <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{r.title}</h3>
                    <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      by {r.author?.displayName || r.author?.username}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      <span>❤️ {r.likeCount}</span>
                      {r.currentVersion?.rating && <span>★ {r.currentVersion.rating}</span>}
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}