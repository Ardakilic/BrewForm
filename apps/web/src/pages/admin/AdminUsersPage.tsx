import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { adminApi, type AdminUser } from '../../api/index.ts';
import { BanDialog } from '../../components/admin/BanDialog.tsx';
import { useBanUser } from '../../hooks/useBanUser.ts';
import { createLogger } from '../../utils/logger.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';

const log = createLogger('AdminUsersPage');

interface PaginationState {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

/** Admin page: paginated, searchable user list with ban dialog and links to detail/edit/create. */
export function AdminUsersPage() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    perPage: 20,
    total: 0,
    totalPages: 0,
  });
  const [error, setError] = useState('');
  const {
    banDialogUser,
    processing: banProcessing,
    error: banError,
    openBanDialog,
    confirmBan,
    unban,
    closeDialog,
  } = useBanUser((userId, isBanned) => {
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, isBanned } : u));
  });

  useEffect(() => {
    log.debug({}, 'AdminUsersPage mounted');
    return () => {
      log.debug({}, 'AdminUsersPage unmounted');
    };
  }, []);

  function fetchUsers(page: number, q: string) {
    setLoading(true);
    setError('');
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
    }).catch((err) => {
      log.error({ err }, 'AdminUsersPage fetchUsers failed');
      setError((err as { message?: string })?.message || t('admin.users.loadError'));
      setUsers([]);
      setPagination((prev) => ({ ...prev, page: 1, total: 0, totalPages: 0 }));
    }).finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchUsers(1, search);
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    fetchUsers(1, search);
  }

  return (
    <div>
      <div className='flex items-center justify-between mb-6'>
        <h1 className='text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>
          {t('admin.users.management')}
        </h1>
        <Link to='/admin/users/new' className='btn-primary'>
          {t('admin.users.new')}
        </Link>
      </div>

      {error && (
        <div
          className='mb-4 p-3 rounded text-sm'
          style={{ backgroundColor: 'var(--error-bg, #fef2f2)', color: 'var(--error)' }}
        >
          {error}
        </div>
      )}

      {banError && (
        <div
          className='mb-4 p-3 rounded text-sm'
          style={{ backgroundColor: 'var(--error-bg, #fef2f2)', color: 'var(--error)' }}
        >
          {banError}
        </div>
      )}

      <form onSubmit={handleSearch} className='mb-4 flex gap-2'>
        <input
          type='text'
          placeholder={t('admin.users.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className='input-field flex-1'
        />
        <button type='submit' className='btn-secondary'>
          {t('common.search')}
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
            {search ? t('admin.users.noSearchResults') : t('admin.users.noUsers')}
          </div>
        )
        : (
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                  <th className='text-left py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                    {t('auth.username')}
                  </th>
                  <th className='text-left py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                    {t('auth.email')}
                  </th>
                  <th className='text-left py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                    {t('admin.users.role')}
                  </th>
                  <th className='text-left py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                    {t('admin.users.status')}
                  </th>
                  <th className='text-left py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                    {t('admin.users.joined')}
                  </th>
                  <th className='text-left py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                    {t('common.actions')}
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
                      {user.isAdmin
                        ? <span className='badge'>{t('admin.users.adminBadge')}</span>
                        : t('admin.users.userRole')}
                    </td>
                    <td className='py-2 px-3'>
                      {user.isBanned
                        ? <span style={{ color: 'var(--error)' }}>{t('admin.users.banned')}</span>
                        : t('admin.users.active')}
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
                          {t('common.view')}
                        </Link>
                        <Link
                          to={`/admin/users/${user.id}/edit`}
                          className='text-xs'
                          style={{ color: 'var(--accent-primary)' }}
                        >
                          {t('common.edit')}
                        </Link>
                        {user.isBanned
                          ? (
                            <button
                              type='button'
                              onClick={() => unban(user.id)}
                              className='text-xs'
                              style={{ color: 'var(--success)' }}
                            >
                              {t('admin.users.unban')}
                            </button>
                          )
                          : (
                            <button
                              type='button'
                              onClick={() => openBanDialog(user)}
                              className='text-xs'
                              style={{ color: 'var(--error)' }}
                            >
                              {t('admin.users.ban')}
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
                                } catch (err) {
                                  setError(
                                    (err as { message?: string })?.message ||
                                      t('admin.users.removeAdminError'),
                                  );
                                }
                              }}
                              className='text-xs'
                              style={{ color: 'var(--warning)' }}
                            >
                              {t('admin.users.removeAdmin')}
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
                                } catch (err) {
                                  setError(
                                    (err as { message?: string })?.message ||
                                      t('admin.users.makeAdminError'),
                                  );
                                }
                              }}
                              className='text-xs'
                              style={{ color: 'var(--accent-primary)' }}
                            >
                              {t('admin.users.makeAdmin')}
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
            {t('common.previous')}
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
            {t('common.next')}
          </button>
        </div>
      )}

      {banDialogUser && (
        <BanDialog
          user={banDialogUser}
          open={!!banDialogUser}
          onClose={closeDialog}
          onConfirm={confirmBan}
          processing={banProcessing}
        />
      )}
    </div>
  );
}
