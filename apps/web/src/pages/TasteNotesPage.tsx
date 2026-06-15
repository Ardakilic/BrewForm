import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Popover } from '@base-ui/react/popover';
import { api } from '../api/index.ts';
import { SEOHead } from '../components/seo/SEOHead.tsx';
import { useTranslation } from '../contexts/I18nContext.tsx';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('TasteNotesPage');

interface TasteCategory {
  id: string;
  name: string;
  parentId: string | null;
  color: string | null;
  definition: string | null;
  depth: number;
  createdAt: string;
  children: TasteCategory[];
}

function collectLeafIds(cat: TasteCategory): string[] {
  if (cat.children.length === 0) return [cat.id];
  return cat.children.flatMap(collectLeafIds);
}

function countLeaves(cat: TasteCategory): number {
  if (cat.children.length === 0) return 1;
  return cat.children.reduce((sum, child) => sum + countLeaves(child), 0);
}

function filterHierarchy(categories: TasteCategory[], search: string): TasteCategory[] {
  const lower = search.toLowerCase();

  function filter(cat: TasteCategory): TasteCategory | null {
    const nameMatches = cat.name.toLowerCase().includes(lower);

    if (cat.children.length === 0) {
      return nameMatches ? cat : null;
    }

    const filteredChildren = cat.children
      .map(filter)
      .filter((c): c is TasteCategory => c !== null);

    if (nameMatches) {
      return { ...cat };
    }

    if (filteredChildren.length > 0) {
      return { ...cat, children: filteredChildren };
    }

    return null;
  }

  return categories
    .map(filter)
    .filter((c): c is TasteCategory => c !== null);
}

