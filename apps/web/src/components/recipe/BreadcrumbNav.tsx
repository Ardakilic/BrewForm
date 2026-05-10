import { Link } from 'react-router';
import { BREW_METHODS } from '@brewform/shared/constants';

interface BreadcrumbNavProps {
  brewMethod: string | null | undefined;
  recipeTitle: string;
}

function getBrewMethodLabel(value: string): string {
  const found = BREW_METHODS.find((m) => m.value === value);
  if (found) return found.label;
  // Fallback: replace underscores with spaces and title-case each word
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function truncateTitle(title: string): string {
  if (title.length <= 40) return title;
  return title.slice(0, 37) + '…';
}

export function BreadcrumbNav({ brewMethod, recipeTitle }: BreadcrumbNavProps) {
  const displayTitle = truncateTitle(recipeTitle);

  return (
    <nav aria-label='Breadcrumb'>
      <ol
        className='flex items-center gap-1 flex-wrap'
        style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}
      >
        <li>
          <Link
            to='/recipes'
            className='transition-colors'
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-primary)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-secondary)';
            }}
          >
            Recipes
          </Link>
        </li>

        {brewMethod && (
          <>
            <li aria-hidden='true' className='select-none' style={{ color: 'var(--text-tertiary)' }}>
              ›
            </li>
            <li>
              <Link
                to={`/recipes?brewMethod=${brewMethod}`}
                className='transition-colors'
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-primary)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-secondary)';
                }}
              >
                {getBrewMethodLabel(brewMethod)}
              </Link>
            </li>
          </>
        )}

        <li aria-hidden='true' className='select-none' style={{ color: 'var(--text-tertiary)' }}>
          ›
        </li>
        <li aria-current='page' style={{ color: 'var(--text-secondary)' }}>
          {displayTitle}
        </li>
      </ol>
    </nav>
  );
}
