import { useEffect, useState } from 'react';
import { SEOHead } from '../../components/seo/SEOHead';
import { api } from '../../api/client';

interface DashboardStats {
  totalUsers: number;
  totalRecipes: number;
  totalComments: number;
  totalPhotos: number;
  recentSignups: number;
  recentRecipes: number;
}

export function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<DashboardStats>('/admin/stats').then((data) => {
      setStats(data as DashboardStats);
    }).catch(() => {
    }).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <SEOHead title="Admin Dashboard" />
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Dashboard</h1>

      {loading ? (
        <div style={{ color: 'var(--text-secondary)' }}>Loading stats...</div>
      ) : stats ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard label="Total Users" value={stats.totalUsers} />
          <StatCard label="Total Recipes" value={stats.totalRecipes} />
          <StatCard label="Total Comments" value={stats.totalComments} />
          <StatCard label="Total Photos" value={stats.totalPhotos} />
          <StatCard label="Recent Signups" value={stats.recentSignups} />
          <StatCard label="Recent Recipes" value={stats.recentRecipes} />
        </div>
      ) : (
        <div style={{ color: 'var(--text-tertiary)' }}>Failed to load stats.</div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card text-center">
      <div className="text-3xl font-bold" style={{ color: 'var(--accent-primary)' }}>{value}</div>
      <div className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{label}</div>
    </div>
  );
}