function TasteCategoryCard({
  category,
}: {
  category: TasteCategory;
}) {
  const { t } = useTranslation();
  const leafCount = useMemo(() => countLeaves(category), [category]);
  const swatchColor = category.color ?? 'var(--accent-primary)';

  return (
    <div
      data-category-card
      className='card flex flex-col hover:shadow-md transition-shadow'
      style={{ borderLeft: `3px solid ${swatchColor}` }}
    >
      <div className='flex items-center gap-3 mb-3'>
        <span
          data-color-swatch
          className='inline-block rounded-full flex-shrink-0'
          style={{
            width: '14px',
            height: '14px',
            backgroundColor: swatchColor,
            boxShadow: `0 0 8px ${swatchColor}40`,
          }}
        />
        <Link
          to={`/recipes?tasteNoteIds=${collectLeafIds(category).join(',')}`}
          className='font-semibold text-xl hover:underline'
          style={{ color: 'var(--text-primary)' }}
        >
          {category.name}
        </Link>
        <DefinitionPopover definition={category.definition} label={category.name} />
        <span
          className='ml-auto text-xs font-medium rounded-full px-2 py-0.5 flex-shrink-0'
          style={{
            backgroundColor: `${swatchColor}18`,
            color: swatchColor,
          }}
        >
          {t('taste.leafCount').replace('{count}', leafCount.toString())}
        </span>
      </div>

      <div className='border-t mb-3' style={{ borderColor: 'var(--border-primary)' }} />

      <div className='flex flex-col gap-4 mt-auto'>
        {category.children.map((sub) => (
          <div key={sub.id}>
            <div className='flex items-center gap-1.5 mb-2'>
              <Link
                to={`/recipes?tasteNoteIds=${collectLeafIds(sub).join(',')}`}
                className='text-base font-medium hover:underline'
                style={{ color: 'var(--text-primary)' }}
              >
                {sub.name}
              </Link>
              <DefinitionPopover definition={sub.definition} label={sub.name} />
              <span
                className='text-sm'
                style={{ color: 'var(--text-tertiary)' }}
              >
                {sub.children.length}
              </span>
            </div>
            <div className='flex flex-wrap gap-1.5'>
              {sub.children.map((leaf) => (
                <span
                  key={leaf.id}
                  className='inline-flex items-center gap-0.5 rounded-md text-sm font-medium px-2 py-1'
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <Link
                    to={`/recipes?tasteNoteIds=${leaf.id}`}
                    className='inline-flex items-center transition-all duration-150 hover:brightness-110'
                    style={{ color: 'inherit', borderRadius: 'inherit' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.parentElement!.style.backgroundColor = swatchColor + '22';
                      e.currentTarget.parentElement!.style.color = swatchColor;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.parentElement!.style.backgroundColor = 'var(--bg-tertiary)';
                      e.currentTarget.parentElement!.style.color = 'var(--text-secondary)';
                    }}
                  >
                    {leaf.name}
                  </Link>
                  <DefinitionPopover definition={leaf.definition} label={leaf.name} />
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DefinitionPopover({ definition, label }: { definition: string | null; label: string }) {
  if (!definition) return null;

  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        delay={300}
        className='inline-flex items-center justify-center w-5 h-5 rounded-full
                   hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]
                   hover:text-[var(--accent-primary)] transition-colors
                   cursor-pointer flex-shrink-0'
        aria-label={`Definition of ${label}`}
      >
        <svg
          width='14'
          height='14'
          viewBox='0 0 24 24'
          fill='none'
          stroke='currentColor'
          strokeWidth='2'
          strokeLinecap='round'
          strokeLinejoin='round'
          aria-hidden='true'
        >
          <circle cx='12' cy='12' r='10' />
          <line x1='12' y1='16' x2='12' y2='12' />
          <line x1='12' y1='8' x2='12.01' y2='8' />
        </svg>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side='top' sideOffset={6} align='center'>
          <Popover.Popup
            className='card max-w-[260px] p-3 text-xs shadow-lg z-50'
            style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
          >
            <Popover.Arrow className='fill-[var(--bg-secondary)]' />
            <Popover.Description
              className='leading-relaxed'
              style={{ color: 'var(--text-secondary)' }}
            >
              {definition}
            </Popover.Description>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function TasteNotesPage() {
  const [hierarchy, setHierarchy] = useState<TasteCategory[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();

  useEffect(() => {
    log.debug({}, 'TasteNotesPage mounted');
    return () => {
      log.debug({}, 'TasteNotesPage unmounted');
    };
  }, []);

  useEffect(() => {
    api.get<TasteCategory[]>('/taste-notes/hierarchy').then((data: TasteCategory[] | null) => {
      setHierarchy((data ?? []) as TasteCategory[]);
    }).catch((err) => {
      log.error({ err }, 'TasteNotesPage loadData failed');
    }).finally(() => setLoading(false));
  }, []);

  const filteredHierarchy = search ? filterHierarchy(hierarchy, search) : hierarchy;

  return (
    <div className='mx-auto max-w-6xl px-6 py-8'>
      <SEOHead
        title={t('page.tasteNotes')}
        description='Explore the SCAA flavor wheel taste notes on BrewForm.'
      />

      <div className='mb-8'>
        <h1 className='text-3xl font-bold mb-2' style={{ color: 'var(--text-primary)' }}>
          {t('page.tasteNotes')}
        </h1>
        <p className='mb-4 text-base' style={{ color: 'var(--text-secondary)' }}>
          {t('page.tasteNotes.description')}
        </p>
        <p className='mb-4 text-sm' style={{ color: 'var(--text-secondary)' }}>
          <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>ⓘ</span>{' '}
          {t('taste.infoIconHint')}
        </p>
        <p className='text-xs mb-4' style={{ color: 'var(--text-tertiary)' }}>
          <a
            href='https://notbadcoffee.com/flavor-wheel-en/'
            target='_blank'
            rel='noopener noreferrer'
            style={{ color: 'var(--accent-primary)' }}
          >
            {t('taste.reference')}
          </a>
        </p>

        <div className='relative'>
          <svg
            className='absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none'
            width='18'
            height='18'
            viewBox='0 0 24 24'
            fill='none'
            stroke='var(--text-tertiary)'
            strokeWidth='2'
            strokeLinecap='round'
            strokeLinejoin='round'
          >
            <circle cx='11' cy='11' r='8' />
            <line x1='21' y1='21' x2='16.65' y2='16.65' />
          </svg>
          <input
            type='text'
            className='input-field pl-10'
            placeholder={t('taste.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading
        ? <div style={{ color: 'var(--text-secondary)' }}>{t('common.loading')}</div>
        : filteredHierarchy.length === 0
        ? (
          <div className='card text-center py-12'>
            <p style={{ color: 'var(--text-secondary)' }}>{t('taste.noResults')}</p>
          </div>
        )
        : (
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
            {filteredHierarchy.map((category) => (
              <TasteCategoryCard
                key={category.id}
                category={category}
              />
            ))}
          </div>
        )}
    </div>
  );
}
