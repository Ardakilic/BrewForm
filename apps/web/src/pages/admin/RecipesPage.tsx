/**
 * BrewForm Admin Recipes Page
 */

import { useStyletron } from 'baseui';
import { HeadingLarge, ParagraphMedium } from 'baseui/typography';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';

function AdminRecipesPage() {
  const [, theme] = useStyletron();
  const { t } = useTranslation();

  return (
    <>
      <Helmet>
        <title>{t('admin.recipes.title')}</title>
      </Helmet>

      <HeadingLarge marginBottom="24px">{t('admin.recipes.heading')}</HeadingLarge>
      <ParagraphMedium color={theme.colors.contentSecondary}>
        {t('admin.recipes.comingSoon')}
      </ParagraphMedium>
    </>
  );
}

export default AdminRecipesPage;
