import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { adminApi, type AdminUserDetail } from '../../api/index.ts';

export function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [banDialog, setBanDialog] = useState<
    {
      reason: string;
      processing: boolean;
    } | null
  >(null);

  useEffect(() => {
    if (!id) return;
    adminApi.getUserDetail(id).then((data) => {
      setUser(data);
    }).catch((err) => {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        setNotFound(true);
      } else {
        setLoadError(true);
      }
    }).finally(() => setLoading(false));
  }, [id]);

  async function handleBan() {
    if (!banDialog || !banDialog.reason.trim() || !id) return;
    setBanDialog({ ...banDialog, processing: true });
    try {
      await adminApi.banUser(id, banDialog.reason);
      setUser((prev) => prev ? { ...prev, isBanned: true } : prev);
      setBanDialog(null);
    } catch {
      setBanDialog({ ...banDialog, processing: false });
    }
  }

  async function handleUnban() {
    if (!id) return;
    try {
      await adminApi.unbanUser(id);
      setUser((prev) => prev ? { ...prev, isBanned: false } : prev);
    } catch {}
  }

  async function handleDelete() {
    if (
      !id ||
      !globalThis.confirm(
        'Are you sure you want to delete this user? This action cannot be undone.',
      )
    ) return;
    try {
      await adminApi.deleteUser(id);
      navigate('/admin/users');
    } catch {}
  }

  if (loading) {
    return (
      <div className='space-y-4'>
        <div
          className='h-8 w-48 rounded animate-pulse'
          style={{ backgroundColor: 'var(--bg-tertiary)' }}
        />
        <div
          className='h-48 rounded animate-pulse'
          style={{ backgroundColor: 'var(--bg-tertiary)' }}
        />
        <div
          className='h-24 rounded animate-pulse'
          style={{ backgroundColor: 'var(--bg-tertiary)' }}
        />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className='text-center py-12'>
        <h2 className='text-xl font-semibold' style={{ color: 'var(--text-primary)' }}>
          Failed to Load
        </h2>
        <p className='mt-2' style={{ color: 'var(--text-secondary)' }}>
          An error occurred while loading the user details. Please try again.
        </p>
        <Link to='/admin/users' className='btn-primary mt-4 inline-block'>
          Back to Users
        </Link>
      </div>
    );
  }

  if (notFound || !user) {
    return (
      <div className='text-center py-12'>
        <h2 className='text-xl font-semibold' style={{ color: 'var(--text-primary)' }}>
          User Not Found
        </h2>
        <p className='mt-2' style={{ color: 'var(--text-secondary)' }}>
          The requested user could not be found.
        </p>
        <Link to='/admin/users' className='btn-primary mt-4 inline-block'>
          Back to Users
        </Link>
      </div>
    );
  }

  const isSelf = currentUser?.id === id;

  return (
    <div>
      <div className='flex items-center gap-4 mb-6'>
        <Link to='/admin/users' style={{ color: 'var(--accent-primary)' }}>
          &larr; Back to Users
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
          This is your own account. Use{' '}
          <Link to='/settings' style={{ color: 'var(--accent-primary)' }}>
            Profile Settings
          </Link>{' '}
          to edit your profile.
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
                <span className='text-xs' style={{ color: 'var(--text-tertiary)' }}>Email</span>
                <p style={{ color: 'var(--text-primary)' }}>{user.email}</p>
              </div>
              <div>
                <span className='text-xs' style={{ color: 'var(--text-tertiary)' }}>Username</span>
                <p style={{ color: 'var(--text-primary)' }}>{user.username}</p>
              </div>
              <div>
                <span className='text-xs' style={{ color: 'var(--text-tertiary)' }}>
                  Display Name
                </span>
                <p style={{ color: 'var(--text-primary)' }}>{user.displayName || '-'}</p>
              </div>
              <div>
                <span className='text-xs' style={{ color: 'var(--text-tertiary)' }}>Bio</span>
                <p style={{ color: 'var(--text-primary)' }}>{user.bio || '-'}</p>
              </div>
              <div>
                <span className='text-xs' style={{ color: 'var(--text-tertiary)' }}>Role</span>
                <p style={{ color: 'var(--text-primary)' }}>
                  {user.isAdmin ? <span className='badge'>Admin</span> : 'User'}
                </p>
              </div>
              <div>
                <span className='text-xs' style={{ color: 'var(--text-tertiary)' }}>Status</span>
                <p style={{ color: 'var(--text-primary)' }}>
                  {user.isBanned ? <span style={{ color: 'var(--error)' }}>Banned</span> : 'Active'}
                </p>
              </div>
              <div>
                <span className='text-xs' style={{ color: 'var(--text-tertiary)' }}>Joined</span>
                <p style={{ color: 'var(--text-primary)' }}>
                  {new Date(user.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div>
                <span className='text-xs' style={{ color: 'var(--text-tertiary)' }}>
                  Last Updated
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
        <h3 className='font-semibold mb-4' style={{ color: 'var(--text-primary)' }}>Stats</h3>
        <div className='grid grid-cols-3 gap-4 text-center'>
          <div>
            <div className='text-2xl font-bold' style={{ color: 'var(--accent-primary)' }}>
              {user.recipeCount ?? '-'}
            </div>
            <div className='text-sm' style={{ color: 'var(--text-secondary)' }}>Recipes</div>
          </div>
          <div>
            <div className='text-2xl font-bold' style={{ color: 'var(--accent-primary)' }}>
              {user.followerCount ?? '-'}
            </div>
            <div className='text-sm' style={{ color: 'var(--text-secondary)' }}>Followers</div>
          </div>
          <div>
            <div className='text-2xl font-bold' style={{ color: 'var(--accent-primary)' }}>
              {user.followingCount ?? '-'}
            </div>
            <div className='text-sm' style={{ color: 'var(--text-secondary)' }}>Following</div>
          </div>
        </div>
      </div>

      <div className='flex gap-3'>
        {!isSelf && (
          <>
            <Link to={`/admin/users/${id}/edit`} className='btn-primary'>
              Edit User
            </Link>
            {user.isBanned
              ? (
                <button type='button' onClick={handleUnban} className='btn-secondary'>
                  Unban User
                </button>
              )
              : (
                <button
                  type='button'
                  onClick={() => setBanDialog({ reason: '', processing: false })}
                  className='btn-secondary'
                  style={{ color: 'var(--error)' }}
                >
                  Ban User
                </button>
              )}
            <button
              type='button'
              onClick={handleDelete}
              className='btn-secondary'
              style={{ color: 'var(--error)' }}
            >
              Delete User
            </button>
          </>
        )}
      </div>

      {banDialog && (
        <div
          className='fixed inset-0 flex items-center justify-center z-50'
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <div className='card max-w-md w-full mx-4'>
            <h3 className='font-semibold mb-4' style={{ color: 'var(--text-primary)' }}>
              Ban User: {user.displayName || user.username}
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
                onClick={handleBan}
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
