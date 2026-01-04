/**
 * BrewForm Admin Users Page
 */

import { useStyletron } from 'baseui';
import { HeadingLarge, ParagraphMedium } from 'baseui/typography';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';

function AdminUsersPage() {
  const [, theme] = useStyletron();
  const { t } = useTranslation();

  return (
    <>
      <Helmet>
        <title>{t('admin.users.title')}</title>
      </Helmet>

      <HeadingLarge marginBottom="24px">{t('admin.users.heading')}</HeadingLarge>
      <ParagraphMedium color={theme.colors.contentSecondary}>
        {t('admin.users.comingSoon')}
      </ParagraphMedium>
    </>
  );
}

export default AdminUsersPage;
