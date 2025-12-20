/**
 * BrewForm Admin Users Page
 */

import { useStyletron } from 'baseui';
import { HeadingLarge, ParagraphMedium } from 'baseui/typography';
import { Helmet } from 'react-helmet-async';

function AdminUsersPage() {
  const [, theme] = useStyletron();

  return (
    <>
      <Helmet>
        <title>Manage Users - Admin - BrewForm</title>
      </Helmet>

      <HeadingLarge marginBottom="24px">Manage Users</HeadingLarge>
      <ParagraphMedium color={theme.colors.contentSecondary}>
        User management functionality coming soon.
      </ParagraphMedium>
    </>
  );
}

export default AdminUsersPage;
