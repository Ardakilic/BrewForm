import type { UserPreferences } from '@brewform/shared/schemas';
import { useEffect, useState } from 'react';
import { useFetcher, useLoaderData } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { Field } from '../../components/form/Field.tsx';
import { Section } from '../../components/form/Section.tsx';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { ErrorState } from '../../components/ui/ErrorState.tsx';
import { useConfirm } from '../../components/ui/Modal.tsx';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useTheme } from '../../contexts/ThemeContext.tsx';
import { useActionFeedback } from '../../hooks/useActionFeedback.ts';
import { useSignOut } from '../../hooks/useSignOut.ts';
import type { action, loader, SettingsActionInput } from './SettingsPage.data.ts';

const log = createLogger('SettingsPage');

/**
 * Account settings page: read-only profile info, theme/locale pickers,
 * unit/timezone/date-format and email-notification preferences, plus account deletion.
 * Preferences come from the route loader; saving and deleting submit the `save-preferences`
 * and `delete-account` intents to the route action (`SettingsPage.data.ts`) through a fetcher
 * that does not revalidate the page, and the result drives the shared banner. A successful
 * deletion signs out through `useSignOut` and lands on `/`.
 */
export function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const signOut = useSignOut();
  const { theme, setTheme } = useTheme();
  const { locale, setLocale, availableLocales, t } = useTranslation();
  const { confirm } = useConfirm();
  const { preferences } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [prefs, setPrefs] = useState<UserPreferences>(preferences);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | null>(null);
  const submittedIntent = (fetcher.json as SettingsActionInput | undefined)?.intent;
  const saving = fetcher.state !== 'idle' && submittedIntent === 'save-preferences';

  useEffect(() => {
    log.debug({}, 'SettingsPage mounted');
    return () => {
      log.debug({}, 'SettingsPage unmounted');
    };
  }, []);

  useActionFeedback(fetcher, {
    onSuccess: (data) => {
      if (data.intent === 'save-preferences') {
        setMessage(t('settings.savedMsg'));
        setMessageType('success');
        void refreshAfterSave();
      } else {
        void finishDeletion();
      }
    },
    onError: (data) => {
      if (data.intent === 'save-preferences') {
        setMessage(t('settings.failedMsg'));
        void refreshAfterSave();
      } else {
        setMessage(t('settings.deleteFailed'));
      }
      setMessageType('error');
    },
  });

  /**
   * Refresh the local user state after a save attempt, independently of the save result:
   * the preferences are already persisted, so a failed read-after-write refresh must not log
   * the user out or change the save banner.
   */
  async function refreshAfterSave() {
    try {
      await refreshUser();
    } catch (err) {
      log.error({ err }, 'savePreferences refresh failed');
    }
  }

  /**
   * After the account is deleted: sign out through `useSignOut` (the server-side logout, which
   * may fail, then a `replace` navigation to the public home page, then the user is cleared), so
   * the guarded settings page never bounces to `/login`.
   */
  async function finishDeletion() {
    await signOut();
  }

  /** Submit the `save-preferences` intent with the current form state. */
  function savePreferences() {
    if (!prefs) return;
    setMessage('');
    setMessageType(null);
    fetcher.submit(
      { intent: 'save-preferences', preferences: prefs },
      { method: 'post', encType: 'application/json', defaultShouldRevalidate: false },
    );
  }

  /**
   * Confirm, then submit the `delete-account` intent. A failure keeps the user signed in and
   * shows the shared error banner so they can retry.
   */
  async function handleDeleteAccount() {
    if (
      !(await confirm({
        titleKey: 'common.confirmDelete',
        bodyKey: 'settings.deleteConfirm',
        danger: true,
      }))
    )
      return;
    setMessage('');
    setMessageType(null);
    fetcher.submit(
      { intent: 'delete-account' },
      { method: 'post', encType: 'application/json', defaultShouldRevalidate: false },
    );
  }

  if (!user) return null;

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <SEOHead title={t('settings.title')} />

      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
        {t('settings.title')}
      </h1>

      {message &&
        (messageType === 'error' ? (
          <ErrorState message={message} className="mb-4" />
        ) : (
          <div
            className="mb-4 rounded p-3 text-sm"
            style={{ backgroundColor: 'var(--success)', color: 'white' }}
          >
            {message}
          </div>
        ))}

      <div className="space-y-6">
        <Section title={t('settings.profile')}>
          <div className="space-y-3">
            <Field label={t('settings.displayName')}>
              <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                {user.displayName || t('settings.notSet')}
              </span>
            </Field>
            <Field label={t('auth.username')}>
              <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                @{user.username}
              </span>
            </Field>
            <Field label={t('auth.email')}>
              <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                {user.email}
              </span>
            </Field>
          </div>
        </Section>

        <Section title={t('settings.appearance')}>
          <div className="space-y-3">
            <Field label={t('preferences.theme')}>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'coffee')}
                className="input-field w-auto"
              >
                <option value="light">{t('theme.light')}</option>
                <option value="dark">{t('theme.dark')}</option>
                <option value="coffee">{t('theme.coffee')}</option>
              </select>
            </Field>
            <Field label={t('preferences.locale')}>
              <select
                value={locale}
                onChange={(e) => setLocale(e.target.value as 'en' | 'tr')}
                className="input-field w-auto"
              >
                {availableLocales.map((l) => (
                  <option key={l} value={l}>
                    {l === 'en' ? 'English' : 'Türkçe'}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Section>

        {prefs && (
          <Section title={t('preferences.title')}>
            <div className="space-y-3">
              <Field label={t('preferences.unitSystem')}>
                <select
                  value={prefs.unitSystem}
                  onChange={(e) =>
                    setPrefs({ ...prefs, unitSystem: e.target.value as 'metric' | 'imperial' })
                  }
                  className="input-field w-auto"
                >
                  <option value="metric">{t('settings.unitSystem.metric')}</option>
                  <option value="imperial">{t('settings.unitSystem.imperial')}</option>
                </select>
              </Field>
              <Field label={t('preferences.temperature')}>
                <select
                  value={prefs.temperatureUnit}
                  onChange={(e) =>
                    setPrefs({
                      ...prefs,
                      temperatureUnit: e.target.value as 'celsius' | 'fahrenheit',
                    })
                  }
                  className="input-field w-auto"
                >
                  <option value="celsius">{t('settings.temperatureUnit.celsius')}</option>
                  <option value="fahrenheit">{t('settings.temperatureUnit.fahrenheit')}</option>
                </select>
              </Field>
              <Field label={t('preferences.dateFormat')}>
                <select
                  value={prefs.dateFormat}
                  onChange={(e) =>
                    setPrefs({
                      ...prefs,
                      dateFormat: e.target.value as UserPreferences['dateFormat'],
                    })
                  }
                  className="input-field w-auto"
                >
                  <option value="YYYY_MM_DD">YYYY-MM-DD</option>
                  <option value="DD_MM_YYYY">DD/MM/YYYY</option>
                  <option value="MM_DD_YYYY">MM/DD/YYYY</option>
                </select>
              </Field>
              <button
                type="button"
                onClick={savePreferences}
                className="btn-primary"
                disabled={saving}
              >
                {saving ? t('settings.saving') : t('settings.savePreferences')}
              </button>
            </div>
          </Section>
        )}

        {prefs && (
          <Section title={t('settings.notifications')}>
            <div className="space-y-3">
              <NotificationToggle
                label={t('settings.notif.newFollower')}
                checked={prefs.notifyNewFollower}
                onChange={(v) => setPrefs({ ...prefs, notifyNewFollower: v })}
              />
              <NotificationToggle
                label={t('settings.notif.recipeLiked')}
                checked={prefs.notifyRecipeLiked}
                onChange={(v) => setPrefs({ ...prefs, notifyRecipeLiked: v })}
              />
              <NotificationToggle
                label={t('settings.notif.recipeCommented')}
                checked={prefs.notifyRecipeCommented}
                onChange={(v) => setPrefs({ ...prefs, notifyRecipeCommented: v })}
              />
              <NotificationToggle
                label={t('settings.notif.followedUserPosted')}
                checked={prefs.notifyFollowedUserPosted}
                onChange={(v) => setPrefs({ ...prefs, notifyFollowedUserPosted: v })}
              />
              <NotificationToggle
                label={t('settings.notif.mentionedInComment')}
                checked={prefs.notifyMentionedInComment}
                onChange={(v) => setPrefs({ ...prefs, notifyMentionedInComment: v })}
              />
            </div>
            <button
              type="button"
              onClick={savePreferences}
              className="btn-primary mt-4"
              disabled={saving}
            >
              {saving ? t('settings.saving') : t('settings.saveNotifications')}
            </button>
          </Section>
        )}

        <div className="card" style={{ borderColor: 'var(--error)' }}>
          <h2 className="font-semibold mb-2" style={{ color: 'var(--error)' }}>
            {t('settings.dangerZone')}
          </h2>
          <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
            {t('settings.dangerZoneDesc')}
          </p>
          <button type="button" onClick={handleDeleteAccount} className="btn-danger text-sm">
            {t('settings.deleteAccountBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** One labelled notification checkbox. */
function NotificationToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4"
      />
      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
        {label}
      </span>
    </label>
  );
}
