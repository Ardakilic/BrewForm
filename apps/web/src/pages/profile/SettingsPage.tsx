/**
 * BrewForm Settings Page
 */

import { useState } from 'react';
import { useStyletron } from 'baseui';
import { Card } from 'baseui/card';
import { FormControl } from 'baseui/form-control';
import { Input } from 'baseui/input';
import { Textarea } from 'baseui/textarea';
import { Select } from 'baseui/select';
import { Button } from 'baseui/button';
import { HeadingLarge, HeadingMedium } from 'baseui/typography';
import { Notification, KIND } from 'baseui/notification';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import useSWR from 'swr';
import { api } from '../../utils/api';
import { useTheme, type ThemeMode } from '../../contexts/ThemeContext';
import LoadingSpinner from '../../components/LoadingSpinner';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

const THEME_OPTIONS = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'coffee', label: 'Coffee' },
  { id: 'system', label: 'System' },
];

const UNIT_OPTIONS = [
  { id: 'METRIC', label: 'Metric (g, ml, °C)' },
  { id: 'IMPERIAL', label: 'Imperial (oz, fl oz, °F)' },
];

function SettingsPage() {
  const [css, theme] = useStyletron();
  const { t } = useTranslation();
  const { themeMode, setThemeMode } = useTheme();

  const { data: profile, isLoading, mutate } = useSWR('/users/me', fetcher);

  const [formData, setFormData] = useState({
    displayName: profile?.displayName || '',
    bio: profile?.bio || '',
    website: profile?.website || '',
    preferredUnits: profile?.preferredUnits || 'METRIC',
  });

  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [field]: e.target.value });
  };

  const handleThemeChange = (params: { value: { id: string }[] }) => {
    if (params.value[0]) {
      setThemeMode(params.value[0].id as ThemeMode);
    }
  };

  const handleUnitsChange = (params: { value: { id: string }[] }) => {
    if (params.value[0]) {
      setFormData({ ...formData, preferredUnits: params.value[0].id });
    }
  };

  const handleSave = async () => {
    setError('');
    setSuccess(false);
    setIsSaving(true);

    try {
      const response = await api.patch('/users/me', {
        displayName: formData.displayName || undefined,
        bio: formData.bio || undefined,
        website: formData.website || undefined,
        preferredUnits: formData.preferredUnits,
      });

      if (response.success) {
        setSuccess(true);
        mutate();
      } else {
        setError(response.error?.message || 'Failed to update profile');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <>
      <Helmet>
        <title>Settings - BrewForm</title>
      </Helmet>

      <div className={css({ maxWidth: '600px', margin: '0 auto' })}>
        <HeadingLarge marginBottom="24px">{t('settings.title')}</HeadingLarge>

        {/* Profile Settings */}
        <Card>
          <HeadingMedium marginBottom="16px">{t('settings.profile')}</HeadingMedium>

          {success && (
            <Notification kind={KIND.positive} closeable={false}>
              Profile updated successfully!
            </Notification>
          )}

          {error && (
            <Notification kind={KIND.negative} closeable={false}>
              {error}
            </Notification>
          )}

          <FormControl label="Display Name">
            <Input
              value={formData.displayName}
              onChange={handleChange('displayName')}
              placeholder={profile?.username}
            />
          </FormControl>

          <FormControl label="Bio">
            <Textarea
              value={formData.bio}
              onChange={handleChange('bio')}
              placeholder="Tell us about yourself..."
            />
          </FormControl>

          <FormControl label="Website">
            <Input
              type="url"
              value={formData.website}
              onChange={handleChange('website')}
              placeholder="https://..."
            />
          </FormControl>

          <Button onClick={handleSave} isLoading={isSaving}>
            {t('common.save')}
          </Button>
        </Card>

        {/* Preferences */}
        <Card overrides={{ Root: { style: { marginTop: '24px' } } }}>
          <HeadingMedium marginBottom="16px">{t('settings.preferences')}</HeadingMedium>

          <FormControl label={t('settings.theme')}>
            <Select
              options={THEME_OPTIONS}
              value={THEME_OPTIONS.filter((o) => o.id === themeMode)}
              onChange={handleThemeChange}
            />
          </FormControl>

          <FormControl label={t('settings.units')}>
            <Select
              options={UNIT_OPTIONS}
              value={UNIT_OPTIONS.filter((o) => o.id === formData.preferredUnits)}
              onChange={handleUnitsChange}
            />
          </FormControl>
        </Card>

        {/* Danger Zone */}
        <Card overrides={{ Root: { style: { marginTop: '24px', borderColor: '#dc3545' } } }}>
          <HeadingMedium marginBottom="8px" color="#dc3545">
            {t('settings.deleteAccount')}
          </HeadingMedium>
          <p className={css({ color: theme.colors.contentSecondary, marginBottom: '16px' })}>
            {t('settings.deleteWarning')}
          </p>
          <Button kind="secondary" overrides={{ BaseButton: { style: { color: '#dc3545' } } }}>
            {t('settings.deleteAccount')}
          </Button>
        </Card>
      </div>
    </>
  );
}

export default SettingsPage;
