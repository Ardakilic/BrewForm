import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { adminApi, type AdminUserDetail } from '../../api/index.ts';
import { BanDialog } from '../../components/admin/BanDialog.tsx';
import { useBanUser } from '../../hooks/useBanUser.ts';
import { createLogger } from '../../utils/logger.ts';
import { Skeleton } from '../../components/ui/Skeleton.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';

const log = createLogger('AdminUserDetailPage');

/** Admin page: single-user detail view with ban/unban dialog and delete/edit actions. */
export function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const {
    banDialogUser,
    processing: banProcessing,
    error: banError,
    openBanDialog,
    confirmBan,
    unban,
    closeDialog,
  } = useBanUser((_userId, isBanned) => {
    setUser((prev) => prev ? { ...prev, isBanned } : prev);
  });

  useEffect(() => {
    log.debug({}, 'AdminUserDetailPage mounted');
    return () => {
      log.debug({}, 'AdminUserDetailPage unmounted');
    };
  }, []);

  useEffect(() => {
    if (!id) return;
    adminApi.getUserDetail(id).then((data) => {
      setUser(data);
    }).catch((err) => {
      log.error({ err }, 'AdminUserDetailPage loadData failed');
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        setNotFound(true);
      } else {
        setLoadError(true);
      }
    }).finally(() => setLoading(false));
  }, [id]);

  async function handleDelete() {
    if (
      !id ||
      !globalThis.confirm(t('admin.users.deleteConfirm'))
    ) return;
    try {
      await adminApi.deleteUser(id);
      navigate('/admin/users');
    } catch {}
  }

  if (loading) {
    return (
      <div className='space-y-4'>
        <Skeleton height='2rem' width='12rem' />
        <Skeleton height='12rem' />
        <Skeleton height='6rem' />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className='text-center py-12'>
        <h2 className='text-xl font-semibold' style={{ color: 'var(--text-primary)' }}>
          {t('admin.users.loadFailedTitle')}
        </h2>
        <p className='mt-2' style={{ color: 'var(--text-secondary)' }}>
          {t('admin.users.loadFailedMessage')}
        </p>
        <Link to='/admin/users' className='btn-primary mt-4 inline-block'>
          {t('admin.users.backToUsers')}
        </Link>
      </div>
    );
  }

  if (notFound || !user) {
    return (
      <div className='text-center py-12'>
        <h2 className='text-xl font-semibold' style={{ color: 'var(--text-primary)' }}>
          {t('admin.users.notFoundTitle')}
        </h2>
        <p className='mt-2' style={{ color: 'var(--text-secondary)' }}>
          {t('admin.users.notFoundMessage')}
        </p>
        <Link to='/admin/users' className='btn-primary mt-4 inline-block'>
          {t('admin.users.backToUsers')}
        </Link>
      </div>
    );
  }

  const isSelf = currentUser?.id === id;

  return (
    <div>
      <div className='flex items-center gap-4 mb-6'>
        <Link to='/admin/users' style={{ color: 'var(--accent-primary)' }}>
          {t('admin.users.backToUsersArrow')}
        </Link>
        <h1 className='text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>
          {user.displayName || user.username}
        </h1>
      </div>

      {isSelf && (
        <div
          className='mb-4 p-3 rounded text-sm'
          style={{ backgroundColor: 'var(--warning-bg, #fffbeb)', color: 'var(--warning)' }}
        >
          {t('admin.users.selfEditPrefix')}{' '}
          <Link to='/settings' style={{ color: 'var(--accent-primary)' }}>
            {t('admin.users.profileSettings')}
          </Link>{' '}
          {t('admin.users.selfEditSuffix')}
        </div>
      )}

      <div className='card mb-6'>
        <div className='flex items-start gap-6'>
          {user.avatarUrl
            ? (
              <img
                src={user.avatarUrl}
                alt={`${user.displayName || user.username}'s avatar`}
                className='w-20 h-20 rounded-full object-cover'
                loading='lazy'
                width={80}
                height={80}
              />
            )
            : (
              <div
                className='w-20 h-20 rounded-full flex items-center justify-center text-2xl'
                style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
              >
                {(user.displayName || user.username)[0].toUpperCase()}
              </div>
            )}
          <div className='flex-1'>
            <div className='grid grid-cols-2 gap-4'>
              <div>
                <span className='text-xs' style={{ color: 'var(--text-tertiary)' }}>
                  {t('auth.email')}
                </span>
                <p style={{ color: 'var(--text-primary)' }}>{user.email}</p>
              </div>
              <div>
                <span className='text-xs' style={{ color: 'var(--text-tertiary)' }}>
                  {t('auth.username')}
                </span>
                <p style={{ color: 'var(--text-primary)' }}>{user.username}</p>
              </div>
              <div>
                <span className='text-xs' style={{ color: 'var(--text-tertiary)' }}>
                  {t('settings.displayName')}
                </span>
                <p style={{ color: 'var(--text-primary)' }}>{user.displayName || '-'}</p>
              </div>
              <div>
                <span className='text-xs' style={{ color: 'var(--text-tertiary)' }}>
                  {t('common.bio')}
                </span>
                <p style={{ color: 'var(--text-primary)' }}>{user.bio || '-'}</p>
              </div>
              <div>
                <span className='text-xs' style={{ color: 'var(--text-tertiary)' }}>
                  {t('admin.users.role')}
                </span>
                <p style={{ color: 'var(--text-primary)' }}>
                  {user.isAdmin
                    ? <span className='badge'>{t('admin.users.adminBadge')}</span>
                    : t('admin.users.userRole')}
                </p>
              </div>
              <div>
                <span className='text-xs' style={{ color: 'var(--text-tertiary)' }}>
                  {t('admin.users.status')}
                </span>
                <p style={{ color: 'var(--text-primary)' }}>
                  {user.isBanned
                    ? <span style={{ color: 'var(--error)' }}>{t('admin.users.banned')}</span>
                    : t('admin.users.active')}
                </p>
              </div>
              <div>
                <span className='text-xs' style={{ color: 'var(--text-tertiary)' }}>
                  {t('admin.users.joined')}
                </span>
                <p style={{ color: 'var(--text-primary)' }}>
                  {new Date(user.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div>
                <span className='text-xs' style={{ color: 'var(--text-tertiary)' }}>
                  {t('admin.users.lastUpdated')}
                </span>
                <p style={{ color: 'var(--text-primary)' }}>
                  {new Date(user.updatedAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className='card mb-6'>
        <h3 className='font-semibold mb-4' style={{ color: 'var(--text-primary)' }}>
          {t('admin.users.stats')}
        </h3>
        <div className='grid grid-cols-3 gap-4 text-center'>
          <div>
            <div className='text-2xl font-bold' style={{ color: 'var(--accent-primary)' }}>
              {user.recipeCount ?? '-'}
            </div>
            <div className='text-sm' style={{ color: 'var(--text-secondary)' }}>
              {t('user.recipes')}
            </div>
          </div>
          <div>
            <div className='text-2xl font-bold' style={{ color: 'var(--accent-primary)' }}>
              {user.followerCount ?? '-'}
            </div>
            <div className='text-sm' style={{ color: 'var(--text-secondary)' }}>
              {t('user.followers')}
            </div>
          </div>
          <div>
            <div className='text-2xl font-bold' style={{ color: 'var(--accent-primary)' }}>
              {user.followingCount ?? '-'}
            </div>
            <div className='text-sm' style={{ color: 'var(--text-secondary)' }}>
              {t('user.following')}
            </div>
          </div>
        </div>
      </div>

      {banError && (
        <div
          className='mb-4 p-3 rounded text-sm'
          style={{ backgroundColor: 'var(--error-bg, #fef2f2)', color: 'var(--error)' }}
        >
          {t(banError)}
        </div>
      )}

      <div className='flex gap-3'>
        {!isSelf && (
          <>
            <Link to={`/admin/users/${id}/edit`} className='btn-primary'>
              {t('admin.users.editUser')}
            </Link>
            {user.isBanned
              ? (
                <button type='button' onClick={() => unban(id!)} className='btn-secondary'>
                  {t('admin.unbanUser')}
                </button>
              )
              : (
                <button
                  type='button'
                  onClick={() =>
                    openBanDialog({
                      id: id!,
                      username: user.username,
                      displayName: user.displayName,
                    })}
                  className='btn-secondary'
                  style={{ color: 'var(--error)' }}
                >
                  {t('admin.banUser')}
                </button>
              )}
            <button
              type='button'
              onClick={handleDelete}
              className='btn-secondary'
              style={{ color: 'var(--error)' }}
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
