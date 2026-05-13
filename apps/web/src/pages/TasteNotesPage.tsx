import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api/index';
import { SEOHead } from '../components/seo/SEOHead';
import { useTranslation } from '../contexts/I18nContext';

interface TasteCategory {
  id: string;
  name: string;
  children: TasteCategory[];
}

function collectLeafIds(cat: TasteCategory): string[] {
  if (cat.children.length === 0) return [cat.id];
  return cat.children.flatMap(collectLeafIds);
}

export function TasteNotesPage() {
  const [hierarchy, setHierarchy] = useState<TasteCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();

  useEffect(() => {
    api.get<TasteCategory[]>('/taste-notes/hierarchy').then((data) => {
      setHierarchy(data as TasteCategory[]);
    }).catch(() => {
    }).finally(() => setLoading(false));
  }, []);

  function renderTree(categories: TasteCategory[], depth: number = 0): React.ReactNode {
    return categories.map((cat) => (
      <div key={cat.id}>
        <div className='py-2' style={{ paddingLeft: `${depth * 1.5 + 0.75}rem` }}>
          <Link
            to={`/recipes?tasteNoteIds=${collectLeafIds(cat).join(',')}`}
            className='hover:underline'
            style={{
              color: depth === 0 ? 'var(--accent-primary)' : 'var(--text-primary)',
              fontWeight: depth === 0 ? 600 : 400,
            }}
          >
            {cat.name}
          </Link>
        </div>
        {cat.children.length > 0 && renderTree(cat.children, depth + 1)}
      </div>
    ));
  }

  return (
    <div className='mx-auto max-w-4xl px-6 py-8'>
      <SEOHead
        title={t('page.tasteNotes')}
        description='Explore the SCAA flavor wheel taste notes on BrewForm.'
      />

      <h1 className='text-2xl font-bold mb-2' style={{ color: 'var(--text-primary)' }}>
        {t('page.tasteNotes')}
      </h1>
      <p className='mb-6' style={{ color: 'var(--text-secondary)' }}>
        {t('page.tasteNotes.description')}
      </p>

      <p className='text-xs mb-6' style={{ color: 'var(--text-tertiary)' }}>
        <a
          href='https://notbadcoffee.com/flavor-wheel-en/'
          target='_blank'
          rel='noopener noreferrer'
          style={{ color: 'var(--accent-primary)' }}
        >
          {t('taste.reference')}
        </a>
      </p>

      {loading
        ? <div style={{ color: 'var(--text-secondary)' }}>{t('common.loading')}</div>
        : (
          <div className='card'>
            {renderTree(hierarchy)}
          </div>
        )}
    </div>
  );
}
