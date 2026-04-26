import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api/index';
import { SEOHead } from '../components/seo/SEOHead';

interface TasteCategory {
  id: string;
  name: string;
  children: TasteCategory[];
}

export function TasteNotesPage() {
  const [hierarchy, setHierarchy] = useState<TasteCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<TasteCategory[]>('/taste-notes/hierarchy').then((data) => {
      setHierarchy(data as TasteCategory[]);
    }).catch(() => {
    }).finally(() => setLoading(false));
  }, []);

  function renderTree(categories: TasteCategory[], depth: number = 0): React.ReactNode {
    return categories.map((cat) => (
      <div key={cat.id}>
        <div
          className="py-2"
          style={{ paddingLeft: `${depth * 1.5 + 0.75}rem` }}
        >
          <Link
            to={`/search?q=${encodeURIComponent(cat.name)}`}
            className="hover:underline"
            style={{ color: depth === 0 ? 'var(--accent-primary)' : 'var(--text-primary)', fontWeight: depth === 0 ? 600 : 400 }}
          >
            {cat.name}
          </Link>
        </div>
        {cat.children.length > 0 && renderTree(cat.children, depth + 1)}
      </div>
    ));
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <SEOHead title="Taste Notes" description="Explore the SCAA flavor wheel taste notes on BrewForm." />

      <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Taste Notes</h1>
      <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
        Explore the coffee flavor wheel. Click any taste note to find recipes.
      </p>

      <p className="text-xs mb-6" style={{ color: 'var(--text-tertiary)' }}>
        <a href="https://notbadcoffee.com/flavor-wheel-en/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)' }}>
          SCAA Flavor Wheel Reference
        </a>
      </p>

      {loading ? (
        <div style={{ color: 'var(--text-secondary)' }}>Loading...</div>
      ) : (
        <div className="card">
          {renderTree(hierarchy)}
        </div>
      )}
    </div>
  );
}