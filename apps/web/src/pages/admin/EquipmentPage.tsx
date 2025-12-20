/**
 * BrewForm Admin Equipment Page
 */

import { useStyletron } from 'baseui';
import { HeadingLarge, ParagraphMedium } from 'baseui/typography';
import { Helmet } from 'react-helmet-async';

function AdminEquipmentPage() {
  const [, theme] = useStyletron();

  return (
    <>
      <Helmet>
        <title>Manage Equipment - Admin - BrewForm</title>
      </Helmet>

      <HeadingLarge marginBottom="24px">Manage Equipment</HeadingLarge>
      <ParagraphMedium color={theme.colors.contentSecondary}>
        Equipment, vendor, and coffee management coming soon.
      </ParagraphMedium>
    </>
  );
}

export default AdminEquipmentPage;
