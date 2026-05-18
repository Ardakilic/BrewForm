import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { adminApi, type AdminUser } from '../../api/index.ts';

interface PaginationState {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    perPage: 20,
    total: 0,
    totalPages: 0,
  });
  const [banDialog, setBanDialog] = useState<
    {
      user: AdminUser;
      reason: string;
      processing: boolean;
    } | null
  >(null);

  function fetchUsers(page: number, q: string) {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), perPage: '20' };
    if (q) params.q = q;
    adminApi.getUsers(params).then((data) => {
      setUsers(data.users);
      setPagination((prev) => ({
        ...prev,
        page,
        total: data.total,
        totalPages: Math.ceil(data.total / prev.perPage),
      }));
    }).catch(() => {
    }).finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchUsers(1, search);
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    fetchUsers(1, search);
  }

  async function handleBan(userId: string) {
    if (!banDialog || !banDialog.reason.trim()) return;
    setBanDialog({ ...banDialog, processing: true });
    try {
      await adminApi.banUser(userId, banDialog.reason);
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, isBanned: true } : u));
      setBanDialog(null);
    } catch {
      setBanDialog({ ...banDialog, processing: false });
    }
  }

  async function handleUnban(userId: string) {
    try {
      await adminApi.unbanUser(userId);
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, isBanned: false } : u));
    } catch {
    }
  }

  return (
    <div>
      <div className='flex items-center justify-between mb-6'>
        <h1 className='text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>
          User Management
        </h1>
        <Link to='/admin/users/new' className='btn-primary'>
          + New User
        </Link>
      </div>

      <form onSubmit={handleSearch} className='mb-4 flex gap-2'>
        <input
          type='text'
          placeholder='Search users...'
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className='input-field flex-1'
        />
        <button type='submit' className='btn-secondary'>
          Search
        </button>
      </form>

      {loading
        ? (
          <div className='space-y-4'>
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className='h-12 rounded animate-pulse'
                style={{ backgroundColor: 'var(--bg-tertiary)' }}
              />
            ))}
          </div>
        )
        : users.length === 0
        ? (
          <div className='text-center py-12' style={{ color: 'var(--text-tertiary)' }}>
            {search ? 'No users match your search.' : 'No users found.'}
          </div>
        )
        : (
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                  <th className='text-left py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                    Username
                  </th>
                  <th className='text-left py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                    Email
                  </th>
                  <th className='text-left py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                    Role
                  </th>
                  <th className='text-left py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                    Status
                  </th>
                  <th className='text-left py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                    Joined
                  </th>
                  <th className='text-left py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                    <td className='py-2 px-3' style={{ color: 'var(--text-primary)' }}>
                      <Link
                        to={`/admin/users/${user.id}`}
                        style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}
                      >
                        {user.displayName || user.username}
                      </Link>
                    </td>
                    <td className='py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                      {user.email}
                    </td>
                    <td className='py-2 px-3'>
                      {user.isAdmin ? <span className='badge'>Admin</span> : 'User'}
                    </td>
                    <td className='py-2 px-3'>
                      {user.isBanned
                        ? <span style={{ color: 'var(--error)' }}>Banned</span>
                        : 'Active'}
                    </td>
                    <td className='py-2 px-3' style={{ color: 'var(--text-tertiary)' }}>
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className='py-2 px-3'>
                      <div className='flex gap-2'>
                        <Link
                          to={`/admin/users/${user.id}`}
                          className='text-xs'
                          style={{ color: 'var(--accent-primary)' }}
                        >
                          View
                        </Link>
                        <Link
                          to={`/admin/users/${user.id}/edit`}
                          className='text-xs'
                          style={{ color: 'var(--accent-primary)' }}
                        >
                          Edit
                        </Link>
                        {user.isBanned
                          ? (
                            <button
                              type='button'
                              onClick={() => handleUnban(user.id)}
                              className='text-xs'
                              style={{ color: 'var(--success)' }}
                            >
                              Unban
                            </button>
                          )
                          : (
                            <button
                              type='button'
                              onClick={() => setBanDialog({ user, reason: '', processing: false })}
                              className='text-xs'
                              style={{ color: 'var(--error)' }}
                            >
                              Ban
                            </button>
                          )}
                        {user.isAdmin
                          ? (
                            <button
                              type='button'
                              onClick={async () => {
                                try {
                                  await adminApi.toggleAdmin(user.id, false);
                                  setUsers((prev) =>
                                    prev.map((u) => u.id === user.id ? { ...u, isAdmin: false } : u)
                                  );
                                } catch {
                                }
                              }}
                              className='text-xs'
                              style={{ color: 'var(--warning)' }}
                            >
                              Remove Admin
                            </button>
                          )
                          : (
                            <button
                              type='button'
                              onClick={async () => {
                                try {
                                  await adminApi.toggleAdmin(user.id, true);
                                  setUsers((prev) =>
                                    prev.map((u) => u.id === user.id ? { ...u, isAdmin: true } : u)
                                  );
                                } catch {
                                }
                              }}
                              className='text-xs'
                              style={{ color: 'var(--accent-primary)' }}
                            >
                              Make Admin
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

      {pagination.totalPages > 1 && (
        <div className='flex items-center justify-center gap-2 mt-6'>
          <button
            type='button'
            onClick={() => fetchUsers(pagination.page - 1, search)}
            disabled={pagination.page <= 1}
            className='btn-secondary'
          >
            Previous
          </button>
          {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((pageNum) => (
            <button
              key={pageNum}
              type='button'
              onClick={() => fetchUsers(pageNum, search)}
              className={pageNum === pagination.page ? 'btn-primary' : 'btn-secondary'}
              style={pageNum === pagination.page ? {} : {
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-primary)',
              }}
            >
              {pageNum}
            </button>
          ))}
          <button
            type='button'
            onClick={() => fetchUsers(pagination.page + 1, search)}
            disabled={pagination.page >= pagination.totalPages}
            className='btn-secondary'
          >
            Next
          </button>
        </div>
      )}

      {banDialog && (
        <div
          className='fixed inset-0 flex items-center justify-center z-50'
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <div className='card max-w-md w-full mx-4'>
            <h3 className='font-semibold mb-4' style={{ color: 'var(--text-primary)' }}>
              Ban User: {banDialog.user.displayName || banDialog.user.username}
            </h3>
            <div className='mb-4'>
              <label
                className='block text-sm font-medium mb-1'
                style={{ color: 'var(--text-secondary)' }}
              >
                Ban Reason *
              </label>
              <textarea
                value={banDialog.reason}
                onChange={(e) => setBanDialog({ ...banDialog, reason: e.target.value })}
                className='input-field'
                rows={3}
                placeholder='Enter reason for ban...'
                autoFocus
              />
            </div>
            <div className='flex gap-2 justify-end'>
              <button
                type='button'
                onClick={() => setBanDialog(null)}
                className='btn-secondary'
              >
                Cancel
              </button>
              <button
                type='button'
                onClick={() => handleBan(banDialog.user.id)}
                disabled={banDialog.processing || !banDialog.reason.trim()}
                className='btn-primary'
                style={{ backgroundColor: 'var(--error)' }}
              >
                {banDialog.processing ? 'Banning...' : 'Confirm Ban'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
