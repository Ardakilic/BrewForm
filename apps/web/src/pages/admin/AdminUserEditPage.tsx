import { type AdminUpdateUser, AdminUpdateUserSchema } from '@brewform/shared/schemas';
import { useEffect, useState } from 'react';
import { Link, useFetcher, useLoaderData, useNavigate } from 'react-router';
import type { AdminUserDetail } from '../../api/types.ts';
import { Field } from '../../components/form/Field.tsx';
import { ErrorState } from '../../components/ui/ErrorState.tsx';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useActionFeedback } from '../../hooks/useActionFeedback.ts';
import { createLogger } from '../../utils/logger.ts';
import type { AdminUserEditSubmission, action, loader } from './AdminUserEditPage.data.ts';

const log = createLogger('AdminUserEditPage');

/** The edit form's field values, initialised from the loaded user. */
function formFromUser(user: AdminUserDetail) {
  return {
    email: user.email,
    username: user.username,
    password: '',
    displayName: user.displayName || '',
    bio: user.bio || '',
    isAdmin: user.isAdmin,
    isBanned: user.isBanned,
  };
}

/**
 * Admin page: edit-user form validated with `AdminUpdateUserSchema`; self-editing is
 * redirected away. The user comes from the `/admin/users/:id/edit` route loader (a missing
 * user renders the not-found page); the changed fields are submitted as the `update` intent
 * to the route action, and success redirects to the user detail after a short confirmation.
 */
export function AdminUserEditPage() {
  const { user } = useLoaderData<typeof loader>();
  const id = user.id;
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { t } = useTranslation();
  const fetcher = useFetcher<typeof action>();
  const saving = fetcher.state !== 'idle';

  const [serverError, setServerError] = useState('');
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState(() => formFromUser(user));
  const [errors, setErrors] = useState<Record<string, string>>({});

  useActionFeedback(fetcher, {
    onSuccess: () => {
      setSuccess(true);
      setTimeout(() => navigate(`/admin/users/${id}`), 1500);
    },
    onError: (data) => {
      if (data.ok) return;
      setServerError(
        data.error ||
          (data.code === 'CONFLICT'
            ? t('admin.users.conflictError')
            : t('admin.users.updateError')),
      );
    },
  });

  useEffect(() => {
    log.debug({}, 'AdminUserEditPage mounted');
    return () => {
      log.debug({}, 'AdminUserEditPage unmounted');
    };
  }, []);

  // Admins edit their own account in Settings, not here.
  useEffect(() => {
    if (currentUser && id === currentUser.id) {
      navigate('/admin/users', {
        state: {
          message: t('admin.users.selfEditRedirect'),
        },
      });
    }
  }, [id, currentUser, navigate, t]);

  // A different user loaded under the same mounted page: reset the form.
  useEffect(() => {
    setForm(formFromUser(user));
    setErrors({});
    setServerError('');
  }, [user]);

  function getDiff(): AdminUpdateUser | null {
    if (!user) return null;
    const data: AdminUpdateUser = {};
    if (form.email !== user.email) data.email = form.email;
    if (form.username !== user.username) data.username = form.username;
    if (form.password) data.password = form.password;
    if (form.displayName !== (user.displayName || '')) {
      data.displayName = form.displayName || undefined;
    }
    if (form.bio !== (user.bio || '')) data.bio = form.bio || undefined;
    if (form.isAdmin !== user.isAdmin) data.isAdmin = form.isAdmin;
    if (form.isBanned !== user.isBanned) data.isBanned = form.isBanned;
    return data;
  }

  function validate() {
    const diff = getDiff();
    if (!diff || Object.keys(diff).length === 0) {
      setServerError(t('admin.users.noChanges'));
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

  /** Validates the changed fields and submits them as the `update` intent. */
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (errs === null) return;
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setServerError('');
    const submission: AdminUserEditSubmission = { intent: 'update', data: getDiff() ?? {} };
    fetcher.submit(JSON.parse(JSON.stringify(submission)), {
      method: 'post',
      encType: 'application/json',
    });
  }

  if (success) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-4" style={{ color: 'var(--success)' }}>
          &#10003;
        </div>
        <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
          {t('admin.users.updateSuccess')}
        </h2>
        <p className="mt-2" style={{ color: 'var(--text-secondary)' }}>
          {t('admin.users.redirecting')}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link to={`/admin/users/${id}`} style={{ color: 'var(--accent-primary)' }}>
          {t('admin.users.backToUser')}
        </Link>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {t('admin.users.editUserTitle')} {user.displayName || user.username}
        </h1>
      </div>

      {serverError && <ErrorState message={serverError} className="mb-4" />}

      <form onSubmit={handleSubmit} className="card max-w-lg">
        <p className="text-xs mb-4" style={{ color: 'var(--text-tertiary)' }}>
          {t('admin.users.passwordHint')}
        </p>

        <div className="space-y-4">
          <Field label={t('auth.email')} htmlFor="email" error={errors.email}>
            <input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="input-field"
            />
          </Field>

          <Field label={t('auth.username')} htmlFor="username" error={errors.username}>
            <input
              id="username"
              type="text"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="input-field"
            />
          </Field>

          <Field label={t('admin.users.newPassword')} htmlFor="password" error={errors.password}>
            <input
              id="password"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="input-field"
              placeholder={t('admin.users.passwordPlaceholder')}
            />
          </Field>

          <Field label={t('settings.displayName')} htmlFor="displayName" error={errors.displayName}>
            <input
              id="displayName"
              type="text"
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              className="input-field"
            />
          </Field>

          <Field label={t('common.bio')} htmlFor="bio" error={errors.bio}>
            <textarea
              id="bio"
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              className="input-field"
              rows={3}
            />
          </Field>

          <div className="flex gap-6">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.isAdmin}
                onChange={(e) => setForm({ ...form, isAdmin: e.target.checked })}
              />
              <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                {t('admin.users.adminBadge')}
              </span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.isBanned}
                onChange={(e) => setForm({ ...form, isBanned: e.target.checked })}
              />
              <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                {t('admin.users.banned')}
              </span>
            </label>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? t('common.saving') : t('common.saveChanges')}
          </button>
          <Link to={`/admin/users/${id}`} className="btn-secondary">
            {t('common.cancel')}
          </Link>
        </div>
      </form>
    </div>
  );
}
