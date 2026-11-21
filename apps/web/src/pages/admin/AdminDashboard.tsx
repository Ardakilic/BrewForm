import { useEffect } from 'react';
import { useLoaderData } from 'react-router';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { formatNumber } from '../../utils/format.ts';
import { createLogger } from '../../utils/logger.ts';
import type { loader } from './AdminDashboard.data.ts';

const log = createLogger('AdminDashboard');

/**
 * Admin landing page: one tile per counter of `GET /admin/stats` (users, recipes, comments and
 * reports in total, then today's new users and recipes and the pending reports). The counters
 * come from the `/admin` route loader (`AdminDashboard.data.ts`); a failed load renders the
 * route error state inside `AdminLayout`.
 */
export function AdminDashboard() {
  const { t, locale } = useTranslation();
  const { stats } = useLoaderData<typeof loader>();

  useEffect(() => {
    log.debug({}, 'AdminDashboard mounted');
    return () => {
      log.debug({}, 'AdminDashboard unmounted');
    };
  }, []);

  return (
    <div>
      <SEOHead title={t('admin.dashboard.seoTitle')} />
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
        {t('admin.dashboard')}
      </h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label={t('admin.dashboard.totalUsers')}
          value={formatNumber(stats.totalUsers, locale)}
        />
        <StatCard
          label={t('admin.dashboard.totalRecipes')}
          value={formatNumber(stats.totalRecipes, locale)}
        />
        <StatCard
          label={t('admin.dashboard.totalComments')}
          value={formatNumber(stats.totalComments, locale)}
        />
        <StatCard
          label={t('admin.dashboard.totalReports')}
          value={formatNumber(stats.totalReports, locale)}
        />
        <StatCard
          label={t('admin.dashboard.newUsersToday')}
          value={formatNumber(stats.newUsersToday, locale)}
        />
        <StatCard
          label={t('admin.dashboard.newRecipesToday')}
          value={formatNumber(stats.newRecipesToday, locale)}
        />
        <StatCard
          label={t('admin.dashboard.pendingReports')}
          value={formatNumber(stats.pendingReports, locale)}
        />
      </div>
    </div>
  );
}

/** One dashboard tile: a locale-formatted value above its label. */
function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card text-center">
      <div className="text-3xl font-bold" style={{ color: 'var(--accent-primary)' }}>
        {value}
      </div>
      <div className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </div>
    </div>
  );
}
