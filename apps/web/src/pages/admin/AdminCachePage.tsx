import { useEffect, useState } from 'react';
import { api } from '../../api/client.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { createLogger } from '../../utils/logger.ts';

const log = createLogger('AdminCachePage');

/** Admin page: single action to flush all server-side caches. */
export function AdminCachePage() {
  const { t } = useTranslation();
  const [flushing, setFlushing] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    log.debug({}, 'AdminCachePage mounted');
    return () => {
      log.debug({}, 'AdminCachePage unmounted');
    };
  }, []);

  async function flushAll() {
    setFlushing(true);
    setMessage('');
    try {
      await api.post('/admin/cache/flush', {});
      setMessage(t('admin.cache.flushSuccess'));
    } catch (err) {
      log.error({ err }, 'AdminCachePage flushAll failed');
      setMessage(t('admin.cache.flushError'));
    } finally {
      setFlushing(false);
    }
  }

  return (
    <div>
      <h1 className='text-2xl font-bold mb-6' style={{ color: 'var(--text-primary)' }}>
        {t('admin.cache.management')}
      </h1>

      <div className='card'>
        <h2 className='font-semibold mb-4' style={{ color: 'var(--text-primary)' }}>
          {t('admin.flushCache')}
        </h2>
        <p className='text-sm mb-4' style={{ color: 'var(--text-secondary)' }}>
          This will clear all cached data including taste note hierarchies, compatibility matrices,
          and search results.
        </p>
        <button type='button' onClick={flushAll} className='btn-primary' disabled={flushing}>
          {flushing ? t('common.flushing') : t('admin.flushCache')}
        </button>
        {message && (
          <p
            className='mt-3 text-sm'
            style={{ color: message.includes('Failed') ? 'var(--error)' : 'var(--success)' }}
          >
            {message}
          </p>
        )}
      </div>

      <div className='card mt-4'>
        <h2 className='font-semibold mb-4' style={{ color: 'var(--text-primary)' }}>
          {t('admin.cache.infoTitle')}
        </h2>
        <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>
          The application uses Deno KV for caching frequently accessed data. Cache is automatically
          refreshed when underlying data changes, but you can manually flush it here.
        </p>
        <div className='mt-3 text-sm' style={{ color: 'var(--text-tertiary)' }}>
          <p>{t('admin.cache.prefixes')}</p>
          <ul className='list-disc list-inside mt-1'>
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
