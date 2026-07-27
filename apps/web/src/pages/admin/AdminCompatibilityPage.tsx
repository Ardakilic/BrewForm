import { useEffect, useState } from 'react';
import { api } from '../../api/client.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { LoadingState } from '../../components/ui/LoadingState.tsx';
import { ErrorState } from '../../components/ui/ErrorState.tsx';
import { useToast } from '../../components/ui/Toast.tsx';
import { createLogger } from '../../utils/logger.ts';

const log = createLogger('AdminCompatibilityPage');

interface CompatibilityRule {
  id: string;
  brewMethod: string;
  equipmentType: string;
  isCompatible: boolean;
}

/** Admin page: brew-method/equipment compatibility rules with toggle and cache flush. */
export function AdminCompatibilityPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const [rules, setRules] = useState<CompatibilityRule[]>([]);
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [flushing, setFlushing] = useState(false);

  useEffect(() => {
    log.debug({}, 'AdminCompatibilityPage mounted');
    return () => {
      log.debug({}, 'AdminCompatibilityPage unmounted');
    };
  }, []);

  useEffect(() => {
    api.get<CompatibilityRule[]>('/admin/compatibility').then((data) => {
      setRules(data as CompatibilityRule[]);
      setStatus('ready');
    }).catch((err) => {
      log.error({ err }, 'compatibility rules fetch failed');
      setStatus('error');
    });
  }, []);

  async function toggleCompatibility(id: string, current: boolean) {
    try {
      const updated = await api.patch<CompatibilityRule>(
        `/admin/compatibility/${id}`,
        { isCompatible: !current },
      );
      setRules((prev) => prev.map((r) => r.id === id ? updated as CompatibilityRule : r));
    } catch (err) {
      log.error({ err, ruleId: id }, 'toggleCompatibility failed');
      toast.error('admin.compatibility.toggleError');
    }
  }

  async function flushCache() {
    setFlushing(true);
    try {
      await api.post('/admin/cache/flush', {});
    } catch (err) {
      log.error({ err }, 'flushCache failed');
      toast.error('admin.compatibility.flushError');
    } finally {
      setFlushing(false);
    }
  }

  return (
    <div>
      <div className='flex items-center justify-between mb-6'>
        <h1 className='text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>
          {t('admin.compatibility.title')}
        </h1>
        <button type='button' onClick={flushCache} className='btn-secondary' disabled={flushing}>
          {flushing ? t('common.flushing') : t('admin.flushCache')}
        </button>
      </div>

      {status === 'loading'
        ? <LoadingState />
        : status === 'error'
        ? <ErrorState message={t('admin.compatibility.loadError')} />
        : (
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                  <th className='text-left py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                    {t('admin.compatibility.brewMethod')}
                  </th>
                  <th className='text-left py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                    {t('admin.compatibility.equipmentType')}
                  </th>
                  <th className='text-left py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                    {t('admin.compatibility.compatible')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                    <td className='py-2 px-3' style={{ color: 'var(--text-primary)' }}>
                      {rule.brewMethod.replace(/_/g, ' ')}
                    </td>
                    <td className='py-2 px-3' style={{ color: 'var(--text-primary)' }}>
                      {rule.equipmentType.replace(/_/g, ' ')}
                    </td>
                    <td className='py-2 px-3'>
                      <button
                        type='button'
                        onClick={() =>
                          toggleCompatibility(rule.id, rule.isCompatible)}
                        className='rounded px-3 py-1 text-xs font-medium'
                        style={{
                          backgroundColor: rule.isCompatible
                            ? 'var(--success)'
                            : 'var(--bg-tertiary)',
                          color: rule.isCompatible ? 'white' : 'var(--text-primary)',
                        }}
                      >
                        {rule.isCompatible ? t('common.yes') : t('common.no')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}
