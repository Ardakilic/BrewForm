import { useEffect } from 'react';
import { useFetcher, useLoaderData } from 'react-router';
import type { CompatibilityRule } from '../../api/types.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useActionFeedback } from '../../hooks/useActionFeedback.ts';
import { createLogger } from '../../utils/logger.ts';
import type { action, loader } from './AdminCompatibilityPage.data.ts';

const log = createLogger('AdminCompatibilityPage');

/**
 * Admin page: brew-method/equipment compatibility rules with a per-rule toggle and a cache
 * flush. Rules come from the route loader; both mutations submit `intent`s to the route action
 * (`AdminCompatibilityPage.data.ts`) through fetchers and toast on `{ ok: false }`.
 */
export function AdminCompatibilityPage() {
  const { t } = useTranslation();
  const { rules } = useLoaderData<typeof loader>();
  const flushFetcher = useFetcher<typeof action>();
  const flushing = flushFetcher.state !== 'idle';

  useActionFeedback(flushFetcher, { errorKey: 'admin.compatibility.flushError' });

  useEffect(() => {
    log.debug({}, 'AdminCompatibilityPage mounted');
    return () => {
      log.debug({}, 'AdminCompatibilityPage unmounted');
    };
  }, []);

  /** Submits the `flush` intent. */
  function flushCache() {
    flushFetcher.submit({ intent: 'flush' }, { method: 'post' });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {t('admin.compatibility.title')}
        </h1>
        <button type="button" onClick={flushCache} className="btn-secondary" disabled={flushing}>
          {flushing ? t('common.flushing') : t('admin.flushCache')}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
              <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>
                {t('admin.compatibility.brewMethod')}
              </th>
              <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>
                {t('admin.compatibility.equipmentType')}
              </th>
              <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>
                {t('admin.compatibility.compatible')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <CompatibilityRow key={rule.id} rule={rule} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * One rule row with its own fetcher, so several toggles can be in flight at once. The button
 * shows the submitted value optimistically and the loader revalidation brings the saved rule;
 * a failed toggle toasts `admin.compatibility.toggleError` and falls back to the saved value.
 */
function CompatibilityRow({ rule }: { rule: CompatibilityRule }) {
  const { t } = useTranslation();
  const fetcher = useFetcher<typeof action>();
  useActionFeedback(fetcher, { errorKey: 'admin.compatibility.toggleError' });
  const pending = fetcher.formData?.get('isCompatible');
  const isCompatible =
    pending === undefined || pending === null ? rule.isCompatible : pending === 'true';

  return (
    <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
      <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>
        {rule.brewMethod.replace(/_/g, ' ')}
      </td>
      <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>
        {rule.equipmentType.replace(/_/g, ' ')}
      </td>
      <td className="py-2 px-3">
        <button
          type="button"
          onClick={() =>
            fetcher.submit(
              { intent: 'toggle', id: rule.id, isCompatible: String(!isCompatible) },
              { method: 'post' },
            )
          }
          className="rounded px-3 py-1 text-xs font-medium"
          style={{
            backgroundColor: isCompatible ? 'var(--success)' : 'var(--bg-tertiary)',
            color: isCompatible ? 'var(--bg-primary)' : 'var(--text-primary)',
          }}
        >
          {isCompatible ? t('common.yes') : t('common.no')}
        </button>
      </td>
    </tr>
  );
}
