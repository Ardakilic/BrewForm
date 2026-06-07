import { useEffect, useState } from 'react';
import { useLoaderData } from 'react-router';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTheme } from '../../contexts/ThemeContext.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { api } from '../../api/client.ts';
import { createLogger } from '@/utils/logger.ts';

interface Preferences {
  unitSystem: 'metric' | 'imperial';
  temperatureUnit: 'celsius' | 'fahrenheit';
  locale: string;
  timezone: string;
  dateFormat: string;
  emailNotifications: {
    newFollower: boolean;
    recipeLiked: boolean;
    recipeCommented: boolean;
    followedUserPosted: boolean;
  };
}

const log = createLogger('SettingsPage');

export const loader = async () => {
  const preferences = await api.get<Preferences>('/preferences');
  return { preferences };
};

export function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const { locale, setLocale, availableLocales, t } = useTranslation();
  const { preferences } = useLoaderData<typeof loader>();
  const [prefs, setPrefs] = useState<Preferences>(preferences);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

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
    try {
      await api.patch('/preferences', {
        unitSystem: prefs.unitSystem,
        temperatureUnit: prefs.temperatureUnit,
        locale: prefs.locale,
        timezone: prefs.timezone,
        dateFormat: prefs.dateFormat,
        emailNotifications: prefs.emailNotifications,
      } as Record<string, unknown>);
      setMessage(t('settings.savedMsg'));
    } catch {
      setMessage(t('settings.failedMsg'));
    } finally {
      setSaving(false);
    }
    // Refresh user state independently from save success/failure.
    // Preferences are already persisted in the DB — a failed read-after-write
    // refresh should not log the user out or affect the save UI message.
    try {
      await refreshUser();
    } catch {
      log.error(
        { err: 'refreshUser failed after preferences save' },
        'savePreferences refresh failed',
      );
    }
  }

  async function handleDeleteAccount() {
    if (!globalThis.confirm(t('settings.deleteConfirm'))) return;
    try {
      await api.delete('/users/me');
    } catch {
    }
  }

  if (!user) return null;

  useEffect(() => {
    log.debug({}, 'SettingsPage mounted');
    return () => {
      log.debug({}, 'SettingsPage unmounted');
    };
  }, []);

  return (
    <div className='mx-auto max-w-2xl px-6 py-8'>
      <SEOHead title={t('settings.title')} />

      <h1 className='text-2xl font-bold mb-6' style={{ color: 'var(--text-primary)' }}>
        {t('settings.title')}
      </h1>

      {message && (
        <div
          className='mb-4 rounded p-3 text-sm'
          style={{
            backgroundColor: message.includes('Failed') || message.includes('kaydedilemedi')
              ? 'var(--error)'
              : 'var(--success)',
            color: 'white',
          }}
        >
          {message}
        </div>
      )}

      <div className='space-y-6'>
        <div className='card'>
          <h2 className='font-semibold mb-4' style={{ color: 'var(--text-primary)' }}>
            {t('settings.profile')}
          </h2>
          <div className='space-y-3'>
            <div>
              <label
                className='block text-sm font-medium mb-1'
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('settings.displayName')}
              </label>
              <span className='text-sm' style={{ color: 'var(--text-primary)' }}>
                {user.displayName || t('settings.notSet')}
              </span>
            </div>
            <div>
              <label
                className='block text-sm font-medium mb-1'
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('auth.username')}
              </label>
              <span className='text-sm' style={{ color: 'var(--text-primary)' }}>
                @{user.username}
              </span>
            </div>
            <div>
              <label
                className='block text-sm font-medium mb-1'
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('auth.email')}
              </label>
              <span className='text-sm' style={{ color: 'var(--text-primary)' }}>{user.email}</span>
            </div>
          </div>
        </div>

        <div className='card'>
          <h2 className='font-semibold mb-4' style={{ color: 'var(--text-primary)' }}>
            {t('settings.appearance')}
          </h2>
          <div className='space-y-3'>
            <div>
              <label
                className='block text-sm font-medium mb-1'
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('preferences.theme')}
              </label>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'coffee')}
                className='input-field w-auto'
              >
                <option value='light'>{t('theme.light')}</option>
                <option value='dark'>{t('theme.dark')}</option>
                <option value='coffee'>{t('theme.coffee')}</option>
              </select>
            </div>
            <div>
              <label
                className='block text-sm font-medium mb-1'
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('preferences.locale')}
              </label>
              <select
                value={locale}
                onChange={(e) => setLocale(e.target.value as 'en' | 'tr')}
                className='input-field w-auto'
              >
                {availableLocales.map((l) => (
                  <option key={l} value={l}>{l === 'en' ? 'English' : 'Türkçe'}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {prefs && (
          <div className='card'>
            <h2 className='font-semibold mb-4' style={{ color: 'var(--text-primary)' }}>
              {t('preferences.title')}
            </h2>
            <div className='space-y-3'>
              <div>
                <label
                  className='block text-sm font-medium mb-1'
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {t('preferences.unitSystem')}
                </label>
                <select
                  value={prefs.unitSystem}
                  onChange={(e) =>
                    setPrefs({ ...prefs, unitSystem: e.target.value as 'metric' | 'imperial' })}
                  className='input-field w-auto'
                >
                  <option value='metric'>{t('settings.unitSystem.metric')}</option>
                  <option value='imperial'>{t('settings.unitSystem.imperial')}</option>
                </select>
              </div>
              <div>
                <label
                  className='block text-sm font-medium mb-1'
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {t('preferences.temperature')}
                </label>
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
              </div>
              <div>
                <label
                  className='block text-sm font-medium mb-1'
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {t('preferences.dateFormat')}
                </label>
                <select
                  value={prefs.dateFormat}
                  onChange={(e) => setPrefs({ ...prefs, dateFormat: e.target.value })}
                  className='input-field w-auto'
                >
                  <option value='YYYY_MM_DD'>YYYY-MM-DD</option>
                  <option value='DD_MM_YYYY'>DD/MM/YYYY</option>
                  <option value='MM_DD_YYYY'>MM/DD/YYYY</option>
                </select>
              </div>
              <button
                type='button'
                onClick={savePreferences}
                className='btn-primary'
                disabled={saving}
              >
                {saving ? t('settings.saving') : t('settings.savePreferences')}
              </button>
            </div>
          </div>
        )}

        {prefs && (
          <div className='card'>
            <h2 className='font-semibold mb-4' style={{ color: 'var(--text-primary)' }}>
              {t('settings.emailNotifications')}
            </h2>
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
            </div>
            <button
              type='button'
              onClick={savePreferences}
              className='btn-primary mt-4'
              disabled={saving}
            >
              {saving ? t('settings.saving') : t('settings.saveNotifications')}
            </button>
          </div>
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
            className='text-sm px-4 py-2 rounded'
            style={{ backgroundColor: 'var(--error)', color: 'white' }}
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
