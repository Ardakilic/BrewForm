import { Fragment } from 'react';
import { Link } from 'react-router';
import { useTranslation } from '../../contexts/I18nContext.tsx';

/** A single breadcrumb entry; the last entry (or one without `to`) is current. */
export interface BreadcrumbItem {
  label: string;
  to?: string;
}

/** Props accepted by {@link Breadcrumb}. */
interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

/**
 * Generic breadcrumb trail: a `<nav aria-label><ol>` shell rendering each item
 * as a link (when `to` is given and it is not the last entry) separated by `›`,
 * with the final entry marked `aria-current='page'`.
 */
export function Breadcrumb({ items }: BreadcrumbProps) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('a11y.breadcrumb')}>
      <ol className='flex items-center gap-1 flex-wrap text-[color:var(--text-tertiary)] text-xs'>
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          const isLink = !isLast && !!item.to;
          return (
            <Fragment key={`${item.label}-${i}`}>
              {i > 0 && (
                <li
                  aria-hidden='true'
                  className='select-none text-[color:var(--text-tertiary)]'
                >
                  ›
                </li>
              )}
              <li
                aria-current={isLast ? 'page' : undefined}
                className={isLast ? 'text-[color:var(--text-secondary)]' : undefined}
              >
                {isLink
                  ? (
                    <Link
                      to={item.to!}
                      className='transition-colors text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]'
                    >
                      {item.label}
                    </Link>
                  )
                  : item.label}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
