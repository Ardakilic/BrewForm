import { Link, Outlet } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';

export function AdminLayout() {
  const { user } = useAuth();

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 flex-shrink-0 p-4" style={{ backgroundColor: 'var(--bg-secondary)', borderRight: '1px solid var(--border-primary)' }}>
        <h2 className="text-lg font-bold mb-6" style={{ color: 'var(--accent-primary)' }}>Admin Panel</h2>
        <nav className="flex flex-col gap-1">
          <AdminNavLink to="/admin">Dashboard</AdminNavLink>
          <AdminNavLink to="/admin/users">Users</AdminNavLink>
          <AdminNavLink to="/admin/recipes">Recipes</AdminNavLink>
          <AdminNavLink to="/admin/equipment">Equipment</AdminNavLink>
          <AdminNavLink to="/admin/vendors">Vendors</AdminNavLink>
          <AdminNavLink to="/admin/taste-notes">Taste Notes</AdminNavLink>
          <AdminNavLink to="/admin/compatibility">Compatibility</AdminNavLink>
          <AdminNavLink to="/admin/badges">Badges</AdminNavLink>
          <AdminNavLink to="/admin/audit-log">Audit Log</AdminNavLink>
          <AdminNavLink to="/admin/cache">Cache</AdminNavLink>
        </nav>
        <div className="mt-8 pt-4" style={{ borderTop: '1px solid var(--border-primary)' }}>
          <Link to="/" className="text-sm" style={{ color: 'var(--text-secondary)' }}>← Back to Site</Link>
        </div>
        {user && (
          <p className="mt-4 text-xs" style={{ color: 'var(--text-tertiary)' }}>Logged in as {user.username}</p>
        )}
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}

function AdminNavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="block rounded px-3 py-2 text-sm transition-colors hover:bg-opacity-10"
      style={{ color: 'var(--text-primary)' }}
    >
      {children}
    </Link>
  );
}