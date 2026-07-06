import { Link, Outlet } from 'react-router';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';

/** Admin shell: sidebar navigation to all admin sections around an `<Outlet />`. */
export function AdminLayout() {
  const { user } = useAuth();
  const { t } = useTranslation();

  return (
    <div className='flex min-h-screen'>
      <aside
        className='w-64 flex-shrink-0 p-4'
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderRight: '1px solid var(--border-primary)',
        }}
      >
        <h2 className='text-lg font-bold mb-6' style={{ color: 'var(--accent-primary)' }}>
          {t('admin.title')}
        </h2>
        <nav className='flex flex-col gap-1'>
          <AdminNavLink to='/admin'>{t('admin.dashboard')}</AdminNavLink>
          <AdminNavLink to='/admin/users'>{t('admin.users')}</AdminNavLink>
          <AdminNavLink to='/admin/recipes'>{t('admin.recipes')}</AdminNavLink>
          <AdminNavLink to='/admin/equipment'>{t('admin.equipment')}</AdminNavLink>
          <AdminNavLink to='/admin/coffee-varieties'>{t('admin.coffeeVarieties')}</AdminNavLink>
          <AdminNavLink to='/admin/vendors'>{t('admin.vendors')}</AdminNavLink>
          <AdminNavLink to='/admin/taste-notes'>{t('admin.tasteNotes')}</AdminNavLink>
          <AdminNavLink to='/admin/compatibility'>{t('admin.compatibilityShort')}</AdminNavLink>
          <AdminNavLink to='/admin/badges'>{t('admin.badgesShort')}</AdminNavLink>
          <AdminNavLink to='/admin/audit-log'>{t('admin.auditLog')}</AdminNavLink>
          <AdminNavLink to='/admin/cache'>{t('admin.cache')}</AdminNavLink>
        </nav>
        <div className='mt-8 pt-4' style={{ borderTop: '1px solid var(--border-primary)' }}>
          <Link to='/' className='text-sm' style={{ color: 'var(--text-secondary)' }}>
            {t('admin.backToSite')}
          </Link>
        </div>
        {user && (
          <p className='mt-4 text-xs' style={{ color: 'var(--text-tertiary)' }}>
            {t('admin.loggedInAs')} {user.username}
          </p>
        )}
      </aside>
      <main className='flex-1 p-6'>
        <Outlet />
      </main>
    </div>
  );
}

function AdminNavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className='block rounded px-3 py-2 text-sm transition-colors hover:bg-opacity-10'
      style={{ color: 'var(--text-primary)' }}
    >
      {children}
    </Link>
  );
}
