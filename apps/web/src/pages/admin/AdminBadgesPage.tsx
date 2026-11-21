import { useEffect } from 'react';
import { useLoaderData } from 'react-router';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { createLogger } from '../../utils/logger.ts';
import type { loader } from './AdminBadgesPage.data.ts';

const log = createLogger('AdminBadgesPage');

/**
 * Admin page: read-only grid of all badges with icon, name, and rule, read from the
 * `/admin/badges` route loader (`AdminBadgesPage.data.ts`).
 */
export function AdminBadgesPage() {
  const { t } = useTranslation();
  const { badges } = useLoaderData<typeof loader>();

  useEffect(() => {
    log.debug({}, 'AdminBadgesPage mounted');
    return () => {
      log.debug({}, 'AdminBadgesPage unmounted');
    };
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
        {t('admin.badgesShort')}
      </h1>

      {badges.length === 0 ? (
        <div style={{ color: 'var(--text-tertiary)' }}>{t('admin.badges.noResults')}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {badges.map((badge) => (
            <div key={badge.id} className="card">
              <div className="text-3xl mb-2">{badge.icon}</div>
              <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                {badge.name}
              </h3>
              <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                {badge.description}
              </p>
              <span className="badge mt-2 inline-block text-xs">{badge.rule}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
