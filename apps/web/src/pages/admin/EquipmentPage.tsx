/**
 * BrewForm Admin Equipment Page
 */

import { useStyletron } from 'baseui';
import { HeadingLarge, ParagraphMedium } from 'baseui/typography';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';

function AdminEquipmentPage() {
  const [, theme] = useStyletron();
  const { t } = useTranslation();

  return (
    <>
      <Helmet>
        <title>{t('admin.equipment.title')}</title>
      </Helmet>

      <HeadingLarge marginBottom="24px">{t('admin.equipment.heading')}</HeadingLarge>
      <ParagraphMedium color={theme.colors.contentSecondary}>
        {t('admin.equipment.comingSoon')}
      </ParagraphMedium>
    </>
  );
}

export default AdminEquipmentPage;
