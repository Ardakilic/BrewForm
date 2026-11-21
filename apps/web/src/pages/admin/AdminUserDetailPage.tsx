import { useEffect, useState } from 'react';
import { Link, useFetcher, useLoaderData, useNavigate } from 'react-router';
import { BanDialog } from '../../components/admin/BanDialog.tsx';
import { Breadcrumb } from '../../components/ui/Breadcrumb.tsx';
import { ErrorState } from '../../components/ui/ErrorState.tsx';
import { useConfirm } from '../../components/ui/Modal.tsx';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useActionFeedback } from '../../hooks/useActionFeedback.ts';
import { useBanUser } from '../../hooks/useBanUser.ts';
import { formatDate } from '../../utils/format.ts';
import { createLogger } from '../../utils/logger.ts';
import type { action, loader } from './AdminUserDetailPage.data.ts';

const log = createLogger('AdminUserDetailPage');

/**
 * Admin page: single-user detail view with ban/unban dialog and delete/edit actions. The user
 * comes from the `/admin/users/:id` route loader (a missing user renders the not-found page,
 * a failed load the route error state inside `AdminLayout`). Delete submits the `delete`
 * intent to the route action; ban/unban go through {@link useBanUser}, which patches the
 * status locally without re-fetching.
 */
export function AdminUserDetailPage() {
  const { user: loadedUser } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { t, locale } = useTranslation();
  const { confirm } = useConfirm();
  const deleteFetcher = useFetcher<typeof action>();
  const [bannedOverride, setBannedOverride] = useState<boolean | null>(null);
  const user = {
    ...loadedUser,
    isBanned: bannedOverride ?? loadedUser.isBanned,
  };
  const id = user.id;
  const {
    banDialogUser,
    processing: banProcessing,
    error: banError,
    openBanDialog,
    confirmBan,
    unban,
    closeDialog,
  } = useBanUser((_userId, isBanned) => {
    setBannedOverride(isBanned);
  });

  useActionFeedback(deleteFetcher, {
    errorKey: 'admin.users.deleteFailed',
    onSuccess: () => navigate('/admin/users'),
  });

  useEffect(() => {
    log.debug({}, 'AdminUserDetailPage mounted');
    return () => {
      log.debug({}, 'AdminUserDetailPage unmounted');
    };
  }, []);

  /** Confirms, then submits the `delete` intent; success returns to the user list. */
  async function handleDelete() {
    if (
      !(await confirm({
        titleKey: 'common.confirmDelete',
        bodyKey: 'admin.users.deleteConfirm',
        danger: true,
      }))
    )
      return;
    deleteFetcher.submit({ intent: 'delete' }, { method: 'post' });
  }

  const isSelf = currentUser?.id === id;

  return (
    <div>
      <div className="mb-6">
        <div className="mb-2">
          <Breadcrumb
            items={[
              { label: t('admin.users.management'), to: '/admin/users' },
              { label: user.displayName || user.username },
            ]}
          />
        </div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {user.displayName || user.username}
        </h1>
      </div>

      {isSelf && (
        <div
          className="mb-4 p-3 rounded text-sm"
          style={{ backgroundColor: 'var(--warning-bg, #fffbeb)', color: 'var(--warning)' }}
        >
          {t('admin.users.selfEditPrefix')}{' '}
          <Link to="/settings" style={{ color: 'var(--accent-primary)' }}>
            {t('admin.users.profileSettings')}
          </Link>{' '}
          {t('admin.users.selfEditSuffix')}
        </div>
      )}

      <div className="card mb-6">
        <div className="flex items-start gap-6">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={t('a11y.userAvatar').replace('{name}', user.displayName || user.username)}
              className="w-20 h-20 rounded-full object-cover"
              loading="lazy"
              width={80}
              height={80}
            />
          ) : (
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center text-2xl"
              style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
            >
              {(user.displayName || user.username)[0].toUpperCase()}
            </div>
          )}
          <div className="flex-1">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {t('auth.email')}
                </span>
                <p style={{ color: 'var(--text-primary)' }}>{user.email}</p>
              </div>
              <div>
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {t('auth.username')}
                </span>
                <p style={{ color: 'var(--text-primary)' }}>{user.username}</p>
              </div>
              <div>
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {t('settings.displayName')}
                </span>
                <p style={{ color: 'var(--text-primary)' }}>{user.displayName || '-'}</p>
              </div>
              <div>
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {t('common.bio')}
                </span>
                <p style={{ color: 'var(--text-primary)' }}>{user.bio || '-'}</p>
              </div>
              <div>
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {t('admin.users.role')}
                </span>
                <p style={{ color: 'var(--text-primary)' }}>
                  {user.isAdmin ? (
                    <span className="badge">{t('admin.users.adminBadge')}</span>
                  ) : (
                    t('admin.users.userRole')
                  )}
                </p>
              </div>
              <div>
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {t('admin.users.status')}
                </span>
                <p style={{ color: 'var(--text-primary)' }}>
                  {user.isBanned ? (
                    <span style={{ color: 'var(--error)' }}>{t('admin.users.banned')}</span>
                  ) : (
                    t('admin.users.active')
                  )}
                </p>
              </div>
              <div>
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {t('admin.users.joined')}
                </span>
                <p style={{ color: 'var(--text-primary)' }}>{formatDate(user.createdAt, locale)}</p>
              </div>
              <div>
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {t('admin.users.lastUpdated')}
                </span>
                <p style={{ color: 'var(--text-primary)' }}>{formatDate(user.updatedAt, locale)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card mb-6">
        <h3 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          {t('admin.users.stats')}
        </h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold" style={{ color: 'var(--accent-primary)' }}>
              {user.recipeCount ?? '-'}
            </div>
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {t('user.recipes')}
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold" style={{ color: 'var(--accent-primary)' }}>
              {user.followerCount ?? '-'}
            </div>
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {t('user.followers')}
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold" style={{ color: 'var(--accent-primary)' }}>
              {user.followingCount ?? '-'}
            </div>
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {t('user.following')}
            </div>
          </div>
        </div>
      </div>

      {banError && <ErrorState message={t(banError)} className="mb-4" />}

      <div className="flex gap-3">
        {!isSelf && (
          <>
            <Link to={`/admin/users/${id}/edit`} className="btn-primary">
              {t('admin.users.editUser')}
            </Link>
            {user.isBanned ? (
              <button type="button" onClick={() => unban(id)} className="btn-secondary">
                {t('admin.unbanUser')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() =>
                  openBanDialog({
                    id,
                    username: user.username,
                    displayName: user.displayName,
                  })
                }
                className="btn-danger-text"
              >
                {t('admin.banUser')}
              </button>
            )}
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteFetcher.state !== 'idle'}
              className="btn-danger-text"
            >
              {t('admin.users.deleteUser')}
            </button>
          </>
        )}
      </div>

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
