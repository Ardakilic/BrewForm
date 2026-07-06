import { useEffect, useState } from 'react';
import { api } from '../../api/client.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { createLogger } from '../../utils/logger.ts';

const log = createLogger('AdminBadgesPage');

interface Badge {
  id: string;
  name: string;
  emoji: string;
  rule: string;
  description: string;
}

/** Admin page: read-only grid of all badges with emoji, name, and rule. */
export function AdminBadgesPage() {
  const { t } = useTranslation();
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    log.debug({}, 'AdminBadgesPage mounted');
    return () => {
      log.debug({}, 'AdminBadgesPage unmounted');
    };
  }, []);

  useEffect(() => {
    api.get<Badge[]>('/badges').then((data) => {
      setBadges(data as Badge[]);
    }).catch((err) => {
      log.error({ err }, 'AdminBadgesPage loadBadges failed');
    }).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className='text-2xl font-bold mb-6' style={{ color: 'var(--text-primary)' }}>
        {t('admin.badgesShort')}
      </h1>

      {loading
        ? <div style={{ color: 'var(--text-secondary)' }}>{t('common.loading')}</div>
        : badges.length === 0
        ? <div style={{ color: 'var(--text-tertiary)' }}>{t('admin.badges.noResults')}</div>
        : (
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
            {badges.map((badge) => (
              <div key={badge.id} className='card'>
                <div className='text-3xl mb-2'>{badge.emoji}</div>
                <h3 className='font-semibold' style={{ color: 'var(--text-primary)' }}>
                  {badge.name}
                </h3>
                <p className='text-sm mt-1' style={{ color: 'var(--text-secondary)' }}>
                  {badge.description}
                </p>
                <span className='badge mt-2 inline-block text-xs'>{badge.rule}</span>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
