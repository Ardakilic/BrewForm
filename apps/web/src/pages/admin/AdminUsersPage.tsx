import { useEffect, useState } from 'react';
import { Link, useFetcher, useLoaderData, useLocation, useNavigation } from 'react-router';
import type { AdminUser } from '../../api/types.ts';
import { BanDialog } from '../../components/admin/BanDialog.tsx';
import { EmptyState } from '../../components/ui/EmptyState.tsx';
import { ErrorState } from '../../components/ui/ErrorState.tsx';
import { PaginationControls } from '../../components/ui/PaginationControls.tsx';
import { Skeleton } from '../../components/ui/Skeleton.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useActionFeedback } from '../../hooks/useActionFeedback.ts';
import { useBanUser } from '../../hooks/useBanUser.ts';
import { useDebouncedUrlText, useListUrlState } from '../../hooks/useListUrlState.ts';
import { formatDate } from '../../utils/format.ts';
import { parseAdminUsersParams } from '../../utils/list-parsers.ts';
import { createLogger } from '../../utils/logger.ts';
import type { action, loader } from './AdminUsersPage.data.ts';

const log = createLogger('AdminUsersPage');

/**
 * Admin page: paginated, searchable user list with ban dialog and links to detail/edit/create.
 * The search (`?q=`, debounced, replacing history) and page (`?page=`) live in the URL and the
 * rows come from the route loader (`AdminUsersPage.data.ts`). Admin-role changes submit the
 * `toggleAdmin` intent to the route action; ban/unban go through {@link useBanUser}, which
 * patches the row locally without re-fetching.
 */
export function AdminUsersPage() {
  const { t, locale } = useTranslation();
  const { users: loadedUsers, pagination } = useLoaderData<typeof loader>();
  const {
    state: { q },
    setPage,
  } = useListUrlState(parseAdminUsersParams);
  const searchInput = useDebouncedUrlText('q');
  const navigation = useNavigation();
  const location = useLocation();
  const loading =
    navigation.state === 'loading' && navigation.location?.pathname === location.pathname;
  const [banOverrides, setBanOverrides] = useState<Record<string, boolean>>({});
  const users = loadedUsers.map((u) =>
    u.id in banOverrides ? { ...u, isBanned: banOverrides[u.id] } : u,
  );
  const {
    banDialogUser,
    processing: banProcessing,
    error: banError,
    openBanDialog,
    confirmBan,
    unban,
    closeDialog,
  } = useBanUser((userId, isBanned) => {
    setBanOverrides((prev) => ({ ...prev, [userId]: isBanned }));
  });

  useEffect(() => {
    log.debug({}, 'AdminUsersPage mounted');
    return () => {
      log.debug({}, 'AdminUsersPage unmounted');
    };
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {t('admin.users.management')}
        </h1>
        <Link to="/admin/users/new" className="btn-primary">
          {t('admin.users.new')}
        </Link>
      </div>

      {banError && <ErrorState message={t(banError)} className="mb-4" />}

      <div className="mb-4 flex gap-2">
        <input
          type="search"
          placeholder={t('admin.users.searchPlaceholder')}
          aria-label={t('admin.users.searchPlaceholder')}
          value={searchInput.value}
          onChange={(e) => searchInput.setValue(e.target.value)}
          className="input-field flex-1"
        />
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height="3rem" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <EmptyState message={q ? t('admin.users.noSearchResults') : t('admin.users.noUsers')} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>
                  {t('auth.username')}
                </th>
                <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>
                  {t('auth.email')}
                </th>
                <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>
                  {t('admin.users.role')}
                </th>
                <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>
                  {t('admin.users.status')}
                </th>
                <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>
                  {t('admin.users.joined')}
                </th>
                <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                  <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>
                    <Link
                      to={`/admin/users/${user.id}`}
                      style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}
                    >
                      {user.displayName || user.username}
                    </Link>
                  </td>
                  <td className="py-2 px-3" style={{ color: 'var(--text-secondary)' }}>
                    {user.email}
                  </td>
                  <td className="py-2 px-3">
                    {user.isAdmin ? (
                      <span className="badge">{t('admin.users.adminBadge')}</span>
                    ) : (
                      t('admin.users.userRole')
                    )}
                  </td>
                  <td className="py-2 px-3">
                    {user.isBanned ? (
                      <span style={{ color: 'var(--error)' }}>{t('admin.users.banned')}</span>
                    ) : (
                      t('admin.users.active')
                    )}
                  </td>
                  <td className="py-2 px-3" style={{ color: 'var(--text-tertiary)' }}>
                    {formatDate(user.createdAt, locale)}
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex gap-2">
                      <Link
                        to={`/admin/users/${user.id}`}
                        className="text-xs"
                        style={{ color: 'var(--accent-primary)' }}
                      >
                        {t('common.view')}
                      </Link>
                      <Link
                        to={`/admin/users/${user.id}/edit`}
                        className="text-xs"
                        style={{ color: 'var(--accent-primary)' }}
                      >
                        {t('common.edit')}
                      </Link>
                      {user.isBanned ? (
                        <button
                          type="button"
                          onClick={() => unban(user.id)}
                          className="text-xs"
                          style={{ color: 'var(--success)' }}
                        >
                          {t('admin.users.unban')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openBanDialog(user)}
                          className="btn-danger-text text-xs"
                        >
                          {t('admin.users.ban')}
                        </button>
                      )}
                      <AdminRoleToggle user={user} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination.totalPages > 1 && (
        <PaginationControls
          page={pagination.page}
          totalPages={pagination.totalPages}
          onPageChange={setPage}
        />
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

/**
 * Grant/remove admin rights for one row through the route action's `toggleAdmin` intent
 * (its own fetcher, so rows can change independently). The list revalidates on success; a
 * failure toasts the matching i18n error.
 */
function AdminRoleToggle({ user }: { user: AdminUser }) {
  const { t } = useTranslation();
  const fetcher = useFetcher<typeof action>();
  useActionFeedback(fetcher, {
    errorKey: (data) =>
      data.isAdmin ? 'admin.users.makeAdminError' : 'admin.users.removeAdminError',
  });
  const pending = fetcher.formData?.get('isAdmin');
  const isAdmin = typeof pending === 'string' ? pending === 'true' : user.isAdmin;

  return (
    <button
      type="button"
      disabled={fetcher.state !== 'idle'}
      onClick={() =>
        fetcher.submit(
          { intent: 'toggleAdmin', userId: user.id, isAdmin: String(!isAdmin) },
          { method: 'post' },
        )
      }
      className="text-xs"
      style={{ color: isAdmin ? 'var(--warning)' : 'var(--accent-primary)' }}
    >
      {isAdmin ? t('admin.users.removeAdmin') : t('admin.users.makeAdmin')}
    </button>
  );
}
