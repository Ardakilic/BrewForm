/**
 * BrewForm Admin Taste Notes Page
 */

import { useStyletron } from 'baseui';
import { HeadingLarge, ParagraphMedium } from 'baseui/typography';
import { Notification, KIND } from 'baseui/notification';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';

function AdminTasteNotesPage() {
  const [, theme] = useStyletron();
  const { t } = useTranslation();

  return (
    <>
      <Helmet>
        <title>{t('admin.tasteNotes.title')}</title>
      </Helmet>

      <HeadingLarge marginBottom="24px">{t('admin.tasteNotes.heading')}</HeadingLarge>
      
      <Notification kind={KIND.warning} closeable={false}>
        <strong>{t('common.important')}:</strong> {t('admin.tasteNotes.cacheWarning')}
      </Notification>

      <ParagraphMedium 
        color={theme.colors.contentSecondary}
        marginTop="24px"
      >
        {t('admin.tasteNotes.comingSoon')}
      </ParagraphMedium>

      <ParagraphMedium color={theme.colors.contentSecondary}>
        {t('admin.tasteNotes.plannedFeatures')}
      </ParagraphMedium>
      <ul style={{ color: theme.colors.contentSecondary, marginLeft: '20px' }}>
        <li>{t('admin.tasteNotes.features.view')}</li>
        <li>{t('admin.tasteNotes.features.add')}</li>
        <li>{t('admin.tasteNotes.features.edit')}</li>
        <li>{t('admin.tasteNotes.features.delete')}</li>
        <li>{t('admin.tasteNotes.features.flushCache')}</li>
        <li>{t('admin.tasteNotes.features.reimport')}</li>
      </ul>
    </>
  );
}

export default AdminTasteNotesPage;
