import { useEffect, useState } from 'react';
import { api } from '../../api/client';

interface User {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  isAdmin: boolean;
  isBanned: boolean;
  createdAt: string;
}

export function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const params = search ? `?search=${encodeURIComponent(search)}` : '';
    api.get<{ users: User[]; total: number }>(`/admin/users${params}`).then((data) => {
      const d = data as Record<string, unknown>;
      setUsers((d.users as User[]) || []);
    }).catch(() => {
    }).finally(() => setLoading(false));
  }, [search]);

  async function toggleBan(userId: string, ban: boolean) {
    try {
      if (ban) {
        await api.post(`/admin/users/${userId}/ban`, {});
      } else {
        await api.post(`/admin/users/${userId}/unban`, {});
      }
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, isBanned: ban } : u));
    } catch {
    }
  }

  async function toggleAdmin(userId: string, makeAdmin: boolean) {
    try {
      await api.patch(`/admin/users/${userId}/admin`, { isAdmin: makeAdmin } as Record<string, unknown>);
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, isAdmin: makeAdmin } : u));
    } catch {
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>User Management</h1>

      <input
        type="text"
        placeholder="Search users..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="input-field mb-4"
      />

      {loading ? (
        <div style={{ color: 'var(--text-secondary)' }}>Loading...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>Username</th>
                <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>Email</th>
                <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>Role</th>
                <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>Status</th>
                <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>Joined</th>
                <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                  <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>{user.displayName || user.username}</td>
                  <td className="py-2 px-3" style={{ color: 'var(--text-secondary)' }}>{user.email}</td>
                  <td className="py-2 px-3">{user.isAdmin ? <span className="badge">Admin</span> : 'User'}</td>
                  <td className="py-2 px-3">{user.isBanned ? <span style={{ color: 'var(--error)' }}>Banned</span> : 'Active'}</td>
                  <td className="py-2 px-3" style={{ color: 'var(--text-tertiary)' }}>{new Date(user.createdAt).toLocaleDateString()}</td>
                  <td className="py-2 px-3">
                    <div className="flex gap-2">
                      <button type="button" onClick={() => toggleBan(user.id, !user.isBanned)} className="text-xs" style={{ color: user.isBanned ? 'var(--success)' : 'var(--error)' }}>
                        {user.isBanned ? 'Unban' : 'Ban'}
                      </button>
                      {!user.isAdmin && (
                        <button type="button" onClick={() => toggleAdmin(user.id, true)} className="text-xs" style={{ color: 'var(--accent-primary)' }}>
                          Make Admin
                        </button>
                      )}
                      {user.isAdmin && (
                        <button type="button" onClick={() => toggleAdmin(user.id, false)} className="text-xs" style={{ color: 'var(--warning)' }}>
                          Remove Admin
                        </button>
                      )}
                    </div>
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