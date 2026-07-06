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
  const [status, setStatus] = useState<'success' | 'error' | ''>('');

  useEffect(() => {
    log.debug({}, 'AdminCachePage mounted');
    return () => {
      log.debug({}, 'AdminCachePage unmounted');
    };
  }, []);

  async function flushAll() {
    setFlushing(true);
    setMessage('');
    setStatus('');
    try {
      await api.post('/admin/cache/flush', {});
      setMessage(t('admin.cache.flushSuccess'));
      setStatus('success');
    } catch (err) {
      log.error({ err }, 'AdminCachePage flushAll failed');
      setMessage(t('admin.cache.flushError'));
      setStatus('error');
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
          {t('admin.cache.flushDescription')}
        </p>
        <button type='button' onClick={flushAll} className='btn-primary' disabled={flushing}>
          {flushing ? t('common.flushing') : t('admin.flushCache')}
        </button>
        {message && (
          <p
            className='mt-3 text-sm'
            style={{ color: status === 'error' ? 'var(--error)' : 'var(--success)' }}
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
          {t('admin.cache.kvDescription')}
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
