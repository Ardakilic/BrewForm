import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { adminApi } from '../../api/index.ts';
import { createLogger } from '../../utils/logger.ts';
import { type AdminCreateUser, AdminCreateUserSchema } from '@brewform/shared/schemas';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { Field } from '../../components/form/Field.tsx';
import { ErrorState } from '../../components/ui/ErrorState.tsx';

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
      const data: AdminCreateUser = {
        email: form.email,
        username: form.username,
        password: form.password,
      };
      if (form.displayName) data.displayName = form.displayName;
      if (form.bio) data.bio = form.bio;
      if (form.isAdmin) data.isAdmin = true;
      if (form.isBanned) data.isBanned = true;
      await adminApi.createUser(data);
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

      {serverError && <ErrorState message={serverError} className='mb-4' />}

      <form onSubmit={handleSubmit} className='card max-w-lg'>
        <div className='space-y-4'>
          <Field label={t('auth.email')} htmlFor='email' required error={errors.email}>
            <input
              id='email'
              type='email'
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className='input-field'
            />
          </Field>

          <Field label={t('auth.username')} htmlFor='username' required error={errors.username}>
            <input
              id='username'
              type='text'
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className='input-field'
            />
          </Field>

          <Field label={t('auth.password')} htmlFor='password' required error={errors.password}>
            <input
              id='password'
              type='password'
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className='input-field'
            />
          </Field>

          <Field
            label={t('settings.displayName')}
            htmlFor='displayName'
            error={errors.displayName}
          >
            <input
              id='displayName'
              type='text'
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              className='input-field'
            />
          </Field>

          <Field label={t('common.bio')} htmlFor='bio' error={errors.bio}>
            <textarea
              id='bio'
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              className='input-field'
              rows={3}
            />
          </Field>

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
