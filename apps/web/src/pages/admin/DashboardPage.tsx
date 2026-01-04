/**
 * BrewForm Admin Dashboard Page
 */

import { Link } from 'react-router-dom';
import { useStyletron } from 'baseui';
import { Card } from 'baseui/card';
import { HeadingLarge, HeadingMedium, ParagraphMedium } from 'baseui/typography';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';

function AdminDashboard() {
  const [css, theme] = useStyletron();
  const { t } = useTranslation();

  return (
    <>
      <Helmet>
        <title>{t('admin.dashboard.title')}</title>
      </Helmet>

      <HeadingLarge marginBottom="24px">{t('admin.dashboard.heading')}</HeadingLarge>

      <div className={css({ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '24px' })}>
        <Link to="/admin/users" className={css({ textDecoration: 'none' })}>
          <Card>
            <div className={css({ fontSize: '32px', marginBottom: '8px' })}>👥</div>
            <HeadingMedium>{t('admin.dashboard.cards.users.title')}</HeadingMedium>
            <ParagraphMedium color={theme.colors.contentSecondary}>
              {t('admin.dashboard.cards.users.description')}
            </ParagraphMedium>
          </Card>
        </Link>

        <Link to="/admin/recipes" className={css({ textDecoration: 'none' })}>
          <Card>
            <div className={css({ fontSize: '32px', marginBottom: '8px' })}>📝</div>
            <HeadingMedium>{t('admin.dashboard.cards.recipes.title')}</HeadingMedium>
            <ParagraphMedium color={theme.colors.contentSecondary}>
              {t('admin.dashboard.cards.recipes.description')}
            </ParagraphMedium>
          </Card>
        </Link>

        <Link to="/admin/equipment" className={css({ textDecoration: 'none' })}>
          <Card>
            <div className={css({ fontSize: '32px', marginBottom: '8px' })}>⚙️</div>
            <HeadingMedium>{t('admin.dashboard.cards.equipment.title')}</HeadingMedium>
            <ParagraphMedium color={theme.colors.contentSecondary}>
              {t('admin.dashboard.cards.equipment.description')}
            </ParagraphMedium>
          </Card>
        </Link>
      </div>
    </>
  );
}

export default AdminDashboard;
