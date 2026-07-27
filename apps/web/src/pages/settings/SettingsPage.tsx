import { useEffect, useState } from 'react';
import { useLoaderData, useNavigate } from 'react-router';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTheme } from '../../contexts/ThemeContext.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useConfirm } from '../../components/ui/Modal.tsx';
import { ErrorState } from '../../components/ui/ErrorState.tsx';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { Field } from '../../components/form/Field.tsx';
import { Section } from '../../components/form/Section.tsx';
import { api } from '../../api/client.ts';
import { createLogger } from '@/utils/logger.ts';
import type { UserPreferences, UserPreferencesOutput } from '@brewform/shared/schemas';

/** Convert the flat GET response to the nested request shape used by the form. */
function toUserPreferences(out: UserPreferencesOutput): UserPreferences {
  return {
    unitSystem: out.unitSystem as UserPreferences['unitSystem'],
    temperatureUnit: out.temperatureUnit as UserPreferences['temperatureUnit'],
    theme: out.theme as UserPreferences['theme'],
    locale: out.locale,
    timezone: out.timezone,
    dateFormat: out.dateFormat as UserPreferences['dateFormat'],
    emailNotifications: {
      newFollower: out.newFollower,
      recipeLiked: out.recipeLiked,
      recipeCommented: out.recipeCommented,
      followedUserPosted: out.followedUserPosted,
      mentionedInComment: out.mentionedInComment,
    },
  };
}

const log = createLogger('SettingsPage');

/** Fetches the current user's stored preferences; returns `{ preferences }`. */
export const loader = async () => {
  const out = await api.get<UserPreferencesOutput>('/preferences');
  return { preferences: toUserPreferences(out) };
};

/**
 * Account settings page: read-only profile info, theme/locale pickers,
 * unit/timezone/date-format and email-notification preferences saved via
 * PATCH `/preferences`, plus account deletion.
 */
