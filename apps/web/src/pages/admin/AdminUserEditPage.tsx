import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { adminApi, type AdminUserDetail } from '../../api/index.ts';
import { AdminUpdateUserSchema } from '@brewform/shared/schemas';

export function AdminUserEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [serverError, setServerError] = useState('');
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    email: '',
    username: '',
    password: '',
    displayName: '',
    bio: '',
    isAdmin: false,
    isBanned: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!id) return;
    if (currentUser && id === currentUser.id) {
      navigate('/admin/users', {
        state: {
          message:
            'You cannot edit your own account from the admin panel. Use Profile Settings instead.',
        },
      });
      return;
    }
    adminApi.getUserDetail(id).then((data) => {
      setUser(data);
      setForm({
        email: data.email,
        username: data.username,
        password: '',
        displayName: data.displayName || '',
        bio: data.bio || '',
        isAdmin: data.isAdmin,
        isBanned: data.isBanned,
      });
    }).catch(() => {
      setNotFound(true);
    }).finally(() => setLoading(false));
  }, [id, currentUser, navigate]);

  function getDiff() {
    if (!user) return null;
    const data: Record<string, unknown> = {};
    if (form.email !== user.email) data.email = form.email;
    if (form.username !== user.username) data.username = form.username;
    if (form.password) data.password = form.password;
    if (form.displayName !== (user.displayName || '')) data.displayName = form.displayName || null;
    if (form.bio !== (user.bio || '')) data.bio = form.bio || null;
    if (form.isAdmin !== user.isAdmin) data.isAdmin = form.isAdmin;
    if (form.isBanned !== user.isBanned) data.isBanned = form.isBanned;
    return data;
  }

  function validate() {
    const diff = getDiff();
    if (!diff || Object.keys(diff).length === 0) {
      setServerError('No changes to save.');
      return null;
    }
    const result = AdminUpdateUserSchema.safeParse(diff);
    if (result.success) return {};
    const errs: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0] as string;
      if (!errs[field]) errs[field] = issue.message;
    }
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (errs === null) return;
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    setServerError('');
    try {
      const diff = getDiff()!;
      await adminApi.updateUser(id!, diff as Parameters<typeof adminApi.updateUser>[1]);
      setSuccess(true);
      setTimeout(() => navigate(`/admin/users/${id}`), 1500);
    } catch (err: unknown) {
      const apiErr = err as { code?: string; message?: string };
      if (apiErr.code === 'CONFLICT') {
        setServerError(apiErr.message || 'Email or username already exists.');
      } else {
        setServerError(apiErr.message || 'Failed to update user.');
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className='space-y-4'>
        <div
          className='h-8 w-48 rounded animate-pulse'
          style={{ backgroundColor: 'var(--bg-tertiary)' }}
        />
        <div
          className='h-64 rounded animate-pulse'
          style={{ backgroundColor: 'var(--bg-tertiary)' }}
        />
      </div>
    );
  }

  if (notFound) {
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

  if (success) {
    return (
      <div className='text-center py-12'>
        <div className='text-4xl mb-4' style={{ color: 'var(--success)' }}>&#10003;</div>
        <h2 className='text-xl font-semibold' style={{ color: 'var(--text-primary)' }}>
          User Updated Successfully
        </h2>
        <p className='mt-2' style={{ color: 'var(--text-secondary)' }}>
          Redirecting to user detail...
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className='flex items-center gap-4 mb-6'>
        <Link to={`/admin/users/${id}`} style={{ color: 'var(--accent-primary)' }}>
          &larr; Back to User
        </Link>
        <h1 className='text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>
          Edit User: {user?.displayName || user?.username}
        </h1>
      </div>

      {serverError && (
        <div
          className='mb-4 p-3 rounded text-sm'
          style={{ backgroundColor: 'var(--error-bg, #fef2f2)', color: 'var(--error)' }}
        >
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit} className='card max-w-lg'>
        <p className='text-xs mb-4' style={{ color: 'var(--text-tertiary)' }}>
          Leave password blank to keep current password.
        </p>

        <div className='space-y-4'>
          <div>
            <label
              className='block text-sm font-medium mb-1'
              style={{ color: 'var(--text-secondary)' }}
            >
              Email
            </label>
            <input
              type='email'
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className='input-field'
            />
            {errors.email && (
              <p className='text-xs mt-1' style={{ color: 'var(--error)' }}>{errors.email}</p>
            )}
          </div>

          <div>
            <label
              className='block text-sm font-medium mb-1'
              style={{ color: 'var(--text-secondary)' }}
            >
              Username
            </label>
            <input
              type='text'
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className='input-field'
            />
            {errors.username && (
              <p className='text-xs mt-1' style={{ color: 'var(--error)' }}>{errors.username}</p>
            )}
          </div>

          <div>
            <label
              className='block text-sm font-medium mb-1'
              style={{ color: 'var(--text-secondary)' }}
            >
              New Password
            </label>
            <input
              type='password'
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className='input-field'
              placeholder='Leave blank to keep current'
            />
            {errors.password && (
              <p className='text-xs mt-1' style={{ color: 'var(--error)' }}>{errors.password}</p>
            )}
          </div>

          <div>
            <label
              className='block text-sm font-medium mb-1'
              style={{ color: 'var(--text-secondary)' }}
            >
              Display Name
            </label>
            <input
              type='text'
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              className='input-field'
            />
            {errors.displayName && (
              <p className='text-xs mt-1' style={{ color: 'var(--error)' }}>{errors.displayName}</p>
            )}
          </div>

          <div>
            <label
              className='block text-sm font-medium mb-1'
              style={{ color: 'var(--text-secondary)' }}
            >
              Bio
            </label>
            <textarea
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              className='input-field'
              rows={3}
            />
            {errors.bio && (
              <p className='text-xs mt-1' style={{ color: 'var(--error)' }}>{errors.bio}</p>
            )}
          </div>

          <div className='flex gap-6'>
            <label className='flex items-center gap-2'>
              <input
                type='checkbox'
                checked={form.isAdmin}
                onChange={(e) => setForm({ ...form, isAdmin: e.target.checked })}
              />
              <span className='text-sm' style={{ color: 'var(--text-primary)' }}>Admin</span>
            </label>
            <label className='flex items-center gap-2'>
              <input
                type='checkbox'
                checked={form.isBanned}
                onChange={(e) => setForm({ ...form, isBanned: e.target.checked })}
              />
              <span className='text-sm' style={{ color: 'var(--text-primary)' }}>Banned</span>
            </label>
          </div>
        </div>

        <div className='flex gap-2 mt-6'>
          <button type='submit' className='btn-primary' disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <Link to={`/admin/users/${id}`} className='btn-secondary'>
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
