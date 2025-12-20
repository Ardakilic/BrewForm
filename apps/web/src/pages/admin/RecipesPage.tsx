/**
 * BrewForm Admin Recipes Page
 */

import { useStyletron } from 'baseui';
import { HeadingLarge, ParagraphMedium } from 'baseui/typography';
import { Helmet } from 'react-helmet-async';

function AdminRecipesPage() {
  const [, theme] = useStyletron();

  return (
    <>
      <Helmet>
        <title>Manage Recipes - Admin - BrewForm</title>
      </Helmet>

      <HeadingLarge marginBottom="24px">Manage Recipes</HeadingLarge>
      <ParagraphMedium color={theme.colors.contentSecondary}>
        Recipe moderation functionality coming soon.
      </ParagraphMedium>
    </>
  );
}

export default AdminRecipesPage;
