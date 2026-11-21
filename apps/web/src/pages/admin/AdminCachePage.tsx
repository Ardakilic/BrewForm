import { useEffect } from 'react';
import { useFetcher } from 'react-router';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useActionFeedback } from '../../hooks/useActionFeedback.ts';
import { createLogger } from '../../utils/logger.ts';
import type { action } from './AdminCachePage.data.ts';

const log = createLogger('AdminCachePage');

/**
 * Admin page: single action to flush all server-side caches. The button submits to the
 * `/admin/cache` route action (`AdminCachePage.data.ts`) through a fetcher; the result is
 * toasted (`admin.cache.flushSuccess` / `admin.cache.flushError`).
 */
export function AdminCachePage() {
  const { t } = useTranslation();
  const fetcher = useFetcher<typeof action>();
  const flushing = fetcher.state !== 'idle';

  useActionFeedback(fetcher, {
    successKey: 'admin.cache.flushSuccess',
    errorKey: 'admin.cache.flushError',
  });

  useEffect(() => {
    log.debug({}, 'AdminCachePage mounted');
    return () => {
      log.debug({}, 'AdminCachePage unmounted');
    };
  }, []);

  /** Submits the flush to the route action. */
  function flushAll() {
    fetcher.submit({}, { method: 'post' });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
        {t('admin.cache.management')}
      </h1>

      <div className="card">
        <h2 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          {t('admin.flushCache')}
        </h2>
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          {t('admin.cache.flushDescription')}
        </p>
        <button type="button" onClick={flushAll} className="btn-primary" disabled={flushing}>
          {flushing ? t('common.flushing') : t('admin.flushCache')}
        </button>
      </div>

      <div className="card mt-4">
        <h2 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          {t('admin.cache.infoTitle')}
        </h2>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('admin.cache.kvDescription')}
        </p>
        <div className="mt-3 text-sm" style={{ color: 'var(--text-tertiary)' }}>
          <p>{t('admin.cache.prefixes')}</p>
          <ul className="list-disc list-inside mt-1">
            <li>
              <code>taste:</code> — Taste note hierarchy and search results
            </li>
            <li>
              <code>compatibility:</code> — Brew method compatibility matrix
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