export function SettingsPage() {
  const { user, refreshUser, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { locale, setLocale, availableLocales, t } = useTranslation();
  const { confirm } = useConfirm();
  const navigate = useNavigate();
  const { preferences } = useLoaderData<typeof loader>();
  const [prefs, setPrefs] = useState<UserPreferences>(preferences);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | null>(null);

  useEffect(() => {
    log.debug({}, 'SettingsPage mounted');
    return () => {
      log.debug({}, 'SettingsPage unmounted');
    };
  }, []);

  /**
   * Persist preferences to the server and refresh the local user state.
   *
   * The PATCH save and the `refreshUser()` call are decoupled:
   * - Preferences are committed to the DB regardless of refresh success
   * - A failed refresh does not log the user out or affect the save UI
   */
  async function savePreferences() {
    if (!prefs) return;
    setSaving(true);
    setMessage('');
    setMessageType(null);
    try {
      await api.patch('/preferences', {
        unitSystem: prefs.unitSystem,
        temperatureUnit: prefs.temperatureUnit,
        locale: prefs.locale,
        timezone: prefs.timezone,
        dateFormat: prefs.dateFormat,
        emailNotifications: prefs.emailNotifications,
      });
      setMessage(t('settings.savedMsg'));
      setMessageType('success');
    } catch {
      setMessage(t('settings.failedMsg'));
      setMessageType('error');
    } finally {
      setSaving(false);
    }
    // Refresh user state independently from save success/failure.
    // Preferences are already persisted in the DB — a failed read-after-write
    // refresh should not log the user out or affect the save UI message.
    try {
      await refreshUser();
    } catch (err) {
      log.error({ err }, 'savePreferences refresh failed');
    }
  }

  /**
   * Delete the current user's account and clean up frontend state.
   *
   * Calls {@link logout} to clear {@link AuthContext} (sets user to {@code null}, then
   * attempts the server-side logout endpoint — expected to fail since the account is
   * already deleted, but the local state cleanup always runs). Then calls
   * {@link navigate} to redirect to the public home page ({@code /}).
   *
   * On failure the error is logged and a user-facing error message is displayed via the
   * shared banner. The auth state is preserved so the user can retry.
   */
  async function handleDeleteAccount() {
    if (
      !await confirm({
        titleKey: 'common.confirmDelete',
        bodyKey: 'settings.deleteConfirm',
        danger: true,
      })
    ) return;
    setMessage('');
    setMessageType(null);
    try {
      await api.delete('/users/me');
      await logout();
      navigate('/');
    } catch (err) {
      log.error({ err }, 'Account deletion failed');
      setMessage(t('settings.deleteFailed'));
      setMessageType('error');
    }
  }

  if (!user) return null;

  return (
    <div className='mx-auto max-w-2xl px-6 py-8'>
      <SEOHead title={t('settings.title')} />

      <h1 className='text-2xl font-bold mb-6' style={{ color: 'var(--text-primary)' }}>
        {t('settings.title')}
      </h1>

      {message && (
        messageType === 'error' ? <ErrorState message={message} className='mb-4' /> : (
          <div
            className='mb-4 rounded p-3 text-sm'
            style={{ backgroundColor: 'var(--success)', color: 'white' }}
          >
            {message}
          </div>
        )
      )}

      <div className='space-y-6'>
        <Section title={t('settings.profile')}>
          <div className='space-y-3'>
            <Field label={t('settings.displayName')}>
              <span className='text-sm' style={{ color: 'var(--text-primary)' }}>
                {user.displayName || t('settings.notSet')}
              </span>
            </Field>
            <Field label={t('auth.username')}>
              <span className='text-sm' style={{ color: 'var(--text-primary)' }}>
                @{user.username}
              </span>
            </Field>
            <Field label={t('auth.email')}>
              <span className='text-sm' style={{ color: 'var(--text-primary)' }}>{user.email}</span>
            </Field>
          </div>
        </Section>

        <Section title={t('settings.appearance')}>
          <div className='space-y-3'>
            <Field label={t('preferences.theme')}>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'coffee')}
                className='input-field w-auto'
              >
                <option value='light'>{t('theme.light')}</option>
                <option value='dark'>{t('theme.dark')}</option>
                <option value='coffee'>{t('theme.coffee')}</option>
              </select>
            </Field>
            <Field label={t('preferences.locale')}>
              <select
                value={locale}
                onChange={(e) => setLocale(e.target.value as 'en' | 'tr')}
                className='input-field w-auto'
              >
                {availableLocales.map((l) => (
                  <option key={l} value={l}>{l === 'en' ? 'English' : 'Türkçe'}</option>
                ))}
              </select>
            </Field>
          </div>
        </Section>

        {prefs && (
          <Section title={t('preferences.title')}>
            <div className='space-y-3'>
              <Field label={t('preferences.unitSystem')}>
                <select
                  value={prefs.unitSystem}
                  onChange={(e) =>
                    setPrefs({ ...prefs, unitSystem: e.target.value as 'metric' | 'imperial' })}
                  className='input-field w-auto'
                >
                  <option value='metric'>{t('settings.unitSystem.metric')}</option>
                  <option value='imperial'>{t('settings.unitSystem.imperial')}</option>
                </select>
              </Field>
              <Field label={t('preferences.temperature')}>
                <select
                  value={prefs.temperatureUnit}
                  onChange={(e) =>
                    setPrefs({
                      ...prefs,
                      temperatureUnit: e.target.value as 'celsius' | 'fahrenheit',
                    })}
                  className='input-field w-auto'
                >
                  <option value='celsius'>{t('settings.temperatureUnit.celsius')}</option>
                  <option value='fahrenheit'>{t('settings.temperatureUnit.fahrenheit')}</option>
                </select>
              </Field>
              <Field label={t('preferences.dateFormat')}>
                <select
                  value={prefs.dateFormat}
                  onChange={(e) =>
                    setPrefs({
                      ...prefs,
                      dateFormat: e.target.value as UserPreferences['dateFormat'],
                    })}
                  className='input-field w-auto'
                >
                  <option value='YYYY_MM_DD'>YYYY-MM-DD</option>
                  <option value='DD_MM_YYYY'>DD/MM/YYYY</option>
                  <option value='MM_DD_YYYY'>MM/DD/YYYY</option>
                </select>
              </Field>
              <button
                type='button'
                onClick={savePreferences}
                className='btn-primary'
                disabled={saving}
              >
                {saving ? t('settings.saving') : t('settings.savePreferences')}
              </button>
            </div>
          </Section>
        )}

        {prefs && (
          <Section title={t('settings.emailNotifications')}>
            <div className='space-y-3'>
              <NotificationToggle
                label={t('settings.notif.newFollower')}
                checked={prefs.emailNotifications.newFollower}
                onChange={(v) =>
                  setPrefs({
                    ...prefs,
                    emailNotifications: { ...prefs.emailNotifications, newFollower: v },
                  })}
              />
              <NotificationToggle
                label={t('settings.notif.recipeLiked')}
                checked={prefs.emailNotifications.recipeLiked}
                onChange={(v) =>
                  setPrefs({
                    ...prefs,
                    emailNotifications: { ...prefs.emailNotifications, recipeLiked: v },
                  })}
              />
              <NotificationToggle
                label={t('settings.notif.recipeCommented')}
                checked={prefs.emailNotifications.recipeCommented}
                onChange={(v) =>
                  setPrefs({
                    ...prefs,
                    emailNotifications: { ...prefs.emailNotifications, recipeCommented: v },
                  })}
              />
              <NotificationToggle
                label={t('settings.notif.followedUserPosted')}
                checked={prefs.emailNotifications.followedUserPosted}
                onChange={(v) =>
                  setPrefs({
                    ...prefs,
                    emailNotifications: { ...prefs.emailNotifications, followedUserPosted: v },
                  })}
              />
              <NotificationToggle
                label={t('settings.notif.mentionedInComment')}
                checked={prefs.emailNotifications.mentionedInComment}
                onChange={(v) =>
                  setPrefs({
                    ...prefs,
                    emailNotifications: { ...prefs.emailNotifications, mentionedInComment: v },
                  })}
              />
            </div>
            <button
              type='button'
              onClick={savePreferences}
              className='btn-primary mt-4'
              disabled={saving}
            >
              {saving ? t('settings.saving') : t('settings.saveNotifications')}
            </button>
          </Section>
        )}

        <div className='card' style={{ borderColor: 'var(--error)' }}>
          <h2 className='font-semibold mb-2' style={{ color: 'var(--error)' }}>
            {t('settings.dangerZone')}
          </h2>
          <p className='text-sm mb-3' style={{ color: 'var(--text-secondary)' }}>
            {t('settings.dangerZoneDesc')}
          </p>
          <button
            type='button'
            onClick={handleDeleteAccount}
            className='btn-danger text-sm'
          >
            {t('settings.deleteAccountBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}

function NotificationToggle(
  { label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void },
) {
  return (
    <label className='flex items-center gap-3 cursor-pointer'>
      <input
        type='checkbox'
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className='w-4 h-4'
      />
      <span className='text-sm' style={{ color: 'var(--text-primary)' }}>{label}</span>
    </label>
  );
}
