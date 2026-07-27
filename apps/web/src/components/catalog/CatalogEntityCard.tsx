import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { TypeBadge } from './TypeBadge.tsx';

interface CatalogEntityCardProps {
  to: string;
  title: string;
  brand?: string | null;
  badge?: string | null;
  description?: string | null;
  children?: ReactNode;
}

export function CatalogEntityCard(
  { to, title, brand, badge, description, children }: CatalogEntityCardProps,
) {
  return (
    <Link to={to} className='card hover:shadow-lg transition-shadow'>
      <div className='flex items-start justify-between mb-1'>
        <div>
          {brand && (
            <p className='font-bold' style={{ color: 'var(--text-primary)' }}>
              {brand}
            </p>
          )}
          <h3
            className={brand ? 'text-sm' : 'font-semibold'}
            style={{ color: brand ? 'var(--text-secondary)' : 'var(--text-primary)' }}
          >
            {title}
          </h3>
        </div>
        {badge && <TypeBadge label={badge} />}
      </div>
      {children}
      {description && (
        <p
          className='text-xs mt-2'
          style={{
            color: 'var(--text-tertiary)',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {description}
        </p>
      )}
    </Link>
  );
}
