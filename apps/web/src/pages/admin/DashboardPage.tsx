/**
 * BrewForm Admin Dashboard Page
 */

import { Link } from 'react-router-dom';
import { useStyletron } from 'baseui';
import { Card } from 'baseui/card';
import { HeadingLarge, HeadingMedium, ParagraphMedium } from 'baseui/typography';
import { Helmet } from 'react-helmet-async';

function AdminDashboard() {
  const [css, theme] = useStyletron();

  return (
    <>
      <Helmet>
        <title>Admin Dashboard - BrewForm</title>
      </Helmet>

      <HeadingLarge marginBottom="24px">Admin Dashboard</HeadingLarge>

      <div className={css({ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '24px' })}>
        <Link to="/admin/users" className={css({ textDecoration: 'none' })}>
          <Card>
            <div className={css({ fontSize: '32px', marginBottom: '8px' })}>👥</div>
            <HeadingMedium>Users</HeadingMedium>
            <ParagraphMedium color={theme.colors.contentSecondary}>
              Manage user accounts, roles, and bans
            </ParagraphMedium>
          </Card>
        </Link>

        <Link to="/admin/recipes" className={css({ textDecoration: 'none' })}>
          <Card>
            <div className={css({ fontSize: '32px', marginBottom: '8px' })}>📝</div>
            <HeadingMedium>Recipes</HeadingMedium>
            <ParagraphMedium color={theme.colors.contentSecondary}>
              Review and moderate recipe content
            </ParagraphMedium>
          </Card>
        </Link>

        <Link to="/admin/equipment" className={css({ textDecoration: 'none' })}>
          <Card>
            <div className={css({ fontSize: '32px', marginBottom: '8px' })}>⚙️</div>
            <HeadingMedium>Equipment</HeadingMedium>
            <ParagraphMedium color={theme.colors.contentSecondary}>
              Manage equipment, vendors, and coffees
            </ParagraphMedium>
          </Card>
        </Link>
      </div>
    </>
  );
}

export default AdminDashboard;
