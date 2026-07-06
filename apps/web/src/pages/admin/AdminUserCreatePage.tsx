import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { adminApi } from '../../api/index.ts';
import { createLogger } from '../../utils/logger.ts';
import { AdminCreateUserSchema } from '@brewform/shared/schemas';
import { useTranslation } from '../../contexts/I18nContext.tsx';

const log = createLogger('AdminUserCreatePage');

/** Admin page: create-user form validated with `AdminCreateUserSchema`; redirects to the user list on success. */
export function AdminUserCreatePage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
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
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState('');

  useEffect(() => {
    log.debug({}, 'AdminUserCreatePage mounted');
    return () => {
      log.debug({}, 'AdminUserCreatePage unmounted');
    };
  }, []);

  function validate() {
    const result = AdminCreateUserSchema.safeParse(form);
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
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    setServerError('');
    try {
      const data: Record<string, unknown> = {
        email: form.email,
        username: form.username,
        password: form.password,
      };
      if (form.displayName) data.displayName = form.displayName;
      if (form.bio) data.bio = form.bio;
      if (form.isAdmin) data.isAdmin = true;
      if (form.isBanned) data.isBanned = true;
      await adminApi.createUser(data as Parameters<typeof adminApi.createUser>[0]);
      navigate('/admin/users');
    } catch (err: unknown) {
      const apiErr = err as { code?: string; message?: string };
      if (apiErr.code === 'CONFLICT') {
        setServerError(apiErr.message || t('admin.users.conflictError'));
      } else {
        setServerError(apiErr.message || t('admin.users.createError'));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className='flex items-center gap-4 mb-6'>
        <Link to='/admin/users' style={{ color: 'var(--accent-primary)' }}>
          {t('admin.users.backToUsersArrow')}
        </Link>
        <h1 className='text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>
          {t('admin.users.createUser')}
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
        <div className='space-y-4'>
          <div>
            <label
              className='block text-sm font-medium mb-1'
              style={{ color: 'var(--text-secondary)' }}
            >
              {t('auth.email')} *
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
              {t('auth.username')} *
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
              {t('auth.password')} *
            </label>
            <input
              type='password'
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className='input-field'
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
              {t('settings.displayName')}
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
              {t('common.bio')}
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
              <span className='text-sm' style={{ color: 'var(--text-primary)' }}>
                {t('admin.users.adminBadge')}
              </span>
            </label>
            <label className='flex items-center gap-2'>
              <input
                type='checkbox'
                checked={form.isBanned}
                onChange={(e) => setForm({ ...form, isBanned: e.target.checked })}
              />
              <span className='text-sm' style={{ color: 'var(--text-primary)' }}>
                {t('admin.users.banned')}
              </span>
            </label>
          </div>
        </div>

        <div className='flex gap-2 mt-6'>
          <button type='submit' className='btn-primary' disabled={saving}>
            {saving ? t('common.creating') : t('admin.users.createUser')}
          </button>
          <Link to='/admin/users' className='btn-secondary'>
            {t('common.cancel')}
          </Link>
        </div>
      </form>
    </div>
  );
}
