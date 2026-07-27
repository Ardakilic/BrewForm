import { useEffect, useState } from 'react';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { api } from '../../api/client.ts';
import { LoadingState } from '../../components/ui/LoadingState.tsx';
import { ErrorState } from '../../components/ui/ErrorState.tsx';
import { createLogger } from '../../utils/logger.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';

const log = createLogger('AdminDashboard');

interface DashboardStats {
  totalUsers: number;
  totalRecipes: number;
  totalComments: number;
  totalPhotos: number;
  recentSignups: number;
  recentRecipes: number;
}

/** Admin landing page: stat cards for user/recipe/comment/photo totals and recent activity. */
export function AdminDashboard() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');

  useEffect(() => {
    log.debug({}, 'AdminDashboard mounted');
    return () => {
      log.debug({}, 'AdminDashboard unmounted');
    };
  }, []);

  useEffect(() => {
    api.get<DashboardStats>('/admin/stats').then((data) => {
      setStats(data as DashboardStats);
      setStatus('ready');
    }).catch((err) => {
      log.error({ err }, 'admin stats fetch failed');
      setStatus('error');
    });
  }, []);

  return (
    <div>
      <SEOHead title={t('admin.dashboard.seoTitle')} />
      <h1 className='text-2xl font-bold mb-6' style={{ color: 'var(--text-primary)' }}>
        {t('admin.dashboard')}
      </h1>

      {status === 'loading'
        ? <LoadingState message={t('admin.dashboard.loading')} />
        : status === 'error'
        ? <ErrorState message={t('admin.dashboard.loadError')} />
        : stats
        ? (
          <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
            <StatCard label={t('admin.dashboard.totalUsers')} value={stats.totalUsers} />
            <StatCard label={t('admin.dashboard.totalRecipes')} value={stats.totalRecipes} />
            <StatCard label={t('admin.dashboard.totalComments')} value={stats.totalComments} />
            <StatCard label={t('admin.dashboard.totalPhotos')} value={stats.totalPhotos} />
            <StatCard label={t('admin.dashboard.recentSignups')} value={stats.recentSignups} />
            <StatCard label={t('admin.dashboard.recentRecipes')} value={stats.recentRecipes} />
          </div>
        )
        : null}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className='card text-center'>
      <div className='text-3xl font-bold' style={{ color: 'var(--accent-primary)' }}>{value}</div>
      <div className='text-sm mt-1' style={{ color: 'var(--text-secondary)' }}>{label}</div>
    </div>
  );
}